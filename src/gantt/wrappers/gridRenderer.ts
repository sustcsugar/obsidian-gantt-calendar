/**
 * 甘特图 Grid 网格 + Today 线渲染
 *
 * 职责：绘制垂直/水平网格线、行背景、今天指示线。
 */

import type { TimeGranularity } from '../types';
import { GRANULARITY_CONFIGS } from '../types';
import { isMajorGridLine } from './dateGeometry';
import { getTodayInTimezone } from '../../dateUtils/timezone';
import { GanttClasses } from '../../utils/bem';

function addSvgClass(element: Element, className: string): void {
	const existing = element.getAttribute('class');
	if (existing) {
		if (!existing.split(' ').includes(className)) {
			element.setAttribute('class', `${existing} ${className}`);
		}
	} else {
		element.setAttribute('class', className);
	}
}

export interface GridRenderOptions {
	svg: SVGSVGElement | null;
	minDate: Date;
	totalUnits: number;
	granularity: TimeGranularity;
	columnWidth: number;
	rowHeight: number;
	tasksLength: number;
	width: number;
	height: number;
	padding: number;
}

/**
 * 渲染网格（垂直线 + 行背景 + 水平线）
 * 返回行背景元素数组，供后续拖拽高亮使用
 */
export function renderGrid(
	ns: string,
	opts: GridRenderOptions,
	rowBgStorage: SVGRectElement[]
): void {
	const { svg, minDate, totalUnits, granularity, columnWidth, rowHeight, tasksLength, width, height } = opts;
	if (!svg) return;

	const gridGroup = activeDocument.createElementNS(ns, 'g');
	addSvgClass(gridGroup, GanttClasses.elements.grid);

	// 垂直线（时间单元分隔）
	for (let i = 0; i <= totalUnits; i++) {
		const x = i * columnWidth;
		const line = activeDocument.createElementNS(ns, 'line');
		line.setAttribute('x1', String(x));
		line.setAttribute('y1', '0');
		line.setAttribute('x2', String(x));
		line.setAttribute('y2', String(height));
		line.setAttribute('stroke', 'var(--background-modifier-border)');
		line.setAttribute('stroke-width', '0.5');
		line.setAttribute('stroke-dasharray', isMajorGridLine(i, granularity) ? 'none' : '2 2');
		gridGroup.appendChild(line);
	}

	// 行背景（斑马纹）
	for (let i = 0; i < tasksLength; i++) {
		const y = i * rowHeight;
		const rowBg = activeDocument.createElementNS(ns, 'rect') as SVGRectElement;
		rowBg.setAttribute('x', '0');
		rowBg.setAttribute('y', String(y));
		rowBg.setAttribute('width', String(width));
		rowBg.setAttribute('height', String(rowHeight));
		rowBg.setAttribute('data-row-index', String(i));
		addSvgClass(rowBg, GanttClasses.elements.rowBg);
		rowBg.setAttribute('fill', i % 2 === 0 ? 'var(--background-secondary)' : 'transparent');
		if (i % 2 === 0) rowBg.setAttribute('opacity', '0.3');
		gridGroup.appendChild(rowBg);
		rowBgStorage.push(rowBg);
	}

	// 水平线（任务行分隔）
	for (let i = 0; i <= tasksLength; i++) {
		const y = i * rowHeight;
		const line = activeDocument.createElementNS(ns, 'line');
		line.setAttribute('x1', '0');
		line.setAttribute('y1', String(y));
		line.setAttribute('x2', String(width));
		line.setAttribute('y2', String(y));
		line.setAttribute('stroke', 'var(--background-modifier-border)');
		line.setAttribute('stroke-width', '0.5');
		gridGroup.appendChild(line);
	}

	svg.appendChild(gridGroup);
}

/**
 * 渲染今天线
 */
export function renderTodayLine(
	ns: string,
	svg: SVGSVGElement | null,
	minDate: Date,
	totalUnits: number,
	height: number,
	granularity: TimeGranularity,
	columnWidth: number
): void {
	if (!svg) return;

	const today = getTodayInTimezone();
	const config = GRANULARITY_CONFIGS[granularity];
	const unitsDiff = (today.getTime() - minDate.getTime()) / config.milliseconds;

	if (unitsDiff >= 0 && unitsDiff <= totalUnits) {
		const x = unitsDiff * columnWidth;
		const line = activeDocument.createElementNS(ns, 'line');
		line.setAttribute('x1', String(x));
		line.setAttribute('y1', '0');
		line.setAttribute('x2', String(x));
		line.setAttribute('y2', String(height));
		line.setAttribute('stroke', 'var(--interactive-accent)');
		line.setAttribute('stroke-width', '1');
		line.setAttribute('stroke-dasharray', '4 4');
		svg.appendChild(line);
	}
}
