/**
 * 任务悬浮卡片定位算法（框架无关纯函数）
 *
 * React TooltipProvider 与命令式 TooltipManager 共用：
 * 锚点矩形右侧优先 → 放不下翻到左侧 → 视口边界钳制。
 */

/** 悬浮卡片与锚点/光标的间距 */
export const TOOLTIP_GAP = 12;

/** 距视口边缘的最小留白 */
const EDGE_MARGIN = 10;

/** 定位参考矩形（DOMRect 的最小字段集） */
export interface AnchorRect {
	left: number;
	right: number;
	top: number;
	width: number;
	height: number;
}

export interface TooltipPositionInput {
	/** 锚点元素矩形（卡片/任务条） */
	anchorRect: AnchorRect;
	/** 光标位置（鼠标优先模式下的定位基准；锚点无尺寸时的回退基准） */
	mouse?: { x: number; y: number } | null;
	/** 鼠标优先锚定：提供 mouse 时定位到光标右下侧（缺省锚定矩形右侧，mouse 仅作回退） */
	preferMouse?: boolean;
	/** 悬浮卡片实测尺寸 */
	width: number;
	height: number;
	viewportWidth?: number;
	viewportHeight?: number;
}

export function computeTooltipPosition(input: TooltipPositionInput): { left: number; top: number } {
	const viewportWidth = input.viewportWidth ?? window.innerWidth;
	const viewportHeight = input.viewportHeight ?? window.innerHeight;
	const { anchorRect: rect, width, height } = input;

	let left: number;
	let top: number;
	/** 水平翻转基准（矩形锚定=卡片左缘；鼠标锚定=光标 x） */
	let flipX: number;
	if (input.preferMouse && input.mouse) {
		left = input.mouse.x + TOOLTIP_GAP;
		top = input.mouse.y + TOOLTIP_GAP;
		flipX = input.mouse.x;
	} else if (rect.width > 0 && rect.height > 0) {
		left = rect.right + TOOLTIP_GAP;
		top = rect.top;
		flipX = rect.left;
	} else if (input.mouse) {
		left = input.mouse.x + TOOLTIP_GAP;
		top = input.mouse.y + TOOLTIP_GAP;
		flipX = input.mouse.x;
	} else {
		left = rect.right + TOOLTIP_GAP;
		top = rect.top;
		flipX = rect.left;
	}

	// 水平：右侧放不下则翻到翻转基准左侧，再做边界钳制
	if (left + width > viewportWidth) {
		left = flipX - width - TOOLTIP_GAP;
	}
	left = Math.max(EDGE_MARGIN, Math.min(left, viewportWidth - width - EDGE_MARGIN));

	// 垂直：顶部对齐，溢出底部则向上收缩，并做边界钳制
	top = Math.max(EDGE_MARGIN, top);
	if (top + height > viewportHeight - EDGE_MARGIN) {
		top = Math.max(EDGE_MARGIN, viewportHeight - height - EDGE_MARGIN);
	}

	return { left, top };
}
