/**
 * 标签树形筛选器（共享组件）
 *
 * 从 TaskListPanel 侧边栏的标签树渲染逻辑提取，
 * 供主视图工具栏和侧边栏统一复用。
 *
 * 功能：
 * - buildTagHierarchy 树形层级展示
 * - 父节点 chevron 展开/收起
 * - 子树计数聚合徽章
 * - OR/AND 匹配模式切换
 * - 按聚合计数排序
 */

import { useMemo, useState, type JSX } from 'react';
import { buildTagHierarchy } from '../../tasks/tags/TagHierarchyBuilder';
import type { TagNode } from '../../tasks/tags/TagHierarchy';
import { DropdownMenuClasses } from '../../utils/bem';
import { Icon } from './Icon';
import { i18n } from '../../i18n/i18n';

export interface TagTreeFilterProps {
	/** 所有可用标签（扁平字符串数组，如 ['work', 'project/frontend']） */
	allTags: string[];
	/** 当前选中的标签 fullPath 列表 */
	selectedTags: string[];
	/** 标签选中/取消回调 */
	onToggle: (fullPath: string) => void;
	/** 匹配模式 */
	operator: 'OR' | 'AND' | 'NOT';
	/** 匹配模式变更回调 */
	onOperatorChange: (op: 'OR' | 'AND' | 'NOT') => void;
	/** 任务计数映射（fullPath → 数量），用于徽章显示和排序 */
	taskCounts?: Map<string, number>;
	/** 是否显示 OR/AND 切换行（侧边栏显示，工具栏可能已有独立控件） */
	showOperator?: boolean;
}

/**
 * 计算每个节点的聚合计数（自身 + 所有子树）
 */
function computeAggCounts(
	tree: TagNode[],
	tagCounts: Map<string, number>
): Map<string, number> {
	const agg = new Map<string, number>();
	const compute = (node: TagNode): number => {
		let total = tagCounts.get(node.fullPath) || 0;
		for (const child of node.children) {
			total += compute(child);
		}
		agg.set(node.fullPath, total);
		return total;
	};
	for (const node of tree) compute(node);
	return agg;
}

export function TagTreeFilter({
	allTags,
	selectedTags,
	onToggle,
	operator,
	onOperatorChange,
	taskCounts,
	showOperator = true,
}: TagTreeFilterProps): JSX.Element {
	const tagCounts = useMemo(
		() => taskCounts ?? (() => {
			const m = new Map<string, number>();
			for (const t of allTags) m.set(t, (m.get(t) || 0) + 1);
			return m;
		})(),
		[allTags, taskCounts]
	);

	const tree = useMemo(() => buildTagHierarchy(allTags), [allTags]);

	const aggCounts = useMemo(
		() => computeAggCounts(tree, tagCounts),
		[tree, tagCounts]
	);

	const sortedRoots = useMemo(
		() => [...tree].sort((a, b) => (aggCounts.get(b.fullPath) || 0) - (aggCounts.get(a.fullPath) || 0)),
		[tree, aggCounts]
	);

	const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

	const toggleExpand = (fullPath: string) => {
		setExpandedTags(prev => {
			const next = new Set(prev);
			if (next.has(fullPath)) next.delete(fullPath);
			else next.add(fullPath);
			return next;
		});
	};

	const renderTagNode = (node: TagNode, level: number): JSX.Element => {
		const aggCount = aggCounts.get(node.fullPath) || 0;
		if (aggCount === 0 && node.children.length > 0) return <></>;
		const isSelected = selectedTags.includes(node.fullPath);
		const hasChildren = node.children.length > 0;
		const isExpanded = expandedTags.has(node.fullPath);

		return (
			<div key={node.fullPath}>
				<div
					className={`${DropdownMenuClasses.item}${isSelected ? ` ${DropdownMenuClasses.itemChecked}` : ''}`}
					style={{ cursor: 'pointer' }}
					onClick={() => onToggle(node.fullPath)}
				>
					{hasChildren ? (
						<span
							style={{ display: 'inline-flex', width: '16px', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
							onClick={(e) => { e.stopPropagation(); toggleExpand(node.fullPath); }}
						>
							<Icon icon={isExpanded ? 'chevron-down' : 'chevron-right'} />
						</span>
					) : (
						<span style={{ width: '16px', flexShrink: 0 }} />
					)}
					<span
						className={DropdownMenuClasses.itemLabel}
						style={{ paddingLeft: level * 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
					>
						{node.fullPath}
					</span>
					<span className="gc-u-text-muted" style={{ fontSize: '11px', flexShrink: 0 }}>{aggCount}</span>
				</div>
				{hasChildren && isExpanded
					? [...node.children]
						.sort((a, b) => (aggCounts.get(b.fullPath) || 0) - (aggCounts.get(a.fullPath) || 0))
						.map(child => renderTagNode(child, level + 1))
					: null}
			</div>
		);
	};

	return (
		<div>
			{showOperator && (
				<div
					className={`${DropdownMenuClasses.item}`}
					style={{ borderBottom: '1px solid var(--background-modifier-border)', marginBottom: '4px' }}
				>
					<span className="gc-u-text-muted" style={{ fontSize: '12px', flex: 1 }}>
						{i18n.t('sidebar.taskList.tagFilter.matchMode')}
					</span>
					{(['OR', 'AND', 'NOT'] as const).map(op => (
						<button
							key={op}
							className={`clickable-icon gc-u-rounded${operator === op ? ' is-selected' : ''}`}
							style={{ fontSize: '11px', padding: '2px 6px' }}
							onClick={() => onOperatorChange(op)}
						>
							{op}
						</button>
					))}
				</div>
			)}
			{sortedRoots.map(root => renderTagNode(root, 0))}
		</div>
	);
}
