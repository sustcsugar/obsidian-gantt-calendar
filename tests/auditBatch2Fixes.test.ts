/**
 * 审计第二批修复（P1-1 / P1-5 / P1-7）回归测试：
 * 1. P1-1：原版平铺 / 树形模式切换与 calendarStore 持久化水合；平铺模式不触发隐式父子联动拖拽
 * 2. P1-5：TaskDataAdapter 与 treeBuilder 共用开始日期回退链（createdDate + dueDate 对齐汇总条与越界判定；纯 createdDate 备忘不误入）
 * 3. P1-7：MarkdownDataSource 冷启动通过 metadataCache.listItems 预筛跳过纯文本笔记，零任务文件入缓存避免重复读盘
 */
import { TFile, type CachedMetadata } from 'obsidian';
import {
	buildGanttTree,
	TaskDataAdapter,
	resolveGanttTaskDateRange,
	TaskUpdateHandler,
} from '../src/gantt';
import { parseTasksFromContent } from '../src/tasks/taskParser/main';
import { MarkdownDataSource } from '../src/data-layer/MarkdownDataSource';
import { EventBus } from '../src/data-layer/EventBus';
import type { DataSourceChanges } from '../src/data-layer/types';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import { PLUGIN_ID } from '../src/constants';
import type { GCTask, IPluginContext } from '../src/types';

function makeTask(overrides: Partial<GCTask> & { filePath: string; lineNumber: number; description: string }): GCTask {
	const fileName = (overrides.filePath.split('/').pop() || '').replace(/\.md$/, '');
	return {
		fileName,
		content: overrides.content ?? overrides.description,
		completed: false,
		priority: 'normal',
		indentWidth: 0,
		childLineNumbers: [],
		isVirtualContainer: false,
		...overrides,
	};
}

describe('P1-1 树形 / 原版平铺模式切换与持久化', () => {
	beforeEach(() => {
		useCalendarStore.getState().hydrateGanttTreeState('project-model', [], 'tree');
	});

	it('hydrateGanttTreeState 正确恢复 ganttDisplayMode 并对异常值回退为 tree', () => {
		useCalendarStore.getState().hydrateGanttTreeState('model-only', ['file:a.md'], 'flat');
		expect(useCalendarStore.getState().ganttDisplayMode).toBe('flat');
		expect(useCalendarStore.getState().ganttGroupMode).toBe('model-only');
		expect(useCalendarStore.getState().ganttCollapsedIds).toEqual(['file:a.md']);

		// 未传第 3 参或传入异常值时安全回退为默认 tree
		useCalendarStore.getState().hydrateGanttTreeState('project-model', []);
		expect(useCalendarStore.getState().ganttDisplayMode).toBe('tree');
	});

	it('setGanttDisplayMode 仅在模式变化时更新状态并触发持久化订阅', () => {
		const observed: string[] = [];
		const unsub = useCalendarStore.subscribe((state, prev) => {
			if (state.ganttDisplayMode !== prev.ganttDisplayMode) {
				observed.push(state.ganttDisplayMode);
			}
		});

		useCalendarStore.getState().setGanttDisplayMode('tree'); // 同值，不触发
		useCalendarStore.getState().setGanttDisplayMode('flat');
		useCalendarStore.getState().setGanttDisplayMode('flat'); // 同值，不触发
		useCalendarStore.getState().setGanttDisplayMode('tree');

		unsub();
		expect(observed).toEqual(['flat', 'tree']);
	});

	it('原版平铺模式（treeNodeType 为 undefined）拖拽父任务时，即使开启联动开关也不隐式修改子任务', async () => {
		const filePath = 'Projects/A/Item-10.md';
		const doc = [
			'- [ ] 验证阶段1 🛫 2026-09-10 📅 2026-09-20',
			'  - [ ] 集成联调 🛫 2026-09-10 📅 2026-09-15',
		].join('\n');

		const files: Record<string, string> = { [filePath]: doc };
		const fileObj = new TFile() as TFile & { extension: string; basename: string };
		fileObj.path = filePath;
		fileObj.extension = 'md';
		fileObj.basename = 'Item-10';

		const modifySpy = jest.fn(async (_f: TFile, next: string) => {
			files[filePath] = next;
		});
		const processSpy = jest.fn(async (_f: TFile, fn: (data: string) => string) => {
			const next = fn(files[filePath]);
			files[filePath] = next;
			return next;
		});

		const app = {
			vault: {
				getAbstractFileByPath: (p: string) => (p === filePath ? fileObj : null),
				read: async () => files[filePath],
				modify: modifySpy,
				process: processSpy,
			},
			plugins: {
				getPlugin: (id: string) => (id === PLUGIN_ID ? { settings: { globalTaskFilter: '' } } : null),
			},
		} as never;

		const parsed = parseTasksFromContent({ path: filePath, basename: 'Item-10' }, doc, ['tasks', 'dataview']);
		const flatTasks = TaskDataAdapter.toGanttChartTasks(parsed, 'startDate', 'dueDate');
		expect(flatTasks[0].treeNodeType).toBeUndefined();

		const plugin = {
			settings: {
				enabledTaskFormats: ['tasks', 'dataview'],
				ganttCascadeParentDrag: true,
			},
		} as unknown as IPluginContext;

		const handler = new TaskUpdateHandler(app, plugin);
		await handler.handleDateChange(
			flatTasks[0],
			new Date(2026, 8, 15),
			new Date(2026, 8, 25),
			'startDate',
			'dueDate',
			parsed
		);

		// 平铺模式下仅更新自身单行，不走原子批量顺延，子任务保持原样
		expect(processSpy).not.toHaveBeenCalled();
		expect(modifySpy).toHaveBeenCalledTimes(1);
		const linesAfter = files[filePath].split('\n');
		expect(linesAfter[0]).toContain('🛫 2026-09-15');
		expect(linesAfter[0]).toContain('📅 2026-09-25');
		expect(linesAfter[1]).toBe('  - [ ] 集成联调 🛫 2026-09-10 📅 2026-09-15');
	});
});

