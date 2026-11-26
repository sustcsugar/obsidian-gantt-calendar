/**
 * T6 端到端全链路集成测试（Phase 1 MVP 验收闭环）
 *
 * 覆盖完整链路：
 * Markdown 文本 → parseTasksFromContent → TaskStore（门面隔离）→
 * buildGanttTree / flattenGanttTree → 叶子改期写回联动汇总刷新 →
 * 虚拟父节点无破坏复选框回写与重扫稳定性。
 */
import { TFile } from 'obsidian';
import { TaskStore } from '../src/TaskStore';
import {
	buildGanttTree,
	flattenGanttTree,
	collectCollapseToFileLevelIds,
} from '../src/gantt/treeBuilder';
import { calculateInclusiveSpanDays } from '../src/gantt/wrappers/rollupGeometry';
import { updateTaskCompletion, updateTaskProperties } from '../src/tasks/taskUpdater';
import { PLUGIN_ID } from '../src/constants';
import type { GCTask } from '../src/types';

function createVaultHarness(initialFiles: Record<string, string>, globalTaskFilter = '🎯 ') {
	const files: Record<string, string> = { ...initialFiles };
	const fileObjs = new Map<string, TFile>();

	const ensureTFile = (path: string): TFile => {
		let f = fileObjs.get(path);
		if (!f) {
			const created = new TFile() as TFile & {
				extension: string;
				basename: string;
				stat: { mtime: number; ctime: number; size: number };
			};
			created.path = path;
			created.extension = 'md';
			created.basename = (path.split('/').pop() || '').replace(/\.md$/, '');
			created.stat = { mtime: 1000, ctime: 1000, size: files[path]?.length ?? 0 };
			fileObjs.set(path, created);
			f = created;
		}
		return f;
	};

	for (const path of Object.keys(files)) {
		ensureTFile(path);
	}

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => fileObjs.get(path) ?? null,
			getMarkdownFiles: () => Array.from(fileObjs.values()),
			read: async (file: { path: string }) => files[file.path] ?? '',
			modify: async (file: { path: string }, nextContent: string) => {
				files[file.path] = nextContent;
				const f = fileObjs.get(file.path);
				if (f) {
					f.stat = { ...f.stat, mtime: f.stat.mtime + 1000, size: nextContent.length };
				}
			},
			on: () => ({}),
			offref: () => {},
		},
		metadataCache: {
			getFileCache: () => null,
			on: () => ({}),
		},
		plugins: {
			getPlugin: (id: string) => (id === PLUGIN_ID
				? { settings: { globalTaskFilter, enabledTaskFormats: ['tasks', 'dataview'] } }
				: null),
		},
	} as never;

	return { app, files };
}

