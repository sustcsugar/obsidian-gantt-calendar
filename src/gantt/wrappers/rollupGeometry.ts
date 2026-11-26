/**
 * 甘特图汇总括号条几何计算与跨度天数工具（纯函数，便于单元测试）
 */

import { parseLocalDate } from './dateGeometry';

export interface RollupBracketGeometry {
	/** SVG <path> d 属性 */
	d: string;
	/** 实际绘制宽度（含最小宽度保护） */
	width: number;
	/** 顶部 y 坐标 */
	topY: number;
	/** 底部尖角 y 坐标 */
	bottomY: number;
	/** 单侧尖角水平宽度 */
	tipWidth: number;
}

const MIN_ROLLUP_WIDTH = 16;
const MAX_TIP_WIDTH = 5;
const TOTAL_BRACKET_HEIGHT = 10;
const BEAM_THICKNESS = 5;

/**
 * 计算包含首尾两端的跨度天数（至少 1 天）
 */
export function calculateInclusiveSpanDays(startStr: string, endStr: string): number {
	const start = parseLocalDate(startStr);
	const end = parseLocalDate(endStr);
	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		return 1;
	}
	const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
	return Math.max(1, diffDays + 1);
}

/**
 * 构建经典甘特汇总括号 <path> 路径（顶部横条 + 左右两端向下微尖角）
 *
 * 在单日或极窄宽度下启用最小宽度保护与尖角宽度夹紧，确保左右尖角永不翻转或重叠。
 */
export function buildRollupBracketPath(
	x: number,
	rowY: number,
	rowHeight: number,
	rawWidth: number
): RollupBracketGeometry {
	const width = Math.max(rawWidth, MIN_ROLLUP_WIDTH);
	const tipWidth = Math.max(2, Math.min(MAX_TIP_WIDTH, Math.floor((width - 2) / 2)));

	const topY = rowY + Math.round((rowHeight - TOTAL_BRACKET_HEIGHT) / 2);
	const beamBottomY = topY + BEAM_THICKNESS;
	const bottomY = topY + TOTAL_BRACKET_HEIGHT;

	const rightX = x + width;
	const leftInnerX = x + tipWidth;
	const rightInnerX = rightX - tipWidth;

	const d = [
		`M ${x} ${topY}`,
		`L ${rightX} ${topY}`,
		`L ${rightX} ${bottomY}`,
		`L ${rightInnerX} ${beamBottomY}`,
		`L ${leftInnerX} ${beamBottomY}`,
		`L ${x} ${bottomY}`,
		'Z',
	].join(' ');

	return { d, width, topY, bottomY, tipWidth };
}

/**
 * 构建汇总括号条内部进度填充层 <path> 路径（按 progressRatio ∈ [0, 1] 从左向右填充）
 * ratio <= 0 返回 null；ratio >= 1 返回与完整括号一致的路径。
 */
export function buildRollupProgressPath(
	x: number,
	rowY: number,
	rowHeight: number,
	rawWidth: number,
	progressRatio: number
): string | null {
	const clamped = Math.max(0, Math.min(1, progressRatio));
	if (clamped <= 0) return null;

	const bracket = buildRollupBracketPath(x, rowY, rowHeight, rawWidth);
	if (clamped >= 1) {
		return bracket.d;
	}

	const beamBottomY = bracket.topY + BEAM_THICKNESS;
	const fillWidth = Math.max(bracket.tipWidth, Math.min(bracket.width, Math.round(bracket.width * clamped)));
	const fillRightX = x + fillWidth;
	const leftInnerX = x + bracket.tipWidth;
	const rightInnerX = x + bracket.width - bracket.tipWidth;

	if (fillRightX <= rightInnerX) {
		return [
			`M ${x} ${bracket.topY}`,
			`L ${fillRightX} ${bracket.topY}`,
			`L ${fillRightX} ${beamBottomY}`,
			`L ${leftInnerX} ${beamBottomY}`,
			`L ${x} ${bracket.bottomY}`,
			'Z',
		].join(' ');
	}

	// 进入右侧斜角区域：按斜率线性插值右边缘底点
	const slopeProgress = (fillRightX - rightInnerX) / Math.max(1, bracket.tipWidth);
	const rightEdgeBottomY = Math.round((beamBottomY + slopeProgress * (bracket.bottomY - beamBottomY)) * 10) / 10;
	return [
		`M ${x} ${bracket.topY}`,
		`L ${fillRightX} ${bracket.topY}`,
		`L ${fillRightX} ${rightEdgeBottomY}`,
		`L ${rightInnerX} ${beamBottomY}`,
		`L ${leftInnerX} ${beamBottomY}`,
		`L ${x} ${bracket.bottomY}`,
		'Z',
	].join(' ');
}
