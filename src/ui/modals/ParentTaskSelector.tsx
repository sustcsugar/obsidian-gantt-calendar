import { useMemo, useState, type JSX } from 'react';
import type { GCTask } from '../../types';
import { i18n } from '../../i18n/i18n';
import { ParentSelectorClasses as C } from '../../utils/bem';

export interface ParentTaskSelectorProps {
	/** 已过滤好的候选（排除自身、子孙、重复任务、远程任务） */
	candidates: GCTask[];
	/** 当前选中项的定位键（`filePath:lineNumber`）——任务可能尚未分配 tid */
	selectedTaskKey?: string | null;
	/** 选中/取消选中（取消时传 null） */
	onSelect: (task: GCTask | null) => void;
}

/** 结果列表上限：输入过滤后仍只渲染前 50 条，避免大库卡顿 */
const MAX_RESULTS = 50;

/**
 * 父任务选择器（React）
 *
 * 参照 TagSelector 的「搜索 + 列表」范式：输入即过滤，
 * 点击条目选中，再次点击已选条目取消。
 */
export function ParentTaskSelector({ candidates, selectedTaskKey, onSelect }: ParentTaskSelectorProps): JSX.Element {
	const [query, setQuery] = useState('');

	const results = useMemo(() => {
		const q = query.trim().toLowerCase();
		const filtered = q
			? candidates.filter((task) => {
				const haystack = `${task.description} ${task.fileName}`.toLowerCase();
				return haystack.includes(q);
			})
			: candidates;
		return filtered.slice(0, MAX_RESULTS);
	}, [candidates, query]);

	return (
		<div className={C.block}>
			<input
				type="text"
				className={C.elements.searchInput}
				placeholder={i18n.t('taskForm.searchPlaceholder')}
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>

			{results.length === 0 ? (
				<small className={C.elements.empty}>{i18n.t('taskForm.empty')}</small>
			) : (
				<div className={C.elements.list} role="listbox">
					{results.map((task) => {
						const taskKey = `${task.filePath}:${task.lineNumber}`;
						const selected = Boolean(selectedTaskKey && taskKey === selectedTaskKey);
						const className = [
							C.elements.item,
							selected ? C.modifiers.itemSelected : '',
						].filter(Boolean).join(' ');

						return (
							<button
								key={`${task.filePath}:${task.lineNumber}`}
								type="button"
								role="option"
								aria-selected={selected}
								className={className}
								onClick={() => onSelect(selected ? null : task)}
							>
								<span className={C.elements.itemTitle}>{task.description}</span>
								<span className={C.elements.itemMeta}>{`${task.fileName}:${task.lineNumber}`}</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
