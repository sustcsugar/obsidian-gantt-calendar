import { useMemo, useState, type JSX } from 'react';
import type { GCTask } from '../../types';
import { i18n } from '../../i18n/i18n';
import { TagSelectorClasses } from '../../utils/bem';
import { ColorDot, CountBadge } from '../components/TagTreeFilter';

export interface TagSelectorProps {
	/** 所有任务（用于计算推荐标签） */
	allTasks: GCTask[];
	/** 初始已选标签 */
	initialTags?: string[];
	/** 标签变化回调 */
	onChange: (tags: string[]) => void;
}

/** 推荐标签展示上限（流式布局下 3~5 行可容纳） */
const MAX_RECOMMENDED = 24;

/**
 * 标签选择器（React，Linear 风格）
 *
 * 布局：顶部搜索/创建合一输入框 → 已选胶囊流（仅非空时显示）→ 推荐胶囊流。
 * 胶囊横向铺满行宽自动换行，取代旧版逐行树状列表（纵向空间浪费严重）。
 * 多级标签以完整路径展示（如 project/alpha），层级信息保留在路径文本中。
 */
export function TagSelector({ allTasks, initialTags, onChange }: TagSelectorProps): JSX.Element {
	const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set(initialTags || []));
	const [query, setQuery] = useState('');

	/** 按使用频率排序的推荐标签（fullPath → 次数） */
	const recommended = useMemo(() => {
		const frequency = new Map<string, number>();
		for (const task of allTasks) {
			task.tags?.forEach(tag => {
				frequency.set(tag, (frequency.get(tag) || 0) + 1);
			});
		}
		return Array.from(frequency.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, MAX_RECOMMENDED);
	}, [allTasks]);

	/** 搜索过滤后的推荐标签 */
	const visibleTags = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return recommended;
		return recommended.filter(([tag]) => tag.toLowerCase().includes(q));
	}, [recommended, query]);

	/** 已选但不在推荐列表中的标签（保证随时可见可取消） */
	const extraSelected = useMemo(
		() => Array.from(selectedTags).filter(tag => !recommended.some(([r]) => r === tag)),
		[selectedTags, recommended]
	);

	const toggleTag = (tag: string) => {
		const next = new Set(selectedTags);
		if (next.has(tag)) {
			next.delete(tag);
		} else {
			next.add(tag);
		}
		setSelectedTags(next);
		onChange(Array.from(next));
	};

	/** 回车：精确切换输入的标签（存在则取消/选中，不存在则创建） */
	const handleSearchEnter = () => {
		const tag = query.trim().replace(/^#/, '');
		if (!tag) return;
		toggleTag(tag);
		setQuery('');
	};

	return (
		<div className={TagSelectorClasses.block}>
			{/* 搜索 / 创建合一输入框 */}
			<input
				type="text"
				className={TagSelectorClasses.elements.searchInput}
				placeholder={i18n.t('modals.createTask.tags.searchOrCreate')}
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						handleSearchEnter();
					}
				}}
			/>

			{/* 待选标签（流式胶囊，横向铺满自动换行） */}
			<div className={TagSelectorClasses.elements.recommendedSection}>
				{visibleTags.length === 0 && extraSelected.length === 0 ? (
					<small style={{ opacity: 0.5 }}>{i18n.t('modals.createTask.tags.noRecommended')}</small>
				) : (
					<div className={TagSelectorClasses.elements.pills}>
						{visibleTags.map(([tag, count]) => (
							<TagPillChip
								key={tag}
								fullPath={tag}
								selected={selectedTags.has(tag)}
								count={count}
								onToggle={() => toggleTag(tag)}
							/>
						))}
						{extraSelected.map(tag => (
							<TagPillChip
								key={tag}
								fullPath={tag}
								selected
								onToggle={() => toggleTag(tag)}
							/>
						))}
					</div>
				)}
			</div>

			{/* 已选标签（常驻渲染，避免选择时 DOM 突然插入造成面板内容跳跃） */}
			<div className={TagSelectorClasses.elements.selectedSection}>
				<small className={TagSelectorClasses.elements.label}>
					{i18n.t('modals.createTask.tags.selectedLabel')}
					<CountBadge count={selectedTags.size} />
				</small>
				<div className={TagSelectorClasses.elements.pills}>
					{selectedTags.size === 0 ? (
						<small style={{ opacity: 0.5 }}>{i18n.t('modals.createTask.tags.noSelected')}</small>
					) : (
						Array.from(selectedTags).map(tag => (
							<TagPillChip
								key={tag}
								fullPath={tag}
								selected
								onToggle={() => toggleTag(tag)}
							/>
						))
					)}
				</div>
			</div>
		</div>
	);
}

interface TagPillChipProps {
	fullPath: string;
	selected: boolean;
	/** 使用次数（已选区不显示） */
	count?: number;
	onToggle: () => void;
}

/** 可切换的 Linear 风格标签胶囊：色点 + 路径 + 次数徽章，选中态仅以颜色区分 */
function TagPillChip({ fullPath, selected, count, onToggle }: TagPillChipProps): JSX.Element {
	const classes = [
		TagSelectorClasses.elements.pill,
		...(selected ? [TagSelectorClasses.modifiers.pillSelected] : []),
	].join(' ');

	return (
		<span
			className={classes}
			role="option"
			aria-selected={selected}
			tabIndex={0}
			data-tag={fullPath}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onToggle();
			}}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onToggle();
				}
			}}
		>
			<ColorDot fullPath={fullPath} />
			<span>{`#${fullPath}`}</span>
			{count !== undefined ? <span className={TagSelectorClasses.elements.pillCount}>{count}</span> : null}
		</span>
	);
}
