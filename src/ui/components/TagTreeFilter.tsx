/**
 * 标签树形筛选器（Linear 风格）
 *
 * 视觉特征：
 * - 彩色圆点（hash 取色，与任务卡片标签胶囊同色）
 * - 圆角计数徽章（右对齐）
 * - 选中行 accent 背景高亮 + ✓ 图标
 * - 底部胶囊切换器（OR/AND/NOT）
 */

import { useMemo, useState, type JSX } from 'react';
import { buildTagHierarchy } from '../../tasks/tags/TagHierarchyBuilder';
import type { TagNode } from '../../tasks/tags/TagHierarchy';
import { Icon } from './Icon';
import { TagPill } from '../../components/tagPill';
import { i18n } from '../../i18n/i18n';

export interface TagTreeFilterProps {
	allTags: string[];
	selectedTags: string[];
	onToggle: (fullPath: string) => void;
	operator: 'OR' | 'AND' | 'NOT';
	onOperatorChange: (op: 'OR' | 'AND' | 'NOT') => void;
	taskCounts?: Map<string, number>;
	showOperator?: boolean;
}

/** 标签专属颜色圆点 */
function ColorDot({ fullPath }: { fullPath: string }): JSX.Element {
	const idx = TagPill.getColorIndex(fullPath);
	const names = ['blue', 'green', 'orange', 'yellow', 'purple', 'pink'];
	const colorVar = `var(--gc-color-${names[idx] ?? 'blue'}, #3884ff)`;
	return (
		<span
			aria-hidden
			style={{
				width: '8px', height: '8px', borderRadius: '50%',
				backgroundColor: colorVar, flexShrink: 0,
			}}
		/>
	);
}

/** 计数徽章 */
function CountBadge({ count }: { count: number }): JSX.Element {
	return (
		<span
			style={{
				minWidth: '20px', textAlign: 'center',
				padding: '0 5px', borderRadius: '8px',
				fontSize: '10px', fontWeight: '500', lineHeight: '16px',
				color: 'var(--text-muted)',
				background: 'var(--background-modifier-border)',
			}}
		>
			{count}
		</span>
	);
}

/** 底部胶囊切换器 */
function SegmentedToggle({
	options, value, onChange,
}: { options: readonly string[]; value: string; onChange: (v: string) => void }): JSX.Element {
	return (
		<div style={{
			display: 'flex', gap: '1px',
			background: 'var(--background-secondary)',
			borderRadius: 'var(--gc-radius-full, 999px)',
			padding: '2px',
		}}>
			{options.map(op => (
				<button
					key={op}
					style={{
						flex: 1, padding: '3px 0', border: 'none', borderRadius: 'var(--gc-radius-full, 999px)',
						fontSize: '11px', fontWeight: value === op ? '600' : '400',
						cursor: 'pointer', transition: 'all 0.15s ease',
						background: value === op ? 'var(--background-primary)' : 'transparent',
						color: value === op ? 'var(--text-normal)' : 'var(--text-muted)',
						boxShadow: value === op ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
					}}
					onClick={() => onChange(op)}
				>
					{op}
				</button>
			))}
		</div>
	);
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

	const aggCounts = useMemo(() => {
		const agg = new Map<string, number>();
		const compute = (node: TagNode): number => {
			let total = tagCounts.get(node.fullPath) || 0;
			for (const child of node.children) total += compute(child);
			agg.set(node.fullPath, total);
			return total;
		};
		for (const node of tree) compute(node);
		return agg;
	}, [tree, tagCounts]);

	const sortedRoots = useMemo(
		() => [...tree].sort((a, b) => (aggCounts.get(b.fullPath) || 0) - (aggCounts.get(a.fullPath) || 0)),
		[tree, aggCounts]
	);

	const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

	const toggleExpand = (fp: string) => {
		setExpandedTags(prev => {
			const next = new Set(prev);
			if (next.has(fp)) next.delete(fp); else next.add(fp);
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
					role="option"
					aria-selected={isSelected}
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(node.fullPath); }
					}}
					onClick={() => onToggle(node.fullPath)}
					style={{
						display: 'flex', alignItems: 'center', gap: '6px',
						padding: '4px 8px', cursor: 'pointer', borderRadius: '6px',
						transition: 'background-color 0.12s ease',
						background: isSelected ? 'var(--background-modifier-hover)' : 'transparent',
						borderLeft: isSelected ? '2px solid var(--interactive-accent)' : '2px solid transparent',
					}}
					onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--background-modifier-hover)'; }}
					onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
				>
					<span style={{ width: `${level * 12}px`, flexShrink: 0 }} />
					{hasChildren ? (
						<span
							style={{ display: 'inline-flex', width: '14px', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', color: 'var(--text-faint)' }}
							onClick={(e) => { e.stopPropagation(); toggleExpand(node.fullPath); }}
						>
							<Icon icon={isExpanded ? 'chevron-down' : 'chevron-right'} />
						</span>
					) : (
						<span style={{ width: '14px', flexShrink: 0 }} />
					)}
					<ColorDot fullPath={node.fullPath} />
					<span
						style={{
							flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
							fontSize: '12px', fontWeight: isSelected ? '500' : '400',
							color: isSelected ? 'var(--text-normal)' : 'var(--text-secondary)',
						}}
					>
						{node.name}
					</span>
					{isSelected && <Icon icon="check" />}
					<CountBadge count={aggCount} />
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
		<div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px' }}>
			<div style={{ maxHeight: '280px', overflowY: 'auto' }}>
				{sortedRoots.length === 0 ? (
					<div style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px' }}>
						{i18n.t('toolbar.tagFilter.empty')}
					</div>
				) : (
					sortedRoots.map(root => renderTagNode(root, 0))
				)}
			</div>
			{showOperator && (
				<div style={{ borderTop: '1px solid var(--background-modifier-border)', paddingTop: '6px' }}>
					<SegmentedToggle
						options={['OR', 'AND', 'NOT'] as const}
						value={operator}
						onChange={onOperatorChange}
					/>
				</div>
			)}
		</div>
	);
}
