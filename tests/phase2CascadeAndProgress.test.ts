/**
 * Phase 2（T8 + T9）单元测试：
 * - T8：父任务拖拽原子顺延（vault.process 单次原子写回、缩进保留、单边拉伸不触发、一键撤销）
 * - T9：树形递归完成率统计（completedTaskCount / leafTaskCount / progressRatio）与进度填充路径几何
 */
import { TFile } from 'obsidian';
import { parseTasksFromContent } from '../src/tasks/taskParser/main';
import { collectDescendantTasks, shiftTaskDatesAtomically } from '../src/tasks/taskUpdater';
import { taskUndo } from '../src/tasks/taskUndo';
import { TaskUpdateHandler } from '../src/gantt/handlers/taskUpdateHandler';
import { buildGanttTree } from '../src/gantt/treeBuilder';
import { buildRollupBracketPath, buildRollupProgressPath } from '../src/gantt/wrappers/rollupGeometry';
import { PLUGIN_ID } from '../src/constants';
import type { GCTask, IPluginContext } from '../src/types';
import type { GanttChartTask } from '../src/gantt/types';

function createAtomicVaultMock(initialFiles: Record<string, string>, globalTaskFilter = '') {
	const files: Record<string, string> = { ...initialFiles };
	const fileObjs = new Map<string, TFile>();
	for (const path of Object.keys(files)) {
		const f = new TFile() as TFile & { extension: string; basename: string };
		f.path = path;
		f.extension = 'md';
		f.basename = (path.split('/').pop() || '').replace(/\.md$/, '');
		fileObjs.set(path, f);
	}

	const modifySpy = jest.fn(async (file: { path: string }, nextContent: string) => {
		files[file.path] = nextContent;
	});

	const processSpy = jest.fn(async (file: { path: string }, fn: (data: string) => string) => {
		const next = fn(files[file.path]);
		files[file.path] = next;
		return next;
	});

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => fileObjs.get(path) ?? null,
			read: async (file: { path: string }) => files[file.path],
			modify: modifySpy,
			process: processSpy,
		},
		plugins: {
			getPlugin: (id: string) => (id === PLUGIN_ID
				? { settings: { globalTaskFilter } }
				: null),
		},
	} as never;

	return { app, files, modifySpy, processSpy };
}

