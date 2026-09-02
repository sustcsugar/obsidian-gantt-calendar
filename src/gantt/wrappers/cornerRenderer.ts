/**
 * 甘特图 Corner 左上角渲染
 *
 * 职责：绘制序号列标题、任务列标题、两者之间的分隔线。
 */

import { i18n } from '../../i18n/i18n';

export interface CornerRenderOptions {
	svg: SVGSVGElement | null;
	taskNumberColumnWidth: number;
	taskColumnWidth: number;
	headerHeight: number;
}

export function renderCorner(opts: CornerRenderOptions): void {
	const { svg, taskNumberColumnWidth, taskColumnWidth, headerHeight } = opts;
	if (!svg) return;

	const ns = 'http://www.w3.org/2000/svg';
	const width = taskColumnWidth;
	const height = headerHeight;

	// 背景
	const bg = activeDocument.createElementNS(ns, 'rect');
	bg.setAttribute('x', '0');
	bg.setAttribute('y', '0');
	bg.setAttribute('width', String(width));
	bg.setAttribute('height', String(height));
	bg.setAttribute('fill', 'var(--background-secondary)');
	svg.appendChild(bg);

	// 序号列标题
	const numberText = activeDocument.createElementNS(ns, 'text');
	numberText.setAttribute('x', String(taskNumberColumnWidth / 2));
	numberText.setAttribute('y', String(height / 2 + 5));
	numberText.setAttribute('text-anchor', 'middle');
	numberText.setAttribute('font-size', '11');
	numberText.setAttribute('font-weight', '600');
	numberText.setAttribute('fill', 'var(--text-muted)');
	numberText.textContent = i18n.t('gantt.headers.index');
	svg.appendChild(numberText);

	// 任务列标题
	const taskText = activeDocument.createElementNS(ns, 'text');
	taskText.setAttribute('x', String(taskNumberColumnWidth + (width - taskNumberColumnWidth) / 2));
	taskText.setAttribute('y', String(height / 2 + 5));
	taskText.setAttribute('text-anchor', 'middle');
	taskText.setAttribute('font-size', '11');
	taskText.setAttribute('font-weight', '600');
	taskText.setAttribute('fill', 'var(--text-muted)');
	taskText.textContent = i18n.t('gantt.headers.task');
	svg.appendChild(taskText);

	// 分隔线
	const dividerLine = activeDocument.createElementNS(ns, 'line');
	dividerLine.setAttribute('x1', String(taskNumberColumnWidth));
	dividerLine.setAttribute('y1', '0');
	dividerLine.setAttribute('x2', String(taskNumberColumnWidth));
	dividerLine.setAttribute('y2', String(height));
	dividerLine.setAttribute('stroke', 'var(--background-modifier-border)');
	dividerLine.setAttribute('stroke-width', '1');
	svg.appendChild(dividerLine);
}
