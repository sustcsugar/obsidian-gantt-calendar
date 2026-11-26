/**
 * @jest-environment jsdom
 */
/**
 * 审计第一批高危修复（解除 No-Go）回归测试：
 * 1. P0-1：同文件同名任务 + 行漂移拒绝盲写；单条唯一任务 + 行漂移正常重定位
 * 2. P0-2：批量顺延撤销全量预校验（未改文件精准恢复、中间插行防盲写、外部改写全有或全无中止并弹 Notice）
 * 3. P1-6：updateTaskProperties() 写回 Windows CRLF 文件后全文件保持纯 \r\n
 * 4. P1-2：含英文双引号 " 与反斜杠 \ 的任务标题经 escapeCssAttrValue() 进入 querySelector 不抛错且精准命中
 * 5. P2：fingerprintTask() 顶部插行后嵌套任务指纹保持不变；ganttRootFolder 大小写不敏感匹配且保留原大小写展示
 */
import { TFile } from 'obsidian';
import { parseTasksFromContent, parseSingleTaskLine } from '../src/tasks/taskParser/main';
import {
	updateTaskProperties,
	updateVirtualContainerCompletion,
	shiftTaskDatesAtomically,
} from '../src/tasks/taskUpdater';
import { TaskUndoService } from '../src/tasks/taskUndo';
import { escapeCssAttrValue } from '../src/gantt/wrappers/svgGanttRenderer';
import { fingerprintTask } from '../src/data-layer/MarkdownDataSource';
import { buildGanttTree } from '../src/gantt/treeBuilder';
import { PLUGIN_ID } from '../src/constants';
import { i18n } from '../src/i18n/i18n';
import type { GCTask } from '../src/types';