describe('T8 父任务拖拽原子顺延与撤销', () => {
	const filePath = 'Projects/产品Alpha/Item-10.md';
	const originalDoc = [
		'## 节点排期',
		'- [ ] 验证阶段1 🛫 2026-09-10 📅 2026-09-20',
		'  - [ ] 集成联调 🛫 2026-09-10 📅 2026-09-15',
		'    - [ ] 细节核对 📅 2026-09-12',
		'  - [ ] 无日期子检查项',
		'  - [ ] 验收评审 🛫 2026-09-16 📅 2026-09-20',
		'- [ ] 独立后续阶段 🛫 2026-10-01 📅 2026-10-05',
	].join('\n');

	it('开启联动开关平移父任务 +5 天：通过单次 vault.process 原子更新父与全部带日期后代，且支持一键撤销', async () => {
		const { app, files, processSpy, modifySpy } = createAtomicVaultMock({ [filePath]: originalDoc });
		const parsed = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, originalDoc, ['tasks', 'dataview']);
		const parentTask = parsed[0];
		expect(collectDescendantTasks(parentTask, parsed).map((t) => t.description)).toEqual([
			'集成联调',
			'细节核对',
			'无日期子检查项',
			'验收评审',
		]);

		const plugin = {
			settings: {
				enabledTaskFormats: ['tasks', 'dataview'],
				ganttCascadeParentDrag: true,
			},
		} as unknown as IPluginContext;
		const handler = new TaskUpdateHandler(app, plugin);

		const ganttParent: GanttChartTask = {
			id: 'task:parent',
			name: parentTask.description,
			start: '2026-09-10',
			end: '2026-09-20',
			progress: 0,
			filePath: parentTask.filePath,
			fileName: parentTask.fileName,
			lineNumber: parentTask.lineNumber,
			content: parentTask.content,
			description: parentTask.description,
			format: parentTask.format,
			priority: parentTask.priority,
			startDate: parentTask.startDate,
			dueDate: parentTask.dueDate,
			treeNodeType: 'task',
			isRollupBar: false,
		};

		// 整体平移 +5 天：09-10~09-20 → 09-15~09-25
		await handler.handleDateChange(
			ganttParent,
			new Date(2026, 8, 15),
			new Date(2026, 8, 25),
			'startDate',
			'dueDate',
			parsed
		);

		// 严格单次 vault.process 原子写回，不走单行 modify
		expect(processSpy).toHaveBeenCalledTimes(1);
		expect(modifySpy).not.toHaveBeenCalled();

		const linesAfter = files[filePath].split('\n');
		expect(linesAfter[1]).toContain('🛫 2026-09-15');
		expect(linesAfter[1]).toContain('📅 2026-09-25');
		// 子任务保留 2 空格缩进且日期同步 +5 天
		expect(linesAfter[2].startsWith('  - [ ] 集成联调')).toBe(true);
		expect(linesAfter[2]).toContain('🛫 2026-09-15');
		expect(linesAfter[2]).toContain('📅 2026-09-20');
		// 孙任务保留 4 空格缩进且单日期同步 +5 天
		expect(linesAfter[3].startsWith('    - [ ] 细节核对')).toBe(true);
		expect(linesAfter[3]).toContain('📅 2026-09-17');
		// 无日期子检查项与独立后续阶段原封不动
		expect(linesAfter[4]).toBe('  - [ ] 无日期子检查项');
		expect(linesAfter[5]).toContain('🛫 2026-09-21');
		expect(linesAfter[5]).toContain('📅 2026-09-25');
		expect(linesAfter[6]).toBe('- [ ] 独立后续阶段 🛫 2026-10-01 📅 2026-10-05');

		// 触发一键撤销：整篇文档恢复至拖拽前原样
		const undone = await taskUndo.undo();
		expect(undone).toBe(true);
		expect(files[filePath]).toBe(originalDoc);
	});

	it('默认关闭开关或仅单边拉伸父任务时，不联动修改子任务', async () => {
		const { app, files, processSpy, modifySpy } = createAtomicVaultMock({ [filePath]: originalDoc });
		const parsed = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, originalDoc, ['tasks', 'dataview']);
		const parentTask = parsed[0];

		const ganttParent: GanttChartTask = {
			id: 'task:parent',
			name: parentTask.description,
			start: '2026-09-10',
			end: '2026-09-20',
			progress: 0,
			filePath: parentTask.filePath,
			fileName: parentTask.fileName,
			lineNumber: parentTask.lineNumber,
			content: parentTask.content,
			description: parentTask.description,
			format: parentTask.format,
			priority: parentTask.priority,
			startDate: parentTask.startDate,
			dueDate: parentTask.dueDate,
			treeNodeType: 'task',
			isRollupBar: false,
		};

		// 开启开关但仅单边拉伸右侧（start 不变、end +3 天）：不应触发批量顺延
		const pluginOn = {
			settings: { enabledTaskFormats: ['tasks', 'dataview'], ganttCascadeParentDrag: true },
		} as unknown as IPluginContext;
		const handlerOn = new TaskUpdateHandler(app, pluginOn);

		await handlerOn.handleDateChange(
			ganttParent,
			new Date(2026, 8, 10),
			new Date(2026, 8, 23),
			'startDate',
			'dueDate',
			parsed
		);

		expect(processSpy).not.toHaveBeenCalled();
		expect(modifySpy).toHaveBeenCalledTimes(1);
		// 子任务日期保持原样 2026-09-15
		expect(files[filePath].split('\n')[2]).toBe('  - [ ] 集成联调 🛫 2026-09-10 📅 2026-09-15');
	});

	it('批量回写中若任一行发生外部漂移丢失，整次原子操作中止且不产生部分写盘', async () => {
		const { app, files } = createAtomicVaultMock({
			[filePath]: '- [ ] 验证阶段1 🛫 2026-09-10 📅 2026-09-20',
		});

		const parent: GCTask = {
			filePath,
			fileName: 'Item-10',
			lineNumber: 1,
			content: '验证阶段1 🛫 2026-09-10 📅 2026-09-20',
			description: '验证阶段1',
			completed: false,
			priority: 'normal',
		};
		const missingChild: GCTask = {
			filePath,
			fileName: 'Item-10',
			lineNumber: 2,
			content: '已删除的子任务 📅 2026-09-15',
			description: '已删除的子任务',
			completed: false,
			priority: 'normal',
		};

		await expect(
			shiftTaskDatesAtomically(
				app,
				filePath,
				[
					{ task: parent, updates: { dueDate: new Date(2026, 8, 25) } },
					{ task: missingChild, updates: { dueDate: new Date(2026, 8, 20) } },
				],
				['tasks', 'dataview']
			)
		).rejects.toThrow(/Batch shift aborted/i);

		expect(files[filePath]).toBe('- [ ] 验证阶段1 🛫 2026-09-10 📅 2026-09-20');
	});
});