describe('P1-5 汇总条与可见实体条日期解析口径统一', () => {
	it('缺 startDate 但有 createdDate + dueDate 时，treeBuilder 汇总跨度与 TaskDataAdapter 实体条完全一致', () => {
		const filePath = 'Projects/产品Alpha/Item-10.md';
		const parent = makeTask({
			filePath,
			lineNumber: 1,
			description: '设计阶段',
			childLineNumbers: [2, 3],
		});
		const createdFallbackChild = makeTask({
			filePath,
			lineNumber: 2,
			description: '方案评审',
			parentLineNumber: 1,
			indentWidth: 2,
			createdDate: new Date(2026, 8, 1),
			dueDate: new Date(2026, 8, 10),
		});
		const normalChild = makeTask({
			filePath,
			lineNumber: 3,
			description: '模块开发',
			parentLineNumber: 1,
			indentWidth: 2,
			startDate: new Date(2026, 8, 8),
			dueDate: new Date(2026, 8, 15),
		});

		const adapted = TaskDataAdapter.toGanttChartTask(createdFallbackChild, 'startDate', 'dueDate');
		expect(adapted?.start).toBe('2026-09-01');
		expect(adapted?.end).toBe('2026-09-10');
		expect(adapted?.startSourceField).toBe('createdDate');

		const roots = buildGanttTree([parent, createdFallbackChild, normalChild], {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
		});

		const folder = roots[0];
		const file = folder.children[0];
		const phase = file.children[0];
		const childNode = phase.children[0];

		// 实体子节点、父阶段、文件与文件夹汇总条起点均对齐至 2026-09-01
		expect(childNode.label).toBe('方案评审');
		expect(childNode.startStr).toBe('2026-09-01');
		expect(childNode.endStr).toBe('2026-09-10');
		expect(phase.startStr).toBe('2026-09-01');
		expect(phase.endStr).toBe('2026-09-15');
		expect(file.startStr).toBe('2026-09-01');
		expect(folder.startStr).toBe('2026-09-01');
	});

	it('子节点靠 createdDate 兜底导致起点早于实体父任务时，能准确触发 hasOutOfBoundsChildren', () => {
		const filePath = 'Projects/产品Alpha/Item-10.md';
		const datedParent = makeTask({
			filePath,
			lineNumber: 1,
			description: '验证阶段',
			startDate: new Date(2026, 8, 5),
			dueDate: new Date(2026, 8, 20),
			childLineNumbers: [2],
		});
		const earlyCreatedChild = makeTask({
			filePath,
			lineNumber: 2,
			description: '前期准备',
			parentLineNumber: 1,
			indentWidth: 2,
			createdDate: new Date(2026, 8, 1),
			dueDate: new Date(2026, 8, 12),
		});

		const roots = buildGanttTree([datedParent, earlyCreatedChild], {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
		});

		const parentNode = roots[0].children[0].children[0];
		expect(parentNode.hasOutOfBoundsChildren).toBe(true);
	});

	it('仅有 createdDate（无 startDate 与 dueDate）的无排期备忘不被误判为甘特里程碑', () => {
		const createdOnlyMemo = makeTask({
			filePath: 'Projects/A/memo.md',
			lineNumber: 1,
			description: '仅自动带创建日期的随手记',
			createdDate: new Date(2026, 8, 1),
		});

		expect(
			resolveGanttTaskDateRange(createdOnlyMemo, 'startDate', 'dueDate', { allowSingleDateFallback: true })
		).toBeNull();

		const roots = buildGanttTree([createdOnlyMemo], {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
		});
		expect(roots).toHaveLength(0);
	});
});

