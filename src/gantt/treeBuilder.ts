/**
 * 甘特图树构建、筛选剪枝、汇总计算与展平纯函数模块
 *
 * 零 DOM / Obsidian 运行时依赖，可独立单元测试。
 * 层级结构：folder (depth=0) → file (depth=1) → task (depth=2) → sub-task (depth=3+)
 */

import type { GCTask } from '../types';
import { isVirtualTask } from '../tasks/virtualTaskGenerator';
import { applyStatusFilter, applyTagFilter } from '../ui/utils/taskFilters';
import { RegularExpressions } from '../utils/RegularExpressions';
import { resolveGanttTaskDateRange } from './dateRangeResolver';
import type {
	DateFieldType,
	GanttTreeBuildOptions,
	GanttTreeNode,
} from './types';

export type { GanttNodeType, GanttGroupMode, GanttTreeNode, GanttTreeBuildOptions } from './types';

const DEFAULT_UNCATEGORIZED_FOLDER = '未分类项目';

interface DateRange {
	start: Date;
	end: Date;
}

interface TaskDraft {
	task: GCTask;
	nodeId: string;
	label: string;
	ownDate: DateRange | null;
	children: TaskDraft[];
}

interface FileBucket {
	filePath: string;
	projectFolder: string;
	modelFileName: string;
	tasks: GCTask[];
}

// ==================== 路径与日期工具 ====================

/**
 * 规范化 Vault 路径：反斜杠转为正斜杠并去除首尾斜杠
 */
export function normalizeVaultPath(rawPath: string): string {
	return rawPath
		.split('\\')
		.join('/')
		.trim()
		.replace(RegularExpressions.MarkdownLexical.leadingTrailingSlashRegex, '');
}

/**
 * 将 Date 归一化为本地零点日期对象
 */