describe('T9 汇总进度百分比统计与填充路径几何', () => {
	it('递归汇总父阶段、型号与项目文件夹的 completedTaskCount / leafTaskCount / progressRatio', () => {
		const docItem2 = [
			'- [ ] 设计阶段',
			'  - [x] 方案评审 🛫 2026-09-10 📅 2026-09-14',
			'  - [ ] 模块开发 🛫 2026-09-15 📅 2026-09-20',
		].join('\n');
		const docItem10 = [
			'- [x] 集成联调 🛫 2026-09-12 📅 2026-09-18',
			'- [x] 验收评审 🛫 2026-09-19 📅 2026-09-22',
		].join('\n');

		const tasks = [
			...parseTasksFromContent({ path: 'Projects/产品Alpha/Item-2.md', basename: 'Item-2' }, docItem2, ['tasks', 'dataview']),
			...parseTasksFromContent({ path: 'Projects/产品Alpha/Item-10.md', basename: 'Item-10' }, docItem10, ['tasks', 'dataview']),
		];

		const roots = buildGanttTree(tasks, {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
		});

		const folder = roots[0];
		const fileItem2 = folder.children[0];
		const fileItem10 = folder.children[1];
		const hwPhase = fileItem2.children[0];

		// 设计阶段：1/2 = 50%
		expect(hwPhase.completedTaskCount).toBe(1);
		expect(hwPhase.leafTaskCount).toBe(2);
		expect(hwPhase.progressRatio).toBeCloseTo(0.5);

		// Item-2 型号：1/2 = 50%
		expect(fileItem2.completedTaskCount).toBe(1);
		expect(fileItem2.leafTaskCount).toBe(2);
		expect(fileItem2.progressRatio).toBeCloseTo(0.5);

		// Item-10 型号：2/2 = 100%
		expect(fileItem10.completedTaskCount).toBe(2);
		expect(fileItem10.leafTaskCount).toBe(2);
		expect(fileItem10.progressRatio).toBe(1);

		// 产品Alpha项目文件夹：3/4 = 75%
		expect(folder.completedTaskCount).toBe(3);
		expect(folder.leafTaskCount).toBe(4);
		expect(folder.progressRatio).toBeCloseTo(0.75);
	});

	it('buildRollupProgressPath 正确处理 0%、部分进度、斜角过渡与 100% 边界', () => {
		expect(buildRollupProgressPath(100, 40, 40, 200, 0)).toBeNull();

		const half = buildRollupProgressPath(100, 40, 40, 200, 0.5);
		expect(half).toBeTruthy();
		expect(half).toContain('L 200 55');
		expect(half?.endsWith('Z')).toBe(true);

		const nearFull = buildRollupProgressPath(100, 40, 40, 200, 0.99);
		expect(nearFull).toBeTruthy();
		expect(nearFull?.endsWith('Z')).toBe(true);

		const full = buildRollupProgressPath(100, 40, 40, 200, 1);
		const bracket = buildRollupBracketPath(100, 40, 40, 200);
		expect(full).toBe(bracket.d);
	});
});
