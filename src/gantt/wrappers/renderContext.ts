/**
 * 甘特图渲染器共享状态接口
 *
 * 提取模块通过此接口访问渲染器的共享状态和方法，
 * 无需直接依赖 SvgGanttRenderer 类。
 */

import type { TimeGranularity } from '../types';
import type { GanttChartTask } from '../types';

/**
 * 任务条拖拽状态
 */
export interface TaskDragState {
	isDragging: boolean;
	dragType: 'none' | 'move' | 'resize-left' | 'resize-right';
	task: GanttChartTask | null;
	startX: number;
	originalStart: Date | null;
	originalEnd: Date | null;
	taskMinDate: Date | null;
	hasMoved: boolean;
	barElement: SVGRectElement | null;
	leftHandleElement: SVGRectElement | null;
	rightHandleElement: SVGRectElement | null;
	leftVisualElement: SVGRectElement | null;
	rightVisualElement: SVGRectElement | null;
	justFinishedDragging: boolean;
}

/**
 * 渲染器共享状态与方法——提取模块通过此接口与主渲染器通信
 */
export interface IRenderContext {
	// ---- 尺寸配置 ----
	readonly columnWidth: number;
	readonly rowHeight: number;
	readonly headerHeight: number;
	readonly taskNumberColumnWidth: number;
	readonly resizerWidth: number;
	readonly padding: number;
	readonly granularity: TimeGranularity;
	readonly minDate: Date | null;
	readonly totalUnits: number;

	// ---- DOM 容器/引用 ----
	readonly mainGrid: HTMLElement | null;
	readonly headerContainer: HTMLElement | null;
	readonly taskListContainer: HTMLElement | null;
	readonly ganttContainer: HTMLElement | null;
	readonly cornerSvg: SVGSVGElement | null;
	readonly headerSvg: SVGSVGElement | null;
	readonly taskListSvg: SVGSVGElement | null;
	readonly ganttSvg: SVGSVGElement | null;

	// ---- 任务数据 ----
	readonly tasks: GanttChartTask[];

	// ---- 插件上下文 ----
	readonly plugin?: {
		settings?: {
			globalTaskFilter?: string;
			showGlobalFilterInTaskText?: boolean;
		};
	};

	// ---- 只读方法（由 renderer 提供） ----
	scrollToToday(): void;
	scrollToLeft(): void;
	scrollToRight(): void;

	// ---- 任务条拖拽状态 ----
	taskDragState: TaskDragState;
}