describe('T6 端到端全链路集成验证（Phase 1 闭环）', () => {
	const pathItem2 = 'Projects/产品Alpha/Item-2.md';
	const pathItem10 = 'Projects/产品Alpha/Item-10.md';
	const pathPlanB = 'Projects/产品Alpha/Plan-B.md';
	const pathRootTemp = 'Projects/临时任务.md';
	const pathOutside = 'Projects2/外部项目/干扰.md';

	const initialFiles: Record<string, string> = {
		[pathItem2]: [
			'---',
			'project: 产品Alpha',
			'fake: "- [ ] 🎯 Frontmatter伪任务 📅 2026-09-01"',
			'---',
			'## 节点排期',
			'- [ ] 设计阶段',
			'  这是缩进备注，不应断开父子关系',
			'  - [ ] 🎯 方案评审 🛫 2026-09-10 📅 2026-09-17',
			'  - [ ] 🎯 核心模块开发 🛫 2026-09-18 📅 2026-09-25',
			'  ```markdown',
			'  - [ ] 🎯 代码块内伪任务 🛫 2026-09-01 📅 2026-09-05',
			'  ```',
			'- [ ] 验证阶段1',
			'  - [ ] 🎯 集成联调与测试 🛫 2026-09-26 📅 2026-10-02',
			'  - [ ] 🎯 验收评审 🛫 2026-10-03 📅 2026-10-05',
			'- [ ] 无标记孤立备忘',
		].join('\n'),
		[pathItem10]: [
			'## 节点排期',
			'- [ ] 验证阶段1',
			'  - [ ] 🎯 集成联调 🛫 2026-09-15 📅 2026-09-22',
			'  - [ ] 🎯 验收评审 🛫 2026-09-23 📅 2026-09-26',
		].join('\n'),
		[pathPlanB]: [
			'## 节点排期',
			'- [ ] 验证阶段1',
			'  - [ ] 🎯 验收评审 🛫 2026-09-20 📅 2026-09-28',
		].join('\n'),
		[pathRootTemp]: [
			'- [ ] 🎯 根目录临时任务 📅 2026-09-12',
		].join('\n'),
		[pathOutside]: [
			'- [ ] 🎯 不应被 Projects 根目录包含 📅 2026-09-14',
		].join('\n'),
	};

	it('串联验证：解析与门面隔离 → 树形聚拢与三级汇总 → 叶子改期联动 → 虚拟父节点无破坏勾选', async () => {
		const { app, files } = createVaultHarness(initialFiles, '🎯 ');
		const store = new TaskStore(app);

		await store.initialize('🎯 ', ['tasks', 'dataview']);

		// ==================== 1. 解析与门面隔离 ====================
		const realTasks = store.getAllTasks();
		const allWithVirtual = store.getAllTasksIncludingVirtual();

		// 真实任务共 9 条：Item-2(4) + Item-10(2) + Plan-B(1) + 临时任务(1) + Projects2(1)
		expect(realTasks).toHaveLength(9);
		expect(realTasks.every((t) => !t.isVirtualContainer)).toBe(true);

		// 含虚拟父节点共 13 条：新增 Item-2(2个虚拟父阶段) + Item-10(1) + Plan-B(1)
		expect(allWithVirtual).toHaveLength(13);
		const virtualParents = allWithVirtual.filter((t) => t.isVirtualContainer);
		expect(virtualParents).toHaveLength(4);
		// 确认 Frontmatter、代码块伪任务与孤立无标记备忘均未进入任务集
		expect(allWithVirtual.some((t) => t.description.includes('伪任务'))).toBe(false);
		expect(allWithVirtual.some((t) => t.description.includes('孤立备忘'))).toBe(false);

		// ==================== 2. 聚拢、自然序与三级汇总 ====================
		const roots = buildGanttTree(allWithVirtual, {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
		});

		// Projects 根目录过滤排除 Projects2，得到「产品Alpha」与「未分类项目」两个顶层分组
		expect(roots.map((r) => r.label)).toEqual(['产品Alpha', '未分类项目']);

		const projectFolder = roots[0];
		expect(projectFolder.isRollupBar).toBe(true);
		// 产品Alpha内三型号按自然序聚拢：Item-2 → Item-10 → Plan-B
		expect(projectFolder.children.map((f) => f.label)).toEqual(['Item-2', 'Item-10', 'Plan-B']);

		const fileItem2 = projectFolder.children[0];
		const fileItem10 = projectFolder.children[1];
		const filePlanB = projectFolder.children[2];

		// Item-2：09-10 ~ 10-05（共 26 天），包含 4 个有效叶子任务
		expect(fileItem2.startStr).toBe('2026-09-10');
		expect(fileItem2.endStr).toBe('2026-10-05');
		expect(calculateInclusiveSpanDays(fileItem2.startStr, fileItem2.endStr)).toBe(26);
		expect(fileItem2.leafTaskCount).toBe(4);
		// Item-2 组内两个虚拟父阶段按开始日升序：设计阶段(09-10~09-25) → 验证阶段1(09-26~10-05)
		expect(fileItem2.children.map((t) => t.label)).toEqual(['设计阶段', '验证阶段1']);
		expect(fileItem2.children[0].isRollupBar).toBe(true);
		expect(fileItem2.children[0].startStr).toBe('2026-09-10');
		expect(fileItem2.children[0].endStr).toBe('2026-09-25');
		expect(fileItem2.children[1].startStr).toBe('2026-09-26');
		expect(fileItem2.children[1].endStr).toBe('2026-10-05');

		// Item-10：09-15 ~ 09-26，Plan-B：09-20 ~ 09-28
		expect(fileItem10.startStr).toBe('2026-09-15');
		expect(fileItem10.endStr).toBe('2026-09-26');
		expect(filePlanB.startStr).toBe('2026-09-20');
		expect(filePlanB.endStr).toBe('2026-09-28');

		// 文件夹级总跨度：09-10 ~ 10-05，总有效叶子数 4 + 2 + 1 = 7
		expect(projectFolder.startStr).toBe('2026-09-10');
		expect(projectFolder.endStr).toBe('2026-10-05');
		expect(projectFolder.leafTaskCount).toBe(7);

		// 收起至型号层：仅展示文件夹与各型号汇总行
		const fileCollapsedIds = new Set(collectCollapseToFileLevelIds(roots));
		const overviewRows = flattenGanttTree(roots, fileCollapsedIds);
		expect(overviewRows.map((n) => n.label)).toEqual(['产品Alpha', 'Item-2', 'Item-10', 'Plan-B', '未分类项目', '临时任务']);

		// 记录初始全展开 nodeId 列表用于后续稳定性对比
		const nodeIdsBefore = flattenGanttTree(roots, new Set()).map((n) => n.nodeId);

		// ==================== 3. 叶子改期写回联动三级汇总刷新 ====================
		const leafReviewItem2 = fileItem2.children[1].children[1].task as GCTask;
		expect(leafReviewItem2.description).toBe('验收评审');

		// 将 Item-2 的「验收评审」截止日从 2026-10-05 后移 5 天至 2026-10-10
		await updateTaskProperties(
			app,
			leafReviewItem2,
			{ dueDate: new Date(2026, 9, 10) },
			['tasks', 'dataview']
		);

		// 核验原 .md 仅目标行截止日更新，且缩进与相邻行完好
		const updatedItem2Lines = files[pathItem2].split('\n');
		const updatedLeafLine = updatedItem2Lines[leafReviewItem2.lineNumber - 1];
		expect(updatedLeafLine.startsWith('  - [ ] 🎯 验收评审 ')).toBe(true);
		expect(updatedLeafLine).toContain('📅 2026-10-10');
		expect(updatedItem2Lines[5]).toBe('- [ ] 设计阶段');

		await store.refreshFile(pathItem2);
		const rootsAfterDateChange = buildGanttTree(store.getAllTasksIncludingVirtual(), {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
		});

		const updatedProject = rootsAfterDateChange[0];
		const updatedFileItem2 = updatedProject.children[0];
		const updatedVerifyItem2 = updatedFileItem2.children[1];

		// 父阶段、型号文件、项目文件夹三级汇总条同步延展至 2026-10-10
		expect(updatedVerifyItem2.endStr).toBe('2026-10-10');
		expect(updatedFileItem2.endStr).toBe('2026-10-10');
		expect(updatedProject.endStr).toBe('2026-10-10');

		// ==================== 4. 虚拟父节点无破坏复选框回写 ====================
		const virtualHwParent = updatedFileItem2.children[0].task as GCTask;
		expect(virtualHwParent.isVirtualContainer).toBe(true);
		expect(virtualHwParent.description).toBe('设计阶段');

		// 勾选虚拟父节点
		await updateTaskCompletion(app, virtualHwParent, true, ['tasks', 'dataview']);
		expect(files[pathItem2].split('\n')[5]).toBe('- [x] 设计阶段');
		expect(files[pathItem2].split('\n')[5]).not.toContain('🎯');

		// 重扫后核验完成状态生效、且树结构与稳定 nodeId 完全不变
		await store.refreshFile(pathItem2);
		const rootsAfterCheck = buildGanttTree(store.getAllTasksIncludingVirtual(), {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
		});
		expect(rootsAfterCheck[0].children[0].children[0].task?.completed).toBe(true);
		expect(flattenGanttTree(rootsAfterCheck, new Set()).map((n) => n.nodeId)).toEqual(nodeIdsBefore);

		// 取消勾选虚拟父节点
		const checkedVirtualParent = rootsAfterCheck[0].children[0].children[0].task as GCTask;
		await updateTaskCompletion(app, checkedVirtualParent, false, ['tasks', 'dataview']);
		expect(files[pathItem2].split('\n')[5]).toBe('- [ ] 设计阶段');
		expect(files[pathItem2].split('\n')[5]).not.toContain('🎯');

		store.clear();
	});
});
