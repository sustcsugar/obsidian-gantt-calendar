/**
 * T5 单元测试：
 * 1. 虚拟父节点（isVirtualContainer）无破坏复选框回写（勾选/取消勾选、防注入 globalFilter、防漂移重定位）
 * 2. TaskUpdateHandler 对汇总条 / folder / file 的防御性拦截
 * 3. 汇总括号条单日/极窄/多日几何边界与跨度天数计算
 */
import { TFile } from 'obsidian';
import {
	updateTaskCompletion,
	updateVirtualContainerCompletion,
} from '../src/tasks/taskUpdater';
import { TaskUpdateHandler } from '../src/gantt/handlers/taskUpdateHandler';
import {
	buildRollupBracketPath,
	calculateInclusiveSpanDays,
} from '../src/gantt/wrappers/rollupGeometry';
import { PLUGIN_ID } from '../src/constants';
import type { GCTask, IPluginContext } from '../src/types';
import type { GanttChartTask } from '../src/gantt/types';

function makeVaultMock(initialFiles: Record<string, string>, globalTaskFilter = '🎯 ') {
	const files = { ...initialFiles };
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

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => fileObjs.get(path) ?? null,
			read: async (file: { path: string }) => files[file.path],
			modify: modifySpy,
		},
		plugins: {
			getPlugin: (id: string) => (id === PLUGIN_ID
				? { settings: { globalTaskFilter } }
				: null),
		},
	} as never;

	return { app, files, modifySpy };
}

describe('T5 虚拟父节点无破坏复选框回写', () => {
	const filePath = 'Projects/产品Alpha/Item-10.md';

	it('勾选与取消勾选虚拟父节点：100% 保留缩进、列表标记与原文，绝不注入 globalFilter', async () => {
		const initial = [
			'## 节点排期',
			'  - [ ] 设计阶段 #phase %%[owner:: Alice]%%',
			'    - [ ] 🎯 方案评审 🛫 2026-09-10 📅 2026-09-17',
		].join('\n');

		const { app, files, modifySpy } = makeVaultMock({ [filePath]: initial }, '🎯 ');

		const virtualParent: GCTask = {
			filePath,
			fileName: 'Item-10',
			lineNumber: 2,
			content: '设计阶段 #phase %%[owner:: Alice]%%',
			description: '设计阶段',
			completed: false,
			priority: 'normal',
			indentWidth: 2,
			childLineNumbers: [3],
			isVirtualContainer: true,
		};

		// 勾选完成（走 updateTaskCompletion 路由）
		await updateTaskCompletion(app, virtualParent, true, ['tasks', 'dataview']);
		expect(modifySpy).toHaveBeenCalledTimes(1);
		expect(files[filePath]).toBe([
			'## 节点排期',
			'  - [x] 设计阶段 #phase %%[owner:: Alice]%%',
			'    - [ ] 🎯 方案评审 🛫 2026-09-10 📅 2026-09-17',
		].join('\n'));
		expect(files[filePath].split('\n')[1]).not.toContain('🎯');

		// 取消勾选
		await updateTaskCompletion(app, { ...virtualParent, completed: true }, false, ['tasks', 'dataview']);
		expect(modifySpy).toHaveBeenCalledTimes(2);
		expect(files[filePath]).toBe(initial);
	});

	it('文件顶部插入行导致行号漂移时，按原文特征重定位并无破坏更新', async () => {
		const shiftedContent = [
			'---',
			'title: Item-10',
			'---',
			'新增说明行',
			'\t- [ ] 验证阶段',
			'\t  - [ ] 🎯 集成联调 📅 2026-09-25',
		].join('\n');

		const { app, files } = makeVaultMock({ [filePath]: shiftedContent }, '🎯 ');

		// 传入旧行号 lineNumber = 1（已漂移至第 5 行）
		const driftedTask: GCTask = {
			filePath,
			fileName: 'Item-10',
			lineNumber: 1,
			content: '验证阶段',
			description: '验证阶段',
			completed: false,
			priority: 'normal',
			isVirtualContainer: true,
		};

		await updateVirtualContainerCompletion(app, driftedTask, true);
		expect(files[filePath].split('\n')[4]).toBe('\t- [x] 验证阶段');
		// 其余行保持原样
		expect(files[filePath].split('\n')[0]).toBe('---');
		expect(files[filePath].split('\n')[5]).toBe('\t  - [ ] 🎯 集成联调 📅 2026-09-25');
	});

	it('目标行被外部删除时安全抛错，绝不盲写', async () => {
		const { app, modifySpy } = makeVaultMock({
			[filePath]: '- [ ] 其他任务 📅 2026-09-10',
		}, '🎯 ');

		const missingTask: GCTask = {
			filePath,
			fileName: 'Item-10',
			lineNumber: 1,
			content: '已删除的父阶段',
			description: '已删除的父阶段',
			completed: false,
			priority: 'normal',
			isVirtualContainer: true,
		};

		await expect(updateVirtualContainerCompletion(app, missingTask, true)).rejects.toThrow(/line drift/i);
		expect(modifySpy).not.toHaveBeenCalled();
	});
});

