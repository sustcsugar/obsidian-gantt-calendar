/**
 * T2 单元测试：两阶段缩进解析器、词法跳过、缓存指纹与 TaskStore 门面隔离
 */
import { TFile } from 'obsidian';
import {
	calculateIndentWidth,
	parseTasksFromContent,
	type TaskFileRef,
} from '../src/tasks/taskParser/main';
import { MarkdownDataSource, fingerprintTask } from '../src/data-layer/MarkdownDataSource';
import { EventBus } from '../src/data-layer/EventBus';
import type { DataSourceChanges } from '../src/data-layer/types';
import { TaskStore } from '../src/TaskStore';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import { generateVirtualInstances } from '../src/tasks/virtualTaskGenerator';
import type { GCTask } from '../src/types';

const FILE_REF: TaskFileRef = {
	path: 'Projects/产品Alpha/Item-10.md',
	basename: 'Item-10',
};

function makeMockApp(files: Record<string, string>) {
	const fileMap = new Map<string, TFile>();
	for (const path of Object.keys(files)) {
		const f = new TFile() as TFile & { extension: string; basename: string; stat: { mtime: number; ctime: number; size: number } };
		f.path = path;
		f.extension = 'md';
		f.basename = (path.split('/').pop() || '').replace(/\.md$/, '');
		f.stat = { mtime: 1000, ctime: 1000, size: files[path].length };
		fileMap.set(path, f);
	}

	return {
		vault: {
			getAbstractFileByPath: (path: string) => fileMap.get(path) ?? null,
			getMarkdownFiles: () => Array.from(fileMap.values()),
			read: async (f: { path: string }) => files[f.path] ?? '',
			on: () => ({}),
			offref: () => {},
		},
		metadataCache: {
			getFileCache: () => null,
			on: () => ({}),
		},
	} as never;
}

