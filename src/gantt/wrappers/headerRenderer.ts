/**
 * 甘特图 Header 时间轴渲染
 *
 * 职责：在 SVG header 区域绘制背景矩形 + 每个时间单元的文本标签，
 * 今天所在的单元高亮为 accent 色。
 */

import type { TimeGranularity } from '../types';
import { GRANULARITY_CONFIGS } from '../types';
import { getDateForUnit, isSameUnit } from './dateGeometry';
import { getTodayInTimezone } from '../../dateUtils/timezone';

export interface HeaderRenderOptions {
	svg: SVGSVGElement | null;
	minDate: Date;
	totalUnits: number;
	granularity: TimeGranularity;
	columnWidth: number;
	headerHeight: number;
	padding: number;
}

export function renderHeader(opts: HeaderRenderOptions): void {
	const { svg, minDate, totalUnits, granularity, columnWidth, headerHeight, padding } = opts;
	if (!svg) return;

	const ns = 'http://www.w3.org/2000/svg';
	const config = GRANULARITY_CONFIGS[granularity];
	const width = totalUnits * columnWidth + padding * 2;

	// 背景
	const headerBg = activeDocument.createElementNS(ns, 'rect');
	headerBg.setAttribute('x', '0');
	headerBg.setAttribute('y', '0');
	headerBg.setAttribute('width', String(width));
	headerBg.setAttribute('height', String(headerHeight));
	headerBg.setAttribute('fill', 'var(--background-secondary)');
	svg.appendChild(headerBg);

	// 绘制时间单元标签
	const today = getTodayInTimezone();

	for (let i = 0; i < totalUnits; i++) {
		const unitDate = getDateForUnit(minDate, i, granularity);
		const gridLineX = i * columnWidth;
		const cellCenterX = gridLineX + columnWidth / 2;
		const y = headerHeight / 2;

		const isCurrentUnit = isSameUnit(unitDate, today, granularity);

		const text = activeDocument.createElementNS(ns, 'text');
		text.setAttribute('x', String(cellCenterX));
		text.setAttribute('y', String(y + 6));
		text.setAttribute('text-anchor', 'middle');
		text.setAttribute('font-size', '11');
		text.setAttribute('fill', isCurrentUnit ? 'var(--interactive-accent)' : 'var(--text-muted)');
		text.setAttribute('font-weight', isCurrentUnit ? '600' : '400');

		const label = config.labelFormatter(unitDate, i);
		if (label) {
			text.textContent = label;
			svg.appendChild(text);
		}
	}
}