describe('T5 TaskUpdateHandler 防御性拦截', () => {
	it('对 isRollupBar / folder / file 节点调用 handleDateChange 静默返回，不触发文件写入', async () => {
		const { app, modifySpy } = makeVaultMock({
			'Projects/A/Item-10.md': '- [ ] 设计阶段\n  - [ ] 🎯 子任务 📅 2026-09-10',
		});
		const mockPlugin = {
			settings: { enabledTaskFormats: ['tasks', 'dataview'] },
		} as unknown as IPluginContext;
		const handler = new TaskUpdateHandler(app, mockPlugin);

		const folderNode: GanttChartTask = {
			id: 'folder:A',
			name: 'A',
			start: '2026-09-10',
			end: '2026-09-20',
			progress: 0,
			treeNodeType: 'folder',
			isRollupBar: true,
		};
		const fileNode: GanttChartTask = {
			id: 'file:Projects/A/Item-10.md',
			name: 'Item-10',
			start: '2026-09-10',
			end: '2026-09-20',
			progress: 0,
			filePath: 'Projects/A/Item-10.md',
			treeNodeType: 'file',
			isRollupBar: true,
		};
		const rollupTaskNode: GanttChartTask = {
			id: 'task:Projects/A/Item-10.md::root::设计阶段#1',
			name: '设计阶段',
			start: '2026-09-10',
			end: '2026-09-20',
			progress: 0,
			filePath: 'Projects/A/Item-10.md',
			lineNumber: 1,
			treeNodeType: 'task',
			isRollupBar: true,
		};

		const s = new Date(2026, 8, 12);
		const e = new Date(2026, 8, 22);

		await handler.handleDateChange(folderNode, s, e, 'startDate', 'dueDate', []);
		await handler.handleDateChange(fileNode, s, e, 'startDate', 'dueDate', []);
		await handler.handleDateChange(rollupTaskNode, s, e, 'startDate', 'dueDate', []);
		await handler.handleProgressChange(folderNode, 100, []);
		await handler.handleProgressChange(fileNode, 100, []);

		expect(modifySpy).not.toHaveBeenCalled();
	});
});

describe('T5 汇总括号条几何与跨度天数计算', () => {
	it('正确计算单日与多日包含首尾的跨度天数', () => {
		expect(calculateInclusiveSpanDays('2026-09-10', '2026-09-10')).toBe(1);
		expect(calculateInclusiveSpanDays('2026-09-10', '2026-09-17')).toBe(8);
		// 异常倒置输入兜底至少 1 天
		expect(calculateInclusiveSpanDays('2026-09-20', '2026-09-10')).toBe(1);
	});

	it('单日与极窄宽度下启用最小宽度保护，左右尖角不翻转重叠', () => {
		const narrow = buildRollupBracketPath(100, 40, 40, 4);
		expect(narrow.width).toBeGreaterThanOrEqual(16);
		expect(narrow.tipWidth).toBeGreaterThanOrEqual(2);
		// 左右尖角内侧坐标严格满足 leftInnerX < rightInnerX
		expect(100 + narrow.tipWidth).toBeLessThan(100 + narrow.width - narrow.tipWidth);
		expect(narrow.topY).toBe(55);
		expect(narrow.bottomY).toBe(65);
		expect(narrow.d.startsWith('M 100 55')).toBe(true);
		expect(narrow.d.endsWith('Z')).toBe(true);
	});

	it('多日正常宽度下完整保留原始跨度并居中于 40px 行内', () => {
		const normal = buildRollupBracketPath(200, 80, 40, 240);
		expect(normal.width).toBe(240);
		expect(normal.topY).toBe(95);
		expect(normal.bottomY).toBe(105);
		expect(normal.d).toContain('L 440 95');
		expect(normal.d).toContain('L 440 105');
	});
});