function toLocalMidnight(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 格式化本地 YYYY-MM-DD 字符串（严禁使用 toISOString() 避免跨时区差一天）
 */
export function formatLocalDateStr(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * 中文与数字自然序比较（确保 Item-2 排在 Item-10 之前）
 */
function naturalCompare(a: string, b: string): number {
	return a.localeCompare(b, 'zh-CN', { numeric: true });
}

/**
 * 归一化任务标题用于稳定 nodeId 生成
 */
function normalizeTaskTitle(task: GCTask): string {
	const raw = (task.description || task.content || '').trim();
	return raw.replace(RegularExpressions.DescriptionExtraction.collapseWhitespace, ' ') || '无标题任务';
}

/**
 * 拆分相对路径得到一级项目文件夹名与型号文件名
 */
function splitRelativePath(
	relativePath: string,
	uncategorizedLabel: string
): { projectFolder: string; modelFileName: string } {
	const segments = relativePath.split('/').filter(Boolean);
	const fileSegment = segments.length > 0 ? segments[segments.length - 1] : '';
	const modelFileName = fileSegment.replace(RegularExpressions.markdownFileExtensionRegex, '') || '未命名文件';
	const dirSegments = segments.slice(0, -1);

	let projectFolder: string;
	if (dirSegments.length === 0) {
		projectFolder = uncategorizedLabel;
	} else if (dirSegments.length === 1) {
		projectFolder = dirSegments[0];
	} else {
		projectFolder = dirSegments.join(' / ');
	}

	return { projectFolder, modelFileName };
}

/**
 * 读取任务自身起止日期：复用 TaskDataAdapter 同源开始日期回退链（createdDate / startDate），
 * 同时支持单日期里程碑回退（start = end = singleDate）与倒置校正，保证汇总条与实体条口径 100% 一致。
 */
function resolveOwnDateRange(
	task: GCTask,
	startField: DateFieldType,
	endField: DateFieldType
): DateRange | null {
	const resolved = resolveGanttTaskDateRange(task, startField, endField, {
		allowSingleDateFallback: true,
	});
	if (!resolved) {
		return null;
	}
	const start = toLocalMidnight(resolved.startDate);
	const end = toLocalMidnight(resolved.endDate);
	return {
		start,
		end: start.getTime() > end.getTime() ? start : end,
	};
}

// ==================== 文件内父子组装与稳定 nodeId ====================

/**
 * 将单个文件内的任务列表按 1-based parentLineNumber 组装为任务森林并分配稳定 nodeId
 */
function buildFileTaskForest(
	normalizedFilePath: string,
	fileTasks: GCTask[],
	startField: DateFieldType,
	endField: DateFieldType
): TaskDraft[] {
	// 按行号升序排列，确保同父节点下重名任务的出现顺序确定
	const orderedTasks = [...fileTasks].sort((a, b) => a.lineNumber - b.lineNumber);

	const drafts: TaskDraft[] = orderedTasks.map((task) => ({
		task,
		nodeId: '',
		label: normalizeTaskTitle(task),
		ownDate: resolveOwnDateRange(task, startField, endField),
		children: [],
	}));

	// 建立 1-based lineNumber → 真实任务草稿映射（周期虚拟实例不得覆盖真实任务映射）
	const realDraftByLine = new Map<number, TaskDraft>();
	for (const draft of drafts) {
		if (!isVirtualTask(draft.task) && !realDraftByLine.has(draft.task.lineNumber)) {
			realDraftByLine.set(draft.task.lineNumber, draft);
		}
	}

	// 检测将 child 挂到 parent 下是否会形成环路
	const createsCycle = (childDraft: TaskDraft, candidateParentLine: number): boolean => {
		const visited = new Set<number>([childDraft.task.lineNumber]);
		let currentLine: number | undefined = candidateParentLine;
		while (currentLine !== undefined) {
			if (visited.has(currentLine)) return true;
			visited.add(currentLine);
			const parentDraft = realDraftByLine.get(currentLine);
			if (!parentDraft) break;
			currentLine = parentDraft.task.parentLineNumber;
		}
		return false;
	};

	const rootDrafts: TaskDraft[] = [];
	for (const draft of drafts) {
		const parentLine = draft.task.parentLineNumber;
		if (parentLine !== undefined) {
			const parentDraft = realDraftByLine.get(parentLine);
			if (parentDraft && parentDraft !== draft && !createsCycle(draft, parentLine)) {
				parentDraft.children.push(draft);
				continue;
			}
		}
		rootDrafts.push(draft);
	}

	// 按文档顺序自顶向下分配稳定 nodeId（不含行号，插入/删除上方行时保持不变）
	const assignStableIds = (siblings: TaskDraft[], parentTaskKey: string): void => {
		const titleCountMap = new Map<string, number>();
		for (const draft of siblings) {
			const ordinal = (titleCountMap.get(draft.label) ?? 0) + 1;
			titleCountMap.set(draft.label, ordinal);

			const localSegment = `${draft.label}#${ordinal}`;
			draft.nodeId = `task:${normalizedFilePath}::${parentTaskKey}::${localSegment}`;

			const nextParentKey = parentTaskKey === 'root' ? localSegment : `${parentTaskKey}/${localSegment}`;
			if (draft.children.length > 0) {
				assignStableIds(draft.children, nextParentKey);
			}
		}
	};

	assignStableIds(rootDrafts, 'root');
	return rootDrafts;
}

// ==================== 有效日期剪枝与筛选联动剪枝 ====================

/**
 * 第一步：有效日期剪枝
 * - 剔除无自身日期、无带日期后代、且无有日期祖先的孤立任务
 * - 若某无日期子任务位于有日期的父任务（或祖先任务）之下，则予以保留并在汇总阶段继承最近有日期祖先的跨度
 */
function pruneByValidDates(
	drafts: TaskDraft[],
	inheritedDate?: DateRange
): TaskDraft[] {
	const kept: TaskDraft[] = [];
	for (const draft of drafts) {
		const hasEffectiveOwnDate = !draft.task.isVirtualContainer && draft.ownDate !== null;
		const nextInheritedDate = hasEffectiveOwnDate && draft.ownDate ? draft.ownDate : inheritedDate;
		const validChildren = pruneByValidDates(draft.children, nextInheritedDate);
		if (hasEffectiveOwnDate || validChildren.length > 0 || inheritedDate !== undefined) {
			kept.push({
				...draft,
				children: validChildren,
			});
		}
	}
	return kept;
}

/**
 * 复用 src/ui/utils/taskFilters.ts 的状态与层级标签筛选逻辑判断单个任务
 */
function matchesStatusAndTagFilters(
	task: GCTask,
	options: GanttTreeBuildOptions
): boolean {
	if (task.isVirtualContainer) {
		return false;
	}
	if (options.statusFilter && options.statusFilter.selectedStatuses.length > 0) {
		if (applyStatusFilter([task], options.statusFilter).length === 0) {
			return false;
		}
	}
	if (options.tagFilter && options.tagFilter.selectedTags.length > 0) {
		if (applyTagFilter([task], options.tagFilter).length === 0) {
			return false;
		}
	}
	return true;
}

function taskMatchesSearchQuery(task: GCTask, normalizedQuery: string): boolean {
	if (!normalizedQuery) return true;
	const desc = (task.description || '').toLowerCase();
	if (desc.includes(normalizedQuery)) return true;
	const content = (task.content || '').toLowerCase();
	return content.includes(normalizedQuery);
}

/**
 * 第二步：筛选联动剪枝（保留命中叶子节点的祖先链；父节点命中则保留其有效子树）
 */
function pruneByFilters(
	drafts: TaskDraft[],
	options: GanttTreeBuildOptions,
	normalizedQuery: string,
	ancestorQueryMatched: boolean
): TaskDraft[] {
	const kept: TaskDraft[] = [];
	const hasQuery = normalizedQuery.length > 0;

	for (const draft of drafts) {
		const selfStatusAndTagOk = matchesStatusAndTagFilters(draft.task, options);
		const selfQueryOk = !hasQuery || ancestorQueryMatched || taskMatchesSearchQuery(draft.task, normalizedQuery);
		const selfDirectMatch = selfStatusAndTagOk && selfQueryOk;

		if (selfDirectMatch) {
			// 父任务自身命中条件（且非 isVirtualContainer）：保留自身及其下属有效子任务
			kept.push(draft);
			continue;
		}

		const prunedChildren = pruneByFilters(
			draft.children,
			options,
			normalizedQuery,
			ancestorQueryMatched
		);
		if (prunedChildren.length > 0) {
			kept.push({
				...draft,
				children: prunedChildren,
			});
		}
	}

	return kept;
}

// ==================== 汇总计算与排序 ====================

function finalizeTaskNodes(
	drafts: TaskDraft[],
	filePath: string,
	depth: number,
	inheritedDate?: DateRange
): GanttTreeNode[] {
	const nodes: GanttTreeNode[] = [];

	for (const draft of drafts) {
		const hasOwnDate = !draft.task.isVirtualContainer && draft.ownDate !== null;
		const nextInheritedDate = hasOwnDate && draft.ownDate ? draft.ownDate : inheritedDate;
		const children = finalizeTaskNodes(draft.children, filePath, depth + 1, nextInheritedDate);

		let childMinStart: Date | undefined;
		let childMaxEnd: Date | undefined;
		let childLeafCount = 0;
		let childCompletedCount = 0;

		for (const child of children) {
			if (!childMinStart || child.computedStart.getTime() < childMinStart.getTime()) {
				childMinStart = child.computedStart;
			}
			if (!childMaxEnd || child.computedEnd.getTime() > childMaxEnd.getTime()) {
				childMaxEnd = child.computedEnd;
			}
			childLeafCount += child.leafTaskCount ?? 0;
			childCompletedCount += child.completedTaskCount ?? 0;
		}

		let computedStart: Date;
		let computedEnd: Date;
		let isRollupBar: boolean;
		let isInheritedDate = false;
		let hasOutOfBoundsChildren = false;

		if (hasOwnDate && draft.ownDate) {
			isRollupBar = false;
			computedStart = draft.ownDate.start;
			computedEnd = draft.ownDate.end;
			if (childMinStart && childMaxEnd) {
				hasOutOfBoundsChildren =
					childMinStart.getTime() < computedStart.getTime() ||
					childMaxEnd.getTime() > computedEnd.getTime();
			}
		} else if (childMinStart && childMaxEnd) {
			// 无自身日期的父任务或虚拟容器：汇总子节点极值
			isRollupBar = true;
			computedStart = childMinStart;
			computedEnd = childMaxEnd;
		} else {
			// 无自身日期且无子节点的子任务：继承最近有日期祖先的时间跨度
			isRollupBar = false;
			isInheritedDate = true;
			computedStart = inheritedDate!.start;
			computedEnd = inheritedDate!.end;
		}

		const selfIsEntity = !isRollupBar;
		const selfCompleted = selfIsEntity && (draft.task.completed || draft.task.status === 'done') ? 1 : 0;
		const leafTaskCount = (selfIsEntity ? 1 : 0) + childLeafCount;
		const completedTaskCount = selfCompleted + childCompletedCount;
		const progressRatio = leafTaskCount > 0 ? completedTaskCount / leafTaskCount : 0;

		nodes.push({
			nodeId: draft.nodeId,
			type: 'task',
			label: draft.label,
			depth,
			filePath,
			task: draft.task,
			children,
			computedStart,
			computedEnd,
			startStr: formatLocalDateStr(computedStart),
			endStr: formatLocalDateStr(computedEnd),
			isRollupBar,
			hasOwnDate,
			isInheritedDate,
			hasOutOfBoundsChildren,
			leafTaskCount,
			completedTaskCount,
			progressRatio,
		});
	}

	// 同级 task 排序：computedStart 升序 → computedEnd 升序 → lineNumber 升序
	nodes.sort((a, b) => {
		const startDiff = a.computedStart.getTime() - b.computedStart.getTime();
		if (startDiff !== 0) return startDiff;
		const endDiff = a.computedEnd.getTime() - b.computedEnd.getTime();
		if (endDiff !== 0) return endDiff;
		return (a.task?.lineNumber ?? 0) - (b.task?.lineNumber ?? 0);
	});

	return nodes;
}

function aggregateChildRange(children: GanttTreeNode[]): {
	computedStart: Date;
	computedEnd: Date;
	leafTaskCount: number;
	completedTaskCount: number;
	progressRatio: number;
} {
	let computedStart = children[0].computedStart;
	let computedEnd = children[0].computedEnd;
	let leafTaskCount = 0;
	let completedTaskCount = 0;

	for (const child of children) {
		if (child.computedStart.getTime() < computedStart.getTime()) {
			computedStart = child.computedStart;
		}
		if (child.computedEnd.getTime() > computedEnd.getTime()) {
			computedEnd = child.computedEnd;
		}
		leafTaskCount += child.leafTaskCount ?? 0;
		completedTaskCount += child.completedTaskCount ?? 0;
	}

	const progressRatio = leafTaskCount > 0 ? completedTaskCount / leafTaskCount : 0;
	return { computedStart, computedEnd, leafTaskCount, completedTaskCount, progressRatio };
}

// ==================== 主入口：构建甘特图树 ====================

/**
 * 根据任务数组与配置选项构建完整的四级甘特图树（folder → file → task → sub-task）
 */
export function buildGanttTree(
	tasks: GCTask[],
	options: GanttTreeBuildOptions
): GanttTreeNode[] {
	if (!tasks || tasks.length === 0) return [];

	const normalizedRoot = options.rootFolder ? normalizeVaultPath(options.rootFolder) : '';
	const rootSegmentsLower = normalizedRoot.length > 0
		? normalizedRoot.split('/').filter(Boolean).map((seg) => seg.toLowerCase())
		: [];
	const uncategorizedLabel = options.uncategorizedFolderLabel || DEFAULT_UNCATEGORIZED_FOLDER;

	// 1. 根目录过滤与文件桶归组（前缀大小写不敏感匹配，同时保留原路径大小写用于展示）
	const fileBuckets = new Map<string, FileBucket>();
	for (const task of tasks) {
		const normalizedFilePath = normalizeVaultPath(task.filePath);
		let relativePath: string;
		if (rootSegmentsLower.length > 0) {
			const fileSegments = normalizedFilePath.split('/').filter(Boolean);
			if (fileSegments.length <= rootSegmentsLower.length) {
				continue;
			}
			let prefixMatched = true;
			for (let i = 0; i < rootSegmentsLower.length; i++) {
				if (fileSegments[i].toLowerCase() !== rootSegmentsLower[i]) {
					prefixMatched = false;
					break;
				}
			}
			if (!prefixMatched) {
				continue;
			}
			relativePath = fileSegments.slice(rootSegmentsLower.length).join('/');
		} else {
			relativePath = normalizedFilePath;
		}

		let bucket = fileBuckets.get(normalizedFilePath);
		if (!bucket) {
			const { projectFolder, modelFileName } = splitRelativePath(relativePath, uncategorizedLabel);
			bucket = {
				filePath: normalizedFilePath,
				projectFolder,
				modelFileName,
				tasks: [],
			};
			fileBuckets.set(normalizedFilePath, bucket);
		}
		bucket.tasks.push(task);
	}

	if (fileBuckets.size === 0) return [];

	const normalizedQuery = (options.searchQuery || '').trim().toLowerCase();
	const hasStatusFilter = Boolean(options.statusFilter && options.statusFilter.selectedStatuses.length > 0);
	const hasTagFilter = Boolean(options.tagFilter && options.tagFilter.selectedTags.length > 0);
	const hasSearchQuery = normalizedQuery.length > 0;
	const hasAnyFilter = hasStatusFilter || hasTagFilter || hasSearchQuery;
	const groupMode = options.groupMode ?? 'project-model';
	const isModelOnly = groupMode === 'model-only';
	const fileDepth = isModelOnly ? 0 : 1;
	const taskStartDepth = isModelOnly ? 1 : 2;

	// 2. 逐文件建树、有效日期剪枝、筛选剪枝与汇总计算
	const folderChildrenMap = new Map<string, GanttTreeNode[]>();
	const flatModelFileNodes: GanttTreeNode[] = [];

	for (const bucket of fileBuckets.values()) {
		const rawForest = buildFileTaskForest(
			bucket.filePath,
			bucket.tasks,
			options.startField,
			options.endField
		);

		// 先做有效日期剪枝
		const dateValidForest = pruneByValidDates(rawForest);
		if (dateValidForest.length === 0) continue;

		// 再做筛选联动剪枝
		let finalForest = dateValidForest;
		if (hasAnyFilter) {
			const folderMatchesQuery = hasSearchQuery && bucket.projectFolder.toLowerCase().includes(normalizedQuery);
			const fileMatchesQuery = hasSearchQuery && bucket.modelFileName.toLowerCase().includes(normalizedQuery);
			const ancestorQueryMatched = folderMatchesQuery || fileMatchesQuery;

			finalForest = pruneByFilters(dateValidForest, options, normalizedQuery, ancestorQueryMatched);
			if (finalForest.length === 0) continue;
		}

		const taskNodes = finalizeTaskNodes(finalForest, bucket.filePath, taskStartDepth);
		if (taskNodes.length === 0) continue;

		const fileRange = aggregateChildRange(taskNodes);
		const fileNode: GanttTreeNode = {
			nodeId: `file:${bucket.filePath}`,
			type: 'file',
			label: bucket.modelFileName,
			depth: fileDepth,
			filePath: bucket.filePath,
			children: taskNodes,
			computedStart: fileRange.computedStart,
			computedEnd: fileRange.computedEnd,
			startStr: formatLocalDateStr(fileRange.computedStart),
			endStr: formatLocalDateStr(fileRange.computedEnd),
			isRollupBar: true,
			leafTaskCount: fileRange.leafTaskCount,
			completedTaskCount: fileRange.completedTaskCount,
			progressRatio: fileRange.progressRatio,
		};

		if (isModelOnly) {
			flatModelFileNodes.push(fileNode);
		} else {
			let folderFiles = folderChildrenMap.get(bucket.projectFolder);
			if (!folderFiles) {
				folderFiles = [];
				folderChildrenMap.set(bucket.projectFolder, folderFiles);
			}
			folderFiles.push(fileNode);
		}
	}

	// 仅按型号模式：直接返回自然序排序的 file 根节点（重名文件按完整路径兜底保证确定性）
	if (isModelOnly) {
		flatModelFileNodes.sort((a, b) => {
			const labelDiff = naturalCompare(a.label, b.label);
			if (labelDiff !== 0) return labelDiff;
			return (a.filePath || '').localeCompare(b.filePath || '');
		});
		return flatModelFileNodes;
	}

	// 3. 项目→型号模式：组装 folder 层并按自然序排序
	const folderNodes: GanttTreeNode[] = [];
	for (const [folderName, fileNodes] of folderChildrenMap.entries()) {
		fileNodes.sort((a, b) => naturalCompare(a.label, b.label));
		const folderRange = aggregateChildRange(fileNodes);
		folderNodes.push({
			nodeId: `folder:${folderName}`,
			type: 'folder',
			label: folderName,
			depth: 0,
			children: fileNodes,
			computedStart: folderRange.computedStart,
			computedEnd: folderRange.computedEnd,
			startStr: formatLocalDateStr(folderRange.computedStart),
			endStr: formatLocalDateStr(folderRange.computedEnd),
			isRollupBar: true,
			leafTaskCount: folderRange.leafTaskCount,
			completedTaskCount: folderRange.completedTaskCount,
			progressRatio: folderRange.progressRatio,
		});
	}

	folderNodes.sort((a, b) => naturalCompare(a.label, b.label));
	return folderNodes;
}

// ==================== 展平与折叠辅助函数 ====================

/**
 * 按 DFS 顺序展平甘特图树为当前可见的一维行数组
 */
export function flattenGanttTree(
	roots: GanttTreeNode[],
	collapsedIds: ReadonlySet<string>
): GanttTreeNode[] {
	const visible: GanttTreeNode[] = [];

	const visit = (nodes: GanttTreeNode[]): void => {
		for (const node of nodes) {
			visible.push(node);
			if (node.children.length > 0 && !collapsedIds.has(node.nodeId)) {
				visit(node.children);
			}
		}
	};

	visit(roots);
	return visible;
}

/**
 * 收集所有可折叠节点（存在子节点）的 nodeId，用于“一键全部折叠”
 */
export function collectCollapsibleNodeIds(roots: GanttTreeNode[]): string[] {
	const ids: string[] = [];

	const visit = (nodes: GanttTreeNode[]): void => {
		for (const node of nodes) {
			if (node.children.length > 0) {
				ids.push(node.nodeId);
				visit(node.children);
			}
		}
	};

	visit(roots);
	return ids;
}

/**
 * 收集所有 file 层的可折叠 nodeId，用于“一键折叠至型号层（多型号总览大盘）”
 */
export function collectCollapseToFileLevelIds(roots: GanttTreeNode[]): string[] {
	const ids: string[] = [];

	const visit = (nodes: GanttTreeNode[]): void => {
		for (const node of nodes) {
			if (node.type === 'file' && node.children.length > 0) {
				ids.push(node.nodeId);
			}
			if (node.children.length > 0) {
				visit(node.children);
			}
		}
	};

	visit(roots);
	return ids;
}