describe('T2 两阶段缩进解析器（parseTasksFromContent）', () => {
	describe('1. 混合缩进与跳跃缩进（1-based 行号）', () => {
		it('支持 Tab(=4空格) 与空格混用，以及 0 → 6 → 2 空格回溯建树', () => {
			expect(calculateIndentWidth('')).toBe(0);
			expect(calculateIndentWidth('  ')).toBe(2);
			expect(calculateIndentWidth('\t')).toBe(4);
			expect(calculateIndentWidth(' \t ')).toBe(6);

			const content = [
				'- [ ] 阶段A 📅 2026-09-10',          // line 1, indent 0
				'      - [ ] 深层子任务1 📅 2026-09-11', // line 2, indent 6 -> parent 1
				'  - [ ] 同级子任务2 📅 2026-09-12',    // line 3, indent 2 -> 回溯到 parent 1
				'\t- [ ] Tab子任务 📅 2026-09-13',     // line 4, indent 4 -> parent 3 (indent 2 < 4)
				'  \t- [ ] 混合缩进孙任务 📅 2026-09-14', // line 5, indent 6 -> parent 4 (indent 4 < 6)
				'- [ ] 阶段B 📅 2026-09-20',          // line 6, indent 0 -> top-level
			].join('\n');

			const tasks = parseTasksFromContent(FILE_REF, content, ['tasks', 'dataview']);
			expect(tasks).toHaveLength(6);

			const byLine = new Map(tasks.map((t) => [t.lineNumber, t]));

			expect(byLine.get(1)?.indentWidth).toBe(0);
			expect(byLine.get(1)?.parentLineNumber).toBeUndefined();
			expect(byLine.get(1)?.childLineNumbers).toEqual([2, 3]);

			expect(byLine.get(2)?.indentWidth).toBe(6);
			expect(byLine.get(2)?.parentLineNumber).toBe(1);
			expect(byLine.get(2)?.childLineNumbers).toEqual([]);

			expect(byLine.get(3)?.indentWidth).toBe(2);
			expect(byLine.get(3)?.parentLineNumber).toBe(1);
			expect(byLine.get(3)?.childLineNumbers).toEqual([4]);

			expect(byLine.get(4)?.indentWidth).toBe(4);
			expect(byLine.get(4)?.parentLineNumber).toBe(3);
			expect(byLine.get(4)?.childLineNumbers).toEqual([5]);

			expect(byLine.get(5)?.indentWidth).toBe(6);
			expect(byLine.get(5)?.parentLineNumber).toBe(4);
			expect(byLine.get(5)?.childLineNumbers).toEqual([]);

			expect(byLine.get(6)?.indentWidth).toBe(0);
			expect(byLine.get(6)?.parentLineNumber).toBeUndefined();
			expect(byLine.get(6)?.childLineNumbers).toEqual([]);
		});
	});

	describe('2. YAML Frontmatter 与围栏代码块跳过', () => {
		it('跳过文件首行 --- 的 YAML Frontmatter 以及 ``` / ~~~ 代码块内伪任务', () => {
			const content = [
				'---',                                    // line 1
				'title: Item-10 排期',                         // line 2
				'note: "- [ ] Frontmatter伪任务 📅 2026-09-01"', // line 3
				'- [ ] 伪列表项',                          // line 4
				'---',                                    // line 5
				'- [ ] 真实父任务',                        // line 6
				'  ```markdown',                          // line 7
				'  - [ ] 反引号代码块伪任务 📅 2026-09-02', // line 8
				'  ```',                                  // line 9
				'  - [ ] 真实子任务1 📅 2026-09-10',       // line 10
				'~~~~text',                               // line 11
				'- [ ] 波浪线代码块伪任务 📅 2026-09-03',   // line 12
				'~~~',                                    // line 13 (长度不足4，不应提前闭合)
				'- [ ] 仍在波浪线代码块内 📅 2026-09-04',   // line 14
				'~~~~',                                   // line 15
				'  - [ ] 真实子任务2 📅 2026-09-15',       // line 16
			].join('\n');

			const tasks = parseTasksFromContent(FILE_REF, content, ['tasks', 'dataview']);
			expect(tasks.map((t) => [t.lineNumber, t.description])).toEqual([
				[6, '真实父任务'],
				[10, '真实子任务1'],
				[16, '真实子任务2'],
			]);
			expect(tasks[0].childLineNumbers).toEqual([10, 16]);
			expect(tasks[1].parentLineNumber).toBe(6);
			expect(tasks[2].parentLineNumber).toBe(6);
		});
	});

	describe('3. 清栈与保栈边界规则', () => {
		it('标题、分割线与零缩进段落清空缩进栈；空行与缩进备注保持父子链', () => {
			const content = [
				'## 第一阶段',                        // line 1 -> clear
				'- [ ] 设计阶段',                     // line 2, indent 0
				'  这是父任务下的缩进备注',            // line 3 -> keep stack
				'',                                   // line 4 -> keep stack
				'  - [ ] 方案评审 📅 2026-09-10',   // line 5, indent 2 -> parent 2
				'  - 普通缩进列表备注',                // line 6 -> keep stack
				'  - [ ] 模块开发 📅 2026-09-15',      // line 7, indent 2 -> parent 2
				'零缩进普通会议段落',                  // line 8 -> clear stack
				'  - [ ] 段落后缩进任务 📅 2026-09-18', // line 9, indent 2 -> no parent
				'## 第二阶段',                        // line 10 -> clear stack
				'  - [ ] 标题后缩进任务 📅 2026-09-20', // line 11, indent 2 -> no parent
				'- [ ] 验证父任务',                   // line 12, indent 0
				'---',                                // line 13 -> horizontal rule, clear stack
				'  - [ ] 分割线后任务 📅 2026-09-22',  // line 14, indent 2 -> no parent
			].join('\n');

			const tasks = parseTasksFromContent(FILE_REF, content, ['tasks', 'dataview']);
			const byLine = new Map(tasks.map((t) => [t.lineNumber, t]));

			expect(byLine.get(2)?.childLineNumbers).toEqual([5, 7]);
			expect(byLine.get(5)?.parentLineNumber).toBe(2);
			expect(byLine.get(7)?.parentLineNumber).toBe(2);

			expect(byLine.get(9)?.parentLineNumber).toBeUndefined();
			expect(byLine.get(11)?.parentLineNumber).toBeUndefined();
			expect(byLine.get(12)?.childLineNumbers).toEqual([]);
			expect(byLine.get(14)?.parentLineNumber).toBeUndefined();
		});
	});

	describe('4. 两阶段 globalFilter 过滤与 isVirtualContainer 语义', () => {
		it('开启 globalFilter 时保留合规子孙的无标记祖先为 isVirtualContainer=true，并丢弃孤立无标记任务', () => {
			const content = [
				'- [ ] 设计阶段',                              // line 1 (无 🎯，有合规孙子 -> 虚拟容器)
				'  - [ ] 评审子组',                          // line 2 (无 🎯，有合规儿子 -> 虚拟容器)
				'    - [ ] 🎯 方案评审 📅 2026-09-10',        // line 3 (合规)
				'  - [ ] 无标记杂项子任务',                     // line 4 (无 🎯 且无合规后代 -> 丢弃)
				'- [ ] 孤立无标记备忘',                         // line 5 (无 🎯 -> 丢弃)
				'- [ ] 🎯 顶层合规任务 📅 2026-09-20',          // line 6 (合规)
			].join('\n');

			const tasks = parseTasksFromContent(FILE_REF, content, ['tasks', 'dataview'], '🎯 ');
			expect(tasks.map((t) => t.lineNumber)).toEqual([1, 2, 3, 6]);

			const byLine = new Map(tasks.map((t) => [t.lineNumber, t]));

			expect(byLine.get(1)?.isVirtualContainer).toBe(true);
			expect(byLine.get(1)?.content).toBe('设计阶段');
			// 已被丢弃的 line 4 必须从 childLineNumbers 中清理
			expect(byLine.get(1)?.childLineNumbers).toEqual([2]);

			expect(byLine.get(2)?.isVirtualContainer).toBe(true);
			expect(byLine.get(2)?.parentLineNumber).toBe(1);
			expect(byLine.get(2)?.childLineNumbers).toEqual([3]);

			expect(byLine.get(3)?.isVirtualContainer).toBe(false);
			expect(byLine.get(3)?.parentLineNumber).toBe(2);
			expect(byLine.get(3)?.description).toBe('方案评审');

			expect(byLine.get(6)?.isVirtualContainer).toBe(false);
			expect(byLine.get(6)?.parentLineNumber).toBeUndefined();
		});

		it('globalFilter 为空时，无日期父节点仍保持 isVirtualContainer=false', () => {
			const content = [
				'- [ ] 无日期父任务',
				'  - [ ] 子任务 📅 2026-09-10',
			].join('\n');

			const tasks = parseTasksFromContent(FILE_REF, content, ['tasks', 'dataview'], '');
			expect(tasks).toHaveLength(2);
			expect(tasks[0].isVirtualContainer).toBe(false);
			expect(tasks[1].isVirtualContainer).toBe(false);
		});
	});
});