function createVaultMock(initialFiles: Record<string, string>, globalTaskFilter = '') {
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

describe('第一批高危修复回归测试', () => {
	const filePath = 'Projects/产品Alpha/Item-10.md';

	describe('1. P0-1 严格行定位与防同名盲写', () => {
		it('同文件两条同名任务 + 顶部插行漂移：updateTaskProperties 拒绝盲写抛错，第一条任务原文零损坏', async () => {
			const originalFirstLine = '  - [ ] 🎯 验收评审 🛫 2026-09-10 📅 2026-09-15';
			const originalSecondLine = '  - [ ] 🎯 验收评审 🛫 2026-09-20 📅 2026-09-25';
			// 文件顶部插入 2 行，且第二条任务原文略有外部改动（使精确原文匹配为 0，进入描述匹配命中 2 条）
			const driftedDoc = [
				'# 新增说明行 1',
				'# 新增说明行 2',
				'- [ ] 验证阶段1',
				originalFirstLine,
				'- [ ] 验证阶段2',
				'  - [ ] 🎯 验收评审 🛫 2026-09-20 📅 2026-09-26',
			].join('\n');

			const { app, files, modifySpy } = createVaultMock({ [filePath]: driftedDoc }, '🎯 ');

			// 过期快照：旧行号=4（现指向第一条同名任务），旧内容指向第二条任务
			const staleSecondTask = parseSingleTaskLine(
				originalSecondLine,
				filePath,
				'Item-10',
				4,
				['tasks', 'dataview'],
				'🎯 '
			) as GCTask;

			await expect(
				updateTaskProperties(
					app,
					staleSecondTask,
					{ dueDate: new Date(2026, 9, 5) },
					['tasks', 'dataview']
				)
			).rejects.toThrow(/ambiguous/i);

			expect(modifySpy).not.toHaveBeenCalled();
			expect(files[filePath]).toBe(driftedDoc);
			expect(files[filePath].split('\n')[3]).toBe(originalFirstLine);
		});

		it('同文件两条完全相同的虚拟父任务 + 顶部插行漂移：updateVirtualContainerCompletion 拒绝盲写抛错', async () => {
			const driftedDoc = [
				'顶部新增备注',
				'- [ ] 验证阶段',
				'  - [ ] 🎯 子任务A 📅 2026-09-10',
				'- [ ] 验证阶段',
				'  - [ ] 🎯 子任务B 📅 2026-09-20',
			].join('\n');

			const { app, files, modifySpy } = createVaultMock({ [filePath]: driftedDoc }, '🎯 ');

			const staleVirtualParent: GCTask = {
				filePath,
				fileName: 'Item-10',
				lineNumber: 3, // 旧行号已漂移至子任务A行
				content: '验证阶段',
				description: '验证阶段',
				completed: false,
				priority: 'normal',
				isVirtualContainer: true,
			};

			await expect(
				updateVirtualContainerCompletion(app, staleVirtualParent, true)
			).rejects.toThrow(/ambiguous/i);

			expect(modifySpy).not.toHaveBeenCalled();
			expect(files[filePath]).toBe(driftedDoc);
			expect(files[filePath].split('\n')[1]).toBe('- [ ] 验证阶段');
		});

		it('同文件两条完全相同子任务 + 顶部插行漂移：shiftTaskDatesAtomically 中止批量写回且文件零损坏', async () => {
			const driftedDoc = [
				'顶部插入行',
				'- [ ] 父任务 🛫 2026-09-10 📅 2026-09-20',
				'  - [ ] 重复工序 🛫 2026-09-12 📅 2026-09-15',
				'  - [ ] 重复工序 🛫 2026-09-12 📅 2026-09-15',
			].join('\n');

			const { app, files } = createVaultMock({ [filePath]: driftedDoc });
			const staleChild = parseSingleTaskLine(
				'  - [ ] 重复工序 🛫 2026-09-12 📅 2026-09-15',
				filePath,
				'Item-10',
				2, // 漂移后指向父任务行
				['tasks', 'dataview']
			) as GCTask;

			await expect(
				shiftTaskDatesAtomically(
					app,
					filePath,
					[{ task: staleChild, updates: { dueDate: new Date(2026, 8, 20) } }],
					['tasks', 'dataview']
				)
			).rejects.toThrow(/ambiguous/i);

			expect(files[filePath]).toBe(driftedDoc);
		});

		it('同文件单条唯一任务 + 顶部插行漂移：正常重定位并精准写入', async () => {
			const originalLine = '  - [ ] 🎯 唯一方案评审 🛫 2026-09-10 📅 2026-09-17';
			const driftedDoc = [
				'# 新增标题',
				'新增背景段落',
				'- [ ] 设计阶段',
				originalLine,
				'  - [ ] 🎯 模块开发 🛫 2026-09-18 📅 2026-09-25',
			].join('\n');

			const { app, files, modifySpy } = createVaultMock({ [filePath]: driftedDoc }, '🎯 ');
			const staleTask = parseSingleTaskLine(
				originalLine,
				filePath,
				'Item-10',
				1, // 旧行号为 1，漂移至第 4 行
				['tasks', 'dataview'],
				'🎯 '
			) as GCTask;

			await updateTaskProperties(
				app,
				staleTask,
				{ dueDate: new Date(2026, 8, 22) },
				['tasks', 'dataview']
			);

			expect(modifySpy).toHaveBeenCalledTimes(1);
			const lines = files[filePath].split('\n');
			expect(lines[0]).toBe('# 新增标题');
			expect(lines[3]).toContain('唯一方案评审');
			expect(lines[3]).toContain('📅 2026-09-22');
			expect(lines[4]).toBe('  - [ ] 🎯 模块开发 🛫 2026-09-18 📅 2026-09-25');
		});
	});

	describe('2. P0-2 批量顺延撤销全量预校验', () => {
		const baseDoc = [
			'## 节点排期',
			'- [ ] 验证阶段1 🛫 2026-09-10 📅 2026-09-20',
			'  - [ ] 集成联调 🛫 2026-09-10 📅 2026-09-15',
			'  - [ ] 验收评审 🛫 2026-09-16 📅 2026-09-20',
		].join('\n');

		function createUndoHarness() {
			const notices: string[] = [];
			const noticeFactory = jest.fn((msg: string) => {
				notices.push(msg);
				return {
					noticeEl: { appendChild: jest.fn() } as unknown as HTMLElement,
					hide: jest.fn(),
				};
			});
			const buttonFactory = jest.fn(() => ({}) as HTMLButtonElement);
			const service = new TaskUndoService(noticeFactory, buttonFactory);
			return { service, notices };
		}

		it('未改文件时撤销精准恢复原文档', async () => {
			const { app, files } = createVaultMock({ [filePath]: baseDoc });
			const tasks = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, baseDoc, ['tasks', 'dataview']);
			const result = await shiftTaskDatesAtomically(
				app,
				filePath,
				[
					{ task: tasks[0], updates: { startDate: new Date(2026, 8, 15), dueDate: new Date(2026, 8, 25) } },
					{ task: tasks[1], updates: { startDate: new Date(2026, 8, 15), dueDate: new Date(2026, 8, 20) } },
					{ task: tasks[2], updates: { startDate: new Date(2026, 8, 21), dueDate: new Date(2026, 8, 25) } },
				],
				['tasks', 'dataview']
			);

			expect(result.previousLines).toHaveLength(3);
			expect(result.previousLines.every((s) => s.shiftedLine.length > 0)).toBe(true);

			const { service, notices } = createUndoHarness();
			const onRefresh = jest.fn();
			service.registerBatchLines(
				{ app, filePath, previousLines: result.previousLines, onRefresh },
				'已顺延'
			);

			const ok = await service.undo();
			expect(ok).toBe(true);
			expect(files[filePath]).toBe(baseDoc);
			expect(onRefresh).toHaveBeenCalledTimes(1);
			expect(notices).toContain(i18n.t('contextMenu.commands.undoSuccess'));
		});

		it('批量顺延后中间插入新行且顺延行被外部改动：撤销全有或全无中止、弹 Notice 且保持文件原样', async () => {
			const { app, files } = createVaultMock({ [filePath]: baseDoc });
			const tasks = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, baseDoc, ['tasks', 'dataview']);
			const result = await shiftTaskDatesAtomically(
				app,
				filePath,
				[
					{ task: tasks[0], updates: { startDate: new Date(2026, 8, 15), dueDate: new Date(2026, 8, 25) } },
					{ task: tasks[1], updates: { startDate: new Date(2026, 8, 15), dueDate: new Date(2026, 8, 20) } },
					{ task: tasks[2], updates: { startDate: new Date(2026, 8, 21), dueDate: new Date(2026, 8, 25) } },
				],
				['tasks', 'dataview']
			);

			// 在第 1 与第 2 条任务间插入新行，且外部编辑了第 3 条顺延行
			const shiftedLines = files[filePath].split('\n');
			const externallyEdited = [
				shiftedLines[0],
				shiftedLines[1],
				'用户新插入的会议记录行',
				shiftedLines[2],
				`${shiftedLines[3]} #外部新增标签`,
			].join('\n');
			files[filePath] = externallyEdited;

			const { service, notices } = createUndoHarness();
			const onRefresh = jest.fn();
			service.registerBatchLines(
				{ app, filePath, previousLines: result.previousLines, onRefresh },
				'已顺延'
			);

			const ok = await service.undo();
			expect(ok).toBe(false);
			expect(onRefresh).not.toHaveBeenCalled();
			// 文件必须 100% 保持原样：既不能覆盖新插入行，也不能部分恢复前两条
			expect(files[filePath]).toBe(externallyEdited);
			expect(notices).toContain(i18n.t('contextMenu.commands.undoFileChanged'));
		});

		it('批量顺延后仅在中间插入新行（各顺延行仍唯一完整）：撤销安全重定位且绝不覆盖新插入行', async () => {
			const { app, files } = createVaultMock({ [filePath]: baseDoc });
			const tasks = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, baseDoc, ['tasks', 'dataview']);
			const result = await shiftTaskDatesAtomically(
				app,
				filePath,
				[
					{ task: tasks[0], updates: { startDate: new Date(2026, 8, 15), dueDate: new Date(2026, 8, 25) } },
					{ task: tasks[1], updates: { startDate: new Date(2026, 8, 15), dueDate: new Date(2026, 8, 20) } },
					{ task: tasks[2], updates: { startDate: new Date(2026, 8, 21), dueDate: new Date(2026, 8, 25) } },
				],
				['tasks', 'dataview']
			);

			const shiftedLines = files[filePath].split('\n');
			files[filePath] = [
				shiftedLines[0],
				shiftedLines[1],
				'用户新插入的备注行',
				shiftedLines[2],
				shiftedLines[3],
			].join('\n');

			const { service } = createUndoHarness();
			service.registerBatchLines(
				{ app, filePath, previousLines: result.previousLines, onRefresh: jest.fn() },
				'已顺延'
			);

			const ok = await service.undo();
			expect(ok).toBe(true);
			expect(files[filePath].split('\n')).toEqual([
				'## 节点排期',
				'- [ ] 验证阶段1 🛫 2026-09-10 📅 2026-09-20',
				'用户新插入的备注行',
				'  - [ ] 集成联调 🛫 2026-09-10 📅 2026-09-15',
				'  - [ ] 验收评审 🛫 2026-09-16 📅 2026-09-20',
			]);
		});
	});

	describe('3. P1-6 Windows CRLF 换行保留', () => {
		it('updateTaskProperties() 对 \\r\\n 文件写回后全文件保持纯 CRLF，不产生混合换行', async () => {
			const crlfDoc = [
				'## 节点排期',
				'- [ ] 设计阶段',
				'  - [ ] 方案评审 🛫 2026-09-10 📅 2026-09-17',
				'  - [ ] 模块开发 🛫 2026-09-18 📅 2026-09-25',
			].join('\r\n');

			const { app, files } = createVaultMock({ [filePath]: crlfDoc });
			const tasks = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, crlfDoc, ['tasks', 'dataview']);
			const target = tasks[1];
			expect(target.description).toBe('方案评审');

			await updateTaskProperties(
				app,
				target,
				{ dueDate: new Date(2026, 8, 20) },
				['tasks', 'dataview']
			);

			const updated = files[filePath];
			expect(updated).toContain('📅 2026-09-20');
			// 确认不存在任何裸 \n（每个 \n 前都紧跟 \r）
			const rawLines = updated.split('\n');
			expect(rawLines).toHaveLength(4);
			for (let i = 0; i < rawLines.length - 1; i++) {
				expect(rawLines[i].endsWith('\r')).toBe(true);
			}
			expect(updated.replace(/\r\n/g, '')).not.toContain('\n');
		});
	});

	describe('4. P1-2 CSS 属性选择器特殊字符转义', () => {
		it('含英文双引号 " 与反斜杠 \\ 的任务标题进入 querySelector 不抛错且精准命中', () => {
			const specialContent = '- [ ] 评审 "A\\B" 规格\'单引号\' 🛫 2026-09-10 📅 2026-09-15';
			const parsed = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, specialContent, ['tasks', 'dataview']);
			const roots = buildGanttTree(parsed, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
			});
			const taskNode = roots[0].children[0].children[0];
			expect(taskNode.nodeId).toContain('"');
			expect(taskNode.nodeId).toContain('\\');

			const ns = 'http://www.w3.org/2000/svg';
			const svg = document.createElementNS(ns, 'svg');
			const rowGroup = document.createElementNS(ns, 'g');
			rowGroup.setAttribute('data-task-row', taskNode.nodeId);
			const barGroup = document.createElementNS(ns, 'g');
			barGroup.setAttribute('data-task-bar', taskNode.nodeId);
			svg.appendChild(rowGroup);
			svg.appendChild(barGroup);

			// fallback 路径（jsdom 默认无全局 CSS.escape）
			const escapedFallback = escapeCssAttrValue(taskNode.nodeId);
			expect(svg.querySelector(`[data-task-row="${escapedFallback}"]`)).toBe(rowGroup);
			expect(svg.querySelector(`[data-task-bar="${escapedFallback}"]`)).toBe(barGroup);

			// 原生 CSS.escape 存在时也应走通
			const winWithCss = window as Window & { CSS?: { escape: (v: string) => string } };
			const originalCSS = winWithCss.CSS;
			const escapeMock = jest.fn((v: string) => v.replace(/([\\"'#:/ ])/g, '\\$1'));
			winWithCss.CSS = { escape: escapeMock };
			try {
				const escapedNative = escapeCssAttrValue(taskNode.nodeId);
				expect(escapeMock).toHaveBeenCalledWith(taskNode.nodeId);
				expect(svg.querySelector(`[data-task-row="${escapedNative}"]`)).toBe(rowGroup);
			} finally {
				if (originalCSS === undefined) {
					delete winWithCss.CSS;
				} else {
					winWithCss.CSS = originalCSS;
				}
			}
		});
	});

	describe('5. P2 指纹相对行偏移与 ganttRootFolder 大小写不敏感匹配', () => {
		it('fingerprintTask() 在文件顶部插行后，下方嵌套父子孙任务指纹保持不变；修改层级时指纹仍变化', () => {
			const nestedDoc = [
				'- [ ] 设计阶段 🛫 2026-09-10 📅 2026-09-25',
				'  - [ ] 方案评审 🛫 2026-09-10 📅 2026-09-17',
				'    - [ ] 细节核对 📅 2026-09-12',
			].join('\n');
			const shiftedDoc = [
				'# 新增行 1',
				'新增行 2',
				'新增行 3',
				'新增行 4',
				'新增行 5',
				nestedDoc,
			].join('\n');

			const before = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, nestedDoc, ['tasks', 'dataview']);
			const after = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, shiftedDoc, ['tasks', 'dataview']);

			expect(before).toHaveLength(3);
			expect(after).toHaveLength(3);
			expect(after[0].lineNumber).toBe(before[0].lineNumber + 5);

			// 顶部插行后，父/子/孙任务指纹均保持 100% 一致
			expect(fingerprintTask(after[0])).toBe(fingerprintTask(before[0]));
			expect(fingerprintTask(after[1])).toBe(fingerprintTask(before[1]));
			expect(fingerprintTask(after[2])).toBe(fingerprintTask(before[2]));

			// 仅调整缩进层级时，指纹仍敏感变化
			const flattenedDoc = [
				'- [ ] 设计阶段 🛫 2026-09-10 📅 2026-09-25',
				'- [ ] 方案评审 🛫 2026-09-10 📅 2026-09-17',
				'    - [ ] 细节核对 📅 2026-09-12',
			].join('\n');
			const flattened = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, flattenedDoc, ['tasks', 'dataview']);
			expect(fingerprintTask(flattened[0])).not.toBe(fingerprintTask(before[0]));
			expect(fingerprintTask(flattened[1])).not.toBe(fingerprintTask(before[1]));
		});

		it('ganttRootFolder 大小写不敏感匹配前缀，保留原始路径大小写展示且不误匹配同前缀目录', () => {
			const tasks: GCTask[] = [
				...parseTasksFromContent(
					{ path: 'Projects/DeptA/产品Alpha/Item-10.md', basename: 'Item-10' },
					'- [ ] 集成联调 🛫 2026-09-10 📅 2026-09-15',
					['tasks', 'dataview']
				),
				...parseTasksFromContent(
					{ path: 'PROJECTS/DEPTA/TempNote.md', basename: 'TempNote' },
					'- [ ] 临时核对 📅 2026-09-12',
					['tasks', 'dataview']
				),
				...parseTasksFromContent(
					{ path: 'Projects2/DeptA/Other.md', basename: 'Other' },
					'- [ ] 不应命中 📅 2026-09-14',
					['tasks', 'dataview']
				),
			];

			const roots = buildGanttTree(tasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'projects/depta',
			});

			expect(roots.map((r) => r.label)).toEqual(['产品Alpha', '未分类项目']);
			expect(roots[0].children[0].label).toBe('Item-10');
			expect(roots[0].children[0].filePath).toBe('Projects/DeptA/产品Alpha/Item-10.md');
			expect(roots[1].children[0].label).toBe('TempNote');
			expect(roots[1].children[0].filePath).toBe('PROJECTS/DEPTA/TempNote.md');
		});
	});
});
