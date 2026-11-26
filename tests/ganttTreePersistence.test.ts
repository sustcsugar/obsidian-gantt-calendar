/**
 * T7 单元测试：甘特图树形分组维度切换（项目→型号 / 仅按型号）与状态持久化（calendarStore）
 */
import {
	buildGanttTree,
	flattenGanttTree,
	collectCollapseToFileLevelIds,
} from '../src/gantt/treeBuilder';
import { useCalendarStore } from '../src/ui/store/calendarStore';
import type { GCTask } from '../src/types';

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

describe('T7 分组维度切换（model-only vs project-model）', () => {
	const tasks: GCTask[] = [
		makeTask({
			filePath: 'Projects/产品Alpha/Item-10.md',
			lineNumber: 1,
			description: '验证阶段1',
			startDate: new Date(2026, 8, 15),
			dueDate: new Date(2026, 8, 25),
		}),
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
			startDate: new Date(2026, 8, 10),
			dueDate: new Date(2026, 8, 14),
		}),
		makeTask({
			filePath: 'Projects/产品Beta/Plan-B.md',
			lineNumber: 1,
			description: '集成联调',
			startDate: new Date(2026, 8, 18),
			dueDate: new Date(2026, 8, 28),
		}),
	];

	it('仅按型号模式跳过 folder 层，所有型号按自然序直接平铺在 depth=0', () => {
		const modelRoots = buildGanttTree(tasks, {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
			groupMode: 'model-only',
		});

		expect(modelRoots.map((n) => [n.type, n.label, n.depth])).toEqual([
			['file', 'Item-2', 0],
			['file', 'Item-10', 0],
			['file', 'Plan-B', 0],
		]);

		// Item-2 下顶层任务 depth=1，子任务 depth=2
		expect(modelRoots[0].children[0].depth).toBe(1);
		expect(modelRoots[0].children[0].children[0].depth).toBe(2);

		// 收起至型号层：仅剩 3 个型号汇总行
		const fileIds = collectCollapseToFileLevelIds(modelRoots);
		expect(fileIds).toHaveLength(3);
		const collapsed = flattenGanttTree(modelRoots, new Set(fileIds));
		expect(collapsed.map((n) => n.label)).toEqual(['Item-2', 'Item-10', 'Plan-B']);
	});

	it('切换分组维度前后，file 与 task 的 nodeId 100% 一致（折叠状态无损保留）', () => {
		const byProject = buildGanttTree(tasks, {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
			groupMode: 'project-model',
		});
		const byModel = buildGanttTree(tasks, {
			startField: 'startDate',
			endField: 'dueDate',
			rootFolder: 'Projects',
			groupMode: 'model-only',
		});

		const projectNonFolderIds = flattenGanttTree(byProject, new Set())
			.filter((n) => n.type !== 'folder')
			.map((n) => n.nodeId)
			.sort();
		const modelNonFolderIds = flattenGanttTree(byModel, new Set())
			.map((n) => n.nodeId)
			.sort();

		expect(modelNonFolderIds).toEqual(projectNonFolderIds);
	});
});

describe('T7 calendarStore 树形状态水合与持久化通知', () => {
	beforeEach(() => {
		useCalendarStore.getState().hydrateGanttTreeState('project-model', []);
	});

	it('hydrateGanttTreeState 正确恢复分组维度与去重后的折叠节点列表，并对异常值安全回退', () => {
		useCalendarStore.getState().hydrateGanttTreeState('model-only', [
			'file:Projects/A/Item-2.md',
			'file:Projects/A/Item-2.md',
			'',
		]);
		expect(useCalendarStore.getState().ganttGroupMode).toBe('model-only');
		expect(useCalendarStore.getState().ganttCollapsedIds).toEqual(['file:Projects/A/Item-2.md']);

		useCalendarStore.getState().hydrateGanttTreeState(undefined, null);
		expect(useCalendarStore.getState().ganttGroupMode).toBe('project-model');
		expect(useCalendarStore.getState().ganttCollapsedIds).toEqual([]);
	});

	it('toggleGanttNodeCollapsed / setGanttCollapsedIds / setGanttGroupMode 准确变更状态并触发订阅', () => {
		const snapshots: Array<{ mode: string; ids: string[] }> = [];
		const unsub = useCalendarStore.subscribe((state, prev) => {
			if (
				state.ganttGroupMode !== prev.ganttGroupMode ||
				state.ganttCollapsedIds !== prev.ganttCollapsedIds
			) {
				snapshots.push({ mode: state.ganttGroupMode, ids: state.ganttCollapsedIds });
			}
		});

		useCalendarStore.getState().toggleGanttNodeCollapsed('file:a.md');
		useCalendarStore.getState().toggleGanttNodeCollapsed('file:b.md');
		useCalendarStore.getState().toggleGanttNodeCollapsed('file:a.md');
		useCalendarStore.getState().setGanttGroupMode('model-only');
		useCalendarStore.getState().setGanttCollapsedIds([]);

		unsub();

		expect(snapshots).toEqual([
			{ mode: 'project-model', ids: ['file:a.md'] },
			{ mode: 'project-model', ids: ['file:a.md', 'file:b.md'] },
			{ mode: 'project-model', ids: ['file:b.md'] },
			{ mode: 'model-only', ids: ['file:b.md'] },
			{ mode: 'model-only', ids: [] },
		]);
	});
});