describe('T2 缓存指纹敏感性、双路径一致性与门面隔离', () => {
	it('fingerprintTask 对缩进宽度、父子行号及 isVirtualContainer 变更敏感', () => {
		const base: GCTask = {
			filePath: 'Projects/A/Item-10.md',
			fileName: 'Item-10',
			lineNumber: 2,
			content: '方案评审 📅 2026-09-10',
			description: '方案评审',
			completed: false,
			priority: 'normal',
			indentWidth: 0,
			parentLineNumber: undefined,
			childLineNumbers: [],
			isVirtualContainer: false,
		};

		const fpBase = fingerprintTask(base);
		expect(fingerprintTask({ ...base, indentWidth: 2 })).not.toBe(fpBase);
		expect(fingerprintTask({ ...base, parentLineNumber: 1 })).not.toBe(fpBase);
		expect(fingerprintTask({ ...base, childLineNumbers: [3] })).not.toBe(fpBase);
		expect(fingerprintTask({ ...base, isVirtualContainer: true })).not.toBe(fpBase);
	});

	it('MarkdownDataSource 仅修改缩进层级时能触发 updated 变更通知', async () => {
		const files: Record<string, string> = {
			'Projects/A/Item-10.md': [
				'- [ ] 任务A 📅 2026-09-10',
				'- [ ] 任务B 📅 2026-09-12',
			].join('\n'),
		};
		const changes: DataSourceChanges[] = [];
		const ds = new MarkdownDataSource(makeMockApp(files), new EventBus(), {
			enabled: true,
			syncDirection: 'import-only',
			autoSync: false,
			conflictResolution: 'local-win',
			globalFilter: '',
			enabledFormats: ['tasks', 'dataview'],
		});
		(ds as unknown as { changeHandler: (c: DataSourceChanges) => Promise<void> }).changeHandler =
			async (c) => { changes.push(c); };

		const anyDs = ds as unknown as { processFileModification: (p: string) => Promise<void> };
		await anyDs.processFileModification('Projects/A/Item-10.md');
		changes.length = 0;

		// 仅将任务B缩进 2 空格挂到任务A下，其余文本与日期完全不变
		files['Projects/A/Item-10.md'] = [
			'- [ ] 任务A 📅 2026-09-10',
			'  - [ ] 任务B 📅 2026-09-12',
		].join('\n');
		await anyDs.processFileModification('Projects/A/Item-10.md');

		expect(changes).toHaveLength(1);
		const updatedTasks = changes[0].updated.map((u) => u.task as GCTask);
		// 任务A 的 childLineNumbers 变为 [2]，任务B 的 indentWidth/parentLineNumber 均变化
		expect(updatedTasks).toHaveLength(2);
		const taskA = updatedTasks.find((t) => t.lineNumber === 1);
		const taskB = updatedTasks.find((t) => t.lineNumber === 2);
		expect(taskA?.childLineNumbers).toEqual([2]);
		expect(taskB?.indentWidth).toBe(2);
		expect(taskB?.parentLineNumber).toBe(1);
	});

	it('TaskStore.getAllTasks() 隔离虚拟父节点，getAllTasksIncludingVirtual() 保留全量', async () => {
		const files: Record<string, string> = {
			'Projects/产品Alpha/Item-10.md': [
				'---',
				'tags: [demo]',
				'---',
				'- [ ] 设计阶段',
				'  - [ ] 🎯 方案评审 🛫 2026-09-10 📅 2026-09-17',
				'  - [ ] 🎯 模块开发 🛫 2026-09-18 📅 2026-09-25',
				'- [ ] 无关杂项',
			].join('\n'),
		};

		const store = new TaskStore(makeMockApp(files));
		await store.initialize('🎯 ', ['tasks', 'dataview']);

		const realTasks = store.getAllTasks();
		const allWithVirtual = store.getAllTasksIncludingVirtual();

		expect(realTasks).toHaveLength(2);
		expect(realTasks.every((t) => !t.isVirtualContainer)).toBe(true);

		expect(allWithVirtual).toHaveLength(3);
		const virtualParent = allWithVirtual.find((t) => t.isVirtualContainer);
		expect(virtualParent).toBeDefined();
		expect(virtualParent?.description).toBe('设计阶段');
		expect(virtualParent?.lineNumber).toBe(4);
		expect(virtualParent?.childLineNumbers).toEqual([5, 6]);

		// 验证 calendarStore 同步维护 tasks 与 tasksWithVirtual
		useCalendarStore.getState().setTasks(realTasks, allWithVirtual);
		expect(useCalendarStore.getState().tasks).toHaveLength(2);
		expect(useCalendarStore.getState().tasksWithVirtual).toHaveLength(3);

		store.clear();
	});

	it('generateVirtualInstances 跳过 isVirtualContainer 节点', () => {
		const virtualParent: GCTask = {
			filePath: 'Projects/A/Item-10.md',
			fileName: 'Item-10',
			lineNumber: 1,
			content: '周期父容器 🔁 every week 📅 2026-09-01',
			description: '周期父容器',
			completed: false,
			priority: 'normal',
			repeat: 'every week',
			dueDate: new Date(2026, 8, 1),
			isVirtualContainer: true,
		};

		const instances = generateVirtualInstances(
			[virtualParent],
			new Date(2026, 8, 1),
			new Date(2026, 9, 1),
			'dueDate',
			5
		);
		expect(instances).toHaveLength(0);
	});
});
