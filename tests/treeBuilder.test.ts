/**
 * T3 单元测试：甘特图树构建、筛选剪枝、汇总计算与展平纯函数模块
 */
import {
	buildGanttTree,
	flattenGanttTree,
	collectCollapsibleNodeIds,
	collectCollapseToFileLevelIds,
	formatLocalDateStr,
} from '../src/gantt/treeBuilder';
import { parseTasksFromContent } from '../src/tasks/taskParser/main';
import { virtualTaskMetadata } from '../src/tasks/virtualTaskGenerator';
import type { GCTask } from '../src/types';

function d(year: number, month: number, day: number): Date {
	return new Date(year, month - 1, day);
}

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

describe('T3 treeBuilder 纯函数引擎', () => {
	describe('1. 同目录多型号重名工序聚拢、自然序与组内日期排序', () => {
		it('Item-2 / Item-10 / Plan-B 按自然序分块聚拢，且组内同级任务按开始日严格升序', () => {
			const tasks: GCTask[] = [
				// 故意打乱输入顺序：Plan-B → Item-10 → Item-2
				makeTask({
					filePath: 'Projects/产品Alpha/Plan-B.md',
					lineNumber: 2,
					description: '验收评审',
					startDate: d(2026, 10, 3),
					dueDate: d(2026, 10, 5),
				}),
				makeTask({
					filePath: 'Projects/产品Alpha/Plan-B.md',
					lineNumber: 1,
					description: '验证阶段1',
					startDate: d(2026, 9, 20),
					dueDate: d(2026, 9, 30),
				}),
				makeTask({
					filePath: 'Projects/产品Alpha/Item-10.md',
					lineNumber: 2,
					description: '验收评审',
					startDate: d(2026, 9, 26),
					dueDate: d(2026, 9, 28),
				}),
				makeTask({
					filePath: 'Projects/产品Alpha/Item-10.md',
					lineNumber: 1,
					description: '验证阶段1',
					startDate: d(2026, 9, 15),
					dueDate: d(2026, 9, 25),
				}),
				makeTask({
					filePath: 'Projects/产品Alpha/Item-2.md',
					lineNumber: 3,
					description: '验收评审',
					startDate: d(2026, 9, 18),
					dueDate: d(2026, 9, 19),
				}),
				makeTask({
					filePath: 'Projects/产品Alpha/Item-2.md',
					lineNumber: 2,
					description: '验证阶段1',
					startDate: d(2026, 9, 10),
					dueDate: d(2026, 9, 17),
				}),
			];

			const roots = buildGanttTree(tasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
			});

			expect(roots).toHaveLength(1);
			const project = roots[0];
			expect(project.type).toBe('folder');
			expect(project.label).toBe('产品Alpha');
			expect(project.depth).toBe(0);
			expect(project.isRollupBar).toBe(true);
			expect(project.startStr).toBe('2026-09-10');
			expect(project.endStr).toBe('2026-10-05');

			// 自然序：Item-2 → Item-10 → Plan-B
			expect(project.children.map((f) => f.label)).toEqual(['Item-2', 'Item-10', 'Plan-B']);
			expect(project.children.every((f) => f.type === 'file' && f.depth === 1 && f.isRollupBar)).toBe(true);

			// 每个型号内部按开始日期升序排列，绝不穿插
			for (const fileNode of project.children) {
				expect(fileNode.children.map((t) => t.label)).toEqual(['验证阶段1', '验收评审']);
				expect(fileNode.children.every((t) => t.depth === 2 && !t.isRollupBar)).toBe(true);
			}
		});
	});

	describe('2. ganttRootFolder 过滤边界、无子目录兜底与三级目录合并', () => {
		it('Projects 不误匹配 Projects2；根目录直属文件归入兜底分组；三级目录合并中间路径', () => {
			const tasks: GCTask[] = [
				makeTask({
					filePath: 'Projects/临时任务.md',
					lineNumber: 1,
					description: '直属任务',
					dueDate: d(2026, 9, 5),
				}),
				makeTask({
					filePath: 'Projects\\项目A\\子阶段\\型号01.md',
					lineNumber: 1,
					description: '三级任务',
					dueDate: d(2026, 9, 8),
				}),
				makeTask({
					filePath: 'Projects2/干扰项目/误匹配.md',
					lineNumber: 1,
					description: '不应出现',
					dueDate: d(2026, 9, 10),
				}),
			];

			const roots = buildGanttTree(tasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: '/Projects/',
			});

			const folderNames = roots.map((r) => r.label);
			expect(folderNames).toContain('未分类项目');
			expect(folderNames).toContain('项目A / 子阶段');
			expect(folderNames).not.toContain('干扰项目');

			const nestedFolder = roots.find((r) => r.label === '项目A / 子阶段');
			expect(nestedFolder?.children[0].label).toBe('型号01');
			expect(nestedFolder?.children[0].filePath).toBe('Projects/项目A/子阶段/型号01.md');
		});
	});

	describe('3. 单日期回退、无日期父任务汇总与子节点越界标记', () => {
		it('支持单日期里程碑回退、倒置日期校正、无日期父任务汇总条及有日期父任务越界检测', () => {
			const tasks: GCTask[] = [
				// 1) 无日期父任务 + 两个单日期子任务（一个仅 startDate，一个仅 dueDate）
				makeTask({
					filePath: 'Projects/P1/Item-2.md',
					lineNumber: 1,
					description: '设计阶段',
					childLineNumbers: [2, 3],
				}),
				makeTask({
					filePath: 'Projects/P1/Item-2.md',
					lineNumber: 2,
					description: '仅开始日里程碑',
					parentLineNumber: 1,
					indentWidth: 2,
					startDate: d(2026, 9, 10),
				}),
				makeTask({
					filePath: 'Projects/P1/Item-2.md',
					lineNumber: 3,
					description: '仅截止日里程碑',
					parentLineNumber: 1,
					indentWidth: 2,
					dueDate: d(2026, 9, 18),
				}),
				// 2) 自带日期父任务，但子任务截止日超出父任务范围
				makeTask({
					filePath: 'Projects/P1/Item-2.md',
					lineNumber: 4,
					description: '验证阶段1',
					startDate: d(2026, 9, 20),
					dueDate: d(2026, 9, 25),
					childLineNumbers: [5],
				}),
				makeTask({
					filePath: 'Projects/P1/Item-2.md',
					lineNumber: 5,
					description: '延期子任务',
					parentLineNumber: 4,
					indentWidth: 2,
					startDate: d(2026, 9, 21),
					dueDate: d(2026, 9, 30),
				}),
				// 3) 倒置日期任务（start > end）安全校正
				makeTask({
					filePath: 'Projects/P1/Item-2.md',
					lineNumber: 6,
					description: '倒置日期任务',
					startDate: d(2026, 10, 5),
					dueDate: d(2026, 10, 1),
				}),
				// 4) 无日期无子任务的孤立备忘（应被有效日期剪枝剔除）
				makeTask({
					filePath: 'Projects/P1/Item-2.md',
					lineNumber: 7,
					description: '无日期孤立备忘',
				}),
			];

			const roots = buildGanttTree(tasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
			});

			const fileTasks = roots[0].children[0].children;
			expect(fileTasks.map((t) => t.label)).toEqual(['设计阶段', '验证阶段1', '倒置日期任务']);

			// 设计阶段：无自身日期 → 汇总条，跨度 09-10 ~ 09-18
			const hw = fileTasks[0];
			expect(hw.isRollupBar).toBe(true);
			expect(hw.hasOwnDate).toBe(false);
			expect(hw.startStr).toBe('2026-09-10');
			expect(hw.endStr).toBe('2026-09-18');
			expect(hw.children[0].startStr).toBe('2026-09-10');
			expect(hw.children[0].endStr).toBe('2026-09-10');
			expect(hw.children[1].startStr).toBe('2026-09-18');
			expect(hw.children[1].endStr).toBe('2026-09-18');

			// 验证阶段1：保留自身日期 09-20 ~ 09-25，标记 hasOutOfBoundsChildren = true
			const trial = fileTasks[1];
			expect(trial.isRollupBar).toBe(false);
			expect(trial.hasOwnDate).toBe(true);
			expect(trial.startStr).toBe('2026-09-20');
			expect(trial.endStr).toBe('2026-09-25');
			expect(trial.hasOutOfBoundsChildren).toBe(true);

			// 倒置日期校正：start = end = 2026-10-05
			const inverted = fileTasks[2];
			expect(inverted.startStr).toBe('2026-10-05');
			expect(inverted.endStr).toBe('2026-10-05');
			expect(formatLocalDateStr(inverted.computedStart)).toBe('2026-10-05');
		});

		it('有日期父任务下的无日期子任务予以保留并继承父任务时间跨度，而顶层无日期任务仍被剔除', () => {
			const content = [
				'- [ ] 🎯 [Item-2] 阶段方案评审 🛫 2026-09-30 📅 2026-09-30',
				'  - [ ] 🎯 [Item-2] 模块A：核心功能联调',
				'    - [ ] 🎯 子模块检查项',
				'  - [ ] 🎯 [Item-2] 模块B：初版完成',
				'- [ ] 🎯 收尾备忘',
			].join('\n');

			const tasks = parseTasksFromContent(
				{ path: 'Projects/产品Alpha/Item-2.md', basename: 'Item-2' },
				content,
				['tasks', 'dataview'],
				'🎯 '
			);

			const roots = buildGanttTree(tasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
			});

			const fileItem2 = roots[0].children[0];
			// 顶层无日期「收尾备忘」仍被剔除，仅保留有日期的父任务
			expect(fileItem2.children).toHaveLength(1);
			const parentNode = fileItem2.children[0];
			expect(parentNode.label).toBe('[Item-2] 阶段方案评审');
			expect(parentNode.hasOutOfBoundsChildren).toBe(false);
			expect(parentNode.children.map((c) => c.label)).toEqual([
				'[Item-2] 模块A：核心功能联调',
				'[Item-2] 模块B：初版完成',
			]);

			// 两个无日期子任务保留、继承 2026-09-30 且按文档原序展示
			const hwChild = parentNode.children[0];
			const swChild = parentNode.children[1];
			expect(hwChild.startStr).toBe('2026-09-30');
			expect(hwChild.endStr).toBe('2026-09-30');
			expect(hwChild.children[0].label).toBe('子模块检查项');
			expect(hwChild.children[0].isInheritedDate).toBe(true);
			expect(hwChild.children[0].startStr).toBe('2026-09-30');

			expect(swChild.isInheritedDate).toBe(true);
			expect(swChild.isRollupBar).toBe(false);
			expect(swChild.startStr).toBe('2026-09-30');
			expect(swChild.endStr).toBe('2026-09-30');
		});

		it('周期虚拟实例不覆盖真实任务行号映射，异常环路安全降级', () => {
			const realParent = makeTask({
				filePath: 'Projects/P1/Item-2.md',
				lineNumber: 1,
				description: '周会',
				startDate: d(2026, 9, 1),
				dueDate: d(2026, 9, 1),
				childLineNumbers: [2],
			});
			const virtualOccurrence = makeTask({
				filePath: 'Projects/P1/Item-2.md',
				lineNumber: 1,
				description: '周会',
				startDate: d(2026, 9, 8),
				dueDate: d(2026, 9, 8),
			});
			virtualTaskMetadata.set(virtualOccurrence, {
				sourceTaskId: 'Projects/P1/Item-2.md:1',
				occurrenceDate: d(2026, 9, 8),
			});
			const child = makeTask({
				filePath: 'Projects/P1/Item-2.md',
				lineNumber: 2,
				description: '会前准备',
				parentLineNumber: 1,
				indentWidth: 2,
				dueDate: d(2026, 9, 2),
			});

			const roots = buildGanttTree([virtualOccurrence, realParent, child], {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
			});

			const topTasks = roots[0].children[0].children;
			expect(topTasks).toHaveLength(2);
			// 真实父任务持有 child，虚拟实例不抢占
			expect(topTasks[0].children).toHaveLength(1);
			expect(topTasks[0].children[0].label).toBe('会前准备');
			expect(topTasks[1].children).toHaveLength(0);
			// 两个同标题节点的 nodeId 必须互异
			expect(topTasks[0].nodeId).not.toBe(topTasks[1].nodeId);
		});
	});

	describe('4. 稳定 nodeId 验证（文档顶部插入行后不漂移）', () => {
		it('文件顶部插入 5 行导致 lineNumber 全体 +5，生成的全树 nodeId 100% 一致', () => {
			const body = [
				'- [ ] 设计阶段',
				'  - [ ] 评审 📅 2026-09-10',
				'  - [ ] 评审 📅 2026-09-15',
				'- [ ] 验证阶段1 🛫 2026-09-20 📅 2026-09-28',
				'  - [ ] 集成联调 📅 2026-09-24',
			].join('\n');

			const shiftedBody = [
				'# 新增文档说明',
				'说明段落1',
				'说明段落2',
				'说明段落3',
				'',
				body,
			].join('\n');

			const fileRef = { path: 'Projects/产品Alpha/Item-10.md', basename: 'Item-10' };
			const tasksBefore = parseTasksFromContent(fileRef, body, ['tasks', 'dataview']);
			const tasksAfter = parseTasksFromContent(fileRef, shiftedBody, ['tasks', 'dataview']);

			expect(tasksAfter[0].lineNumber).toBe(tasksBefore[0].lineNumber + 5);

			const treeBefore = buildGanttTree(tasksBefore, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
			});
			const treeAfter = buildGanttTree(tasksAfter, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
			});

			const idsBefore = flattenGanttTree(treeBefore, new Set()).map((n) => n.nodeId);
			const idsAfter = flattenGanttTree(treeAfter, new Set()).map((n) => n.nodeId);

			expect(idsAfter).toEqual(idsBefore);
			// 同父节点下的两个重名"评审"应拥有不同序号后缀
			const reviewIds = idsBefore.filter((id) => id.includes('评审'));
			expect(reviewIds).toHaveLength(2);
			expect(reviewIds[0]).not.toBe(reviewIds[1]);
		});
	});

	describe('5. 筛选联动剪枝（搜子任务/搜父任务/搜型号名/层级标签）', () => {
		const sampleTasks: GCTask[] = [
			makeTask({
				filePath: 'Projects/产品Alpha/Item-2.md',
				lineNumber: 1,
				description: '设计阶段',
				childLineNumbers: [2, 3],
			}),
			makeTask({
				filePath: 'Projects/产品Alpha/Item-2.md',
				lineNumber: 2,
				description: '方案评审',
				parentLineNumber: 1,
				indentWidth: 2,
				startDate: d(2026, 9, 10),
				dueDate: d(2026, 9, 12),
				tags: ['design/spec'],
			}),
			makeTask({
				filePath: 'Projects/产品Alpha/Item-2.md',
				lineNumber: 3,
				description: '模块开发',
				parentLineNumber: 1,
				indentWidth: 2,
				startDate: d(2026, 9, 13),
				dueDate: d(2026, 9, 20),
				tags: ['design/impl'],
			}),
			makeTask({
				filePath: 'Projects/产品Alpha/Item-10.md',
				lineNumber: 1,
				description: '开发阶段',
				startDate: d(2026, 9, 15),
				dueDate: d(2026, 9, 30),
				childLineNumbers: [2],
				tags: ['dev'],
			}),
			makeTask({
				filePath: 'Projects/产品Alpha/Item-10.md',
				lineNumber: 2,
				description: '联调测试',
				parentLineNumber: 1,
				indentWidth: 2,
				startDate: d(2026, 9, 18),
				dueDate: d(2026, 9, 25),
				completed: true,
				status: 'done',
				tags: ['dev/core'],
			}),
		];

		it('搜索子任务“评审”保留完整祖先链，并重新收缩父汇总条跨度', () => {
			const roots = buildGanttTree(sampleTasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
				searchQuery: '评审',
			});

			expect(roots).toHaveLength(1);
			expect(roots[0].children).toHaveLength(1);
			expect(roots[0].children[0].label).toBe('Item-2');

			const hw = roots[0].children[0].children[0];
			expect(hw.label).toBe('设计阶段');
			expect(hw.children.map((c) => c.label)).toEqual(['方案评审']);
			// 汇总条自动收缩至匹配项 09-10 ~ 09-12（不再包含未命中的 模块开发 09-20）
			expect(hw.startStr).toBe('2026-09-10');
			expect(hw.endStr).toBe('2026-09-12');
		});

		it('搜索父任务“设计阶段”保留该父任务及其全部有效子任务', () => {
			const roots = buildGanttTree(sampleTasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
				searchQuery: '设计阶段',
			});

			const hw = roots[0].children[0].children[0];
			expect(hw.label).toBe('设计阶段');
			expect(hw.children.map((c) => c.label)).toEqual(['方案评审', '模块开发']);
		});

		it('搜索型号名“Item-10”保留该型号有效任务，且同时受状态筛选约束', () => {
			const roots = buildGanttTree(sampleTasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
				searchQuery: 'Item-10',
				statusFilter: { selectedStatuses: ['done'] },
			});

			expect(roots).toHaveLength(1);
			expect(roots[0].children.map((f) => f.label)).toEqual(['Item-10']);
			const sw = roots[0].children[0].children[0];
			expect(sw.label).toBe('开发阶段');
			expect(sw.children.map((c) => c.label)).toEqual(['联调测试']);
		});

		it('层级标签筛选：选父标签 hardware 可命中 design/spec 与 design/impl', () => {
			const roots = buildGanttTree(sampleTasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
				tagFilter: { selectedTags: ['design'], operator: 'OR' },
			});

			expect(roots).toHaveLength(1);
			expect(roots[0].children.map((f) => f.label)).toEqual(['Item-2']);
			expect(roots[0].children[0].children[0].children.map((c) => c.label)).toEqual([
				'方案评审',
				'模块开发',
			]);
		});
	});

	describe('6. flattenGanttTree 与快捷折叠辅助函数', () => {
		it('在全部展开 / 折叠至型号层 / 部分折叠 / 全部折叠下输出正确行数与顺序', () => {
			const tasks: GCTask[] = [
				makeTask({
					filePath: 'Projects/产品Alpha/Item-2.md',
					lineNumber: 1,
					description: '设计阶段',
					childLineNumbers: [2],
				}),
				makeTask({
					filePath: 'Projects/产品Alpha/Item-2.md',
					lineNumber: 2,
					description: '方案评审',
					parentLineNumber: 1,
					indentWidth: 2,
					dueDate: d(2026, 9, 10),
				}),
				makeTask({
					filePath: 'Projects/产品Alpha/Item-10.md',
					lineNumber: 1,
					description: '验证阶段1',
					dueDate: d(2026, 9, 20),
				}),
			];

			const roots = buildGanttTree(tasks, {
				startField: 'startDate',
				endField: 'dueDate',
				rootFolder: 'Projects',
			});

			// 全部展开：folder(1) + Item-2(1) + 设计阶段(1) + 方案评审(1) + Item-10(1) + 验证阶段1(1) = 6
			const expanded = flattenGanttTree(roots, new Set());
			expect(expanded.map((n) => n.label)).toEqual([
				'产品Alpha',
				'Item-2',
				'设计阶段',
				'方案评审',
				'Item-10',
				'验证阶段1',
			]);

			// 仅折叠父任务“设计阶段”：隐藏“方案评审”，剩余 5 行
			const hwNodeId = roots[0].children[0].children[0].nodeId;
			const partialCollapsed = flattenGanttTree(roots, new Set([hwNodeId]));
			expect(partialCollapsed.map((n) => n.label)).toEqual([
				'产品Alpha',
				'Item-2',
				'设计阶段',
				'Item-10',
				'验证阶段1',
			]);

			// 折叠至型号层：仅显示 folder + Item-2 + Item-10（多型号汇总大盘）
			const fileLevelIds = collectCollapseToFileLevelIds(roots);
			expect(fileLevelIds).toHaveLength(2);
			const fileLevelRows = flattenGanttTree(roots, new Set(fileLevelIds));
			expect(fileLevelRows.map((n) => n.label)).toEqual(['产品Alpha', 'Item-2', 'Item-10']);

			// 一键全部折叠：仅剩顶层 folder
			const allCollapsibleIds = collectCollapsibleNodeIds(roots);
			expect(allCollapsibleIds).toHaveLength(4); // folder + Item-2 + 设计阶段 + Item-10
			const collapsedAll = flattenGanttTree(roots, new Set(allCollapsibleIds));
			expect(collapsedAll.map((n) => n.label)).toEqual(['产品Alpha']);
		});
	});
});
