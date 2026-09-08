import type { CSSProperties, JSX } from 'react';
import { TagClasses } from '../../utils/bem';
import { TagPill } from '../../components/tagPill';

export interface ReactTagPillProps {
	label: string;
	showHash?: boolean;
	colorIndex?: number;
	className?: string;
	style?: CSSProperties;
	title?: string;
}

/**
 * React 标签胶囊组件
 * 复用原 TagPill 的 hash 颜色分配逻辑，输出相同的 BEM 类名
 */
export function TagPillSpan({
	label,
	showHash = true,
	colorIndex,
	className,
	style,
	title,
}: ReactTagPillProps): JSX.Element {
	// 类名与文本格式化均复用 TagPill 静态方法（单一来源）
	const classes = TagPill.buildClassList(
		colorIndex ?? TagPill.getColorIndex(label),
		className ? [className] : undefined,
	);

	return (
		<span className={classes.join(' ')} data-tag={label} style={style} title={title}>
			<span className={TagClasses.elements.label}>{TagPill.formatLabel(label, showHash)}</span>
		</span>
	);
}