describe('P1-7 MarkdownDataSource 冷启动 listItems 预筛与零任务文件缓存', () => {
	function createScanApp(
		files: Record<string, { content: string; mtime: number; cache: CachedMetadata | null }>
	) {
		const fileMap = new Map<string, TFile>();
		for (const [path, info] of Object.entries(files)) {
			const f = new TFile() as TFile & {
				extension: string;
				basename: string;
				stat: { mtime: number; ctime: number; size: number };
			};
			f.path = path;
			f.extension = 'md';
			f.basename = (path.split('/').pop() || '').replace(/\.md$/, '');
			f.stat = { mtime: info.mtime, ctime: info.mtime, size: info.content.length };
			fileMap.set(path, f);
		}

		const readSpy = jest.fn(async (file: { path: string }) => files[file.path].content);
		const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

		const app = {
			vault: {
				getAbstractFileByPath: (path: string) => fileMap.get(path) ?? null,
				getMarkdownFiles: () => Array.from(fileMap.values()),
				read: readSpy,
				on: (event: string, cb: (...args: unknown[]) => void) => {
					listeners[event] = listeners[event] || [];
					listeners[event].push(cb);
					return { event, cb };
				},
				offref: () => {},
			},
			metadataCache: {
				getFileCache: (file: { path: string }) => files[file.path]?.cache ?? null,
				on: () => ({}),
			},
		} as never;

		return { app, fileMap, readSpy, listeners };
	}

	it('冷启动跳过 metadataCache 明确无 listItems 的纯文本笔记；metadataCache 未就绪（null）仍安全读盘；二次扫描零重复读盘', async () => {
		const proseNoList: CachedMetadata = {};
		const proseEmptyList: CachedMetadata = { listItems: [] };
		const hasListItems: CachedMetadata = {
			listItems: [
				{
					position: {
						start: { line: 0, col: 0, offset: 0 },
						end: { line: 0, col: 20, offset: 20 },
					},
					parent: -1,
					task: ' ',
				},
			],
		};

		const { app, readSpy } = createScanApp({
			'Notes/prose1.md': {
				content: '# 纯文本笔记 1\n没有任何列表项',
				mtime: 1000,
				cache: proseNoList,
			},
			'Notes/prose2.md': {
				content: '# 纯文本笔记 2\n空 listItems',
				mtime: 1000,
				cache: proseEmptyList,
			},
			'Notes/bullets-no-task.md': {
				content: '- 普通无序列表，不含复选框',
				mtime: 1000,
				cache: hasListItems,
			},
			'Projects/Item-10.md': {
				content: '- [ ] 真实任务 📅 2026-09-10',
				mtime: 1000,
				cache: hasListItems,
			},
			'Projects/unindexed.md': {
				content: '- [ ] 缓存未就绪任务 📅 2026-09-12',
				mtime: 1000,
				cache: null, // metadataCache 尚未索引
			},
		});

		const received: DataSourceChanges[] = [];
		const ds = new MarkdownDataSource(app, new EventBus(), {
			enabled: true,
			syncDirection: 'import-only',
			autoSync: false,
			conflictResolution: 'local-win',
			globalFilter: '',
			enabledFormats: ['tasks', 'dataview'],
		});
		ds.onChange(async (changes) => {
			received.push(changes);
		});

		await ds.initialize({
			enabled: true,
			syncDirection: 'import-only',
			autoSync: false,
			conflictResolution: 'local-win',
			globalFilter: '',
			enabledFormats: ['tasks', 'dataview'],
		});

		// 纯文本笔记 prose1.md 与 prose2.md 均跳过磁盘读取，仅读取其余 3 个文件
		const readPaths = readSpy.mock.calls.map((args) => args[0].path).sort();
		expect(readPaths).toEqual([
			'Notes/bullets-no-task.md',
			'Projects/Item-10.md',
			'Projects/unindexed.md',
		]);

		// 两个真实任务均被正确收集，metadataCache=null 未漏任务
		expect(received[0].created.map((t) => t.description).sort()).toEqual([
			'真实任务',
			'缓存未就绪任务',
		]);

		// 二次重初始化（配置未变、所有文件 mtime 未变）：包含零任务文件在内全部命中缓存，0 次新增读盘
		readSpy.mockClear();
		await ds.initialize({
			enabled: true,
			syncDirection: 'import-only',
			autoSync: false,
			conflictResolution: 'local-win',
			globalFilter: '',
			enabledFormats: ['tasks', 'dataview'],
		});
		expect(readSpy).not.toHaveBeenCalled();

		ds.destroy();
	});

	it('删除或重命名零任务文件时，不派发无效的 deletedFilePaths 事件', async () => {
		const { app, fileMap, listeners, readSpy } = createScanApp({
			'Notes/empty.md': {
				content: '纯文本',
				mtime: 1000,
				cache: {},
			},
		});

		const received: DataSourceChanges[] = [];
		const ds = new MarkdownDataSource(app, new EventBus(), {
			enabled: true,
			syncDirection: 'import-only',
			autoSync: false,
			conflictResolution: 'local-win',
			globalFilter: '',
			enabledFormats: ['tasks', 'dataview'],
		});
		ds.onChange(async (changes) => {
			received.push(changes);
		});

		await ds.initialize({
			enabled: true,
			syncDirection: 'import-only',
			autoSync: false,
			conflictResolution: 'local-win',
			globalFilter: '',
			enabledFormats: ['tasks', 'dataview'],
		});
		received.length = 0;
		readSpy.mockClear();

		const emptyFile = fileMap.get('Notes/empty.md');
		expect(emptyFile).toBeDefined();
		if (!emptyFile) return;
		// 模拟重命名零任务文件
		emptyFile.path = 'Notes/empty-renamed.md';
		listeners.rename?.forEach((cb) => cb(emptyFile, 'Notes/empty.md'));
		// 模拟删除零任务文件
		listeners.delete?.forEach((cb) => cb(emptyFile));

		expect(readSpy).not.toHaveBeenCalled();
		expect(received).toHaveLength(0);

		ds.destroy();
	});
});
