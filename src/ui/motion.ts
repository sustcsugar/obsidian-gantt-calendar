import type { Transition, Variants } from 'motion/react';

/**
 * 动效统一参数（与 src/styles/tokens.css 动效令牌同步）
 * 性能优先：只动 opacity/transform（GPU 合成层），禁用布局属性动画
 */
export const MOTION = {
	dur: {
		fast: 0.12,
		normal: 0.2,
		slow: 0.32,
	},
	easeOut: [0.16, 1, 0.3, 1] as const,
	spring: { type: 'spring', stiffness: 500, damping: 35 } as const,
};

export const easeOutTransition = (duration: number): Transition => ({
	duration,
	ease: MOTION.easeOut,
});

/**
 * 面板弹出预设（下拉/右键/悬浮窗统一使用）
 * scale + fade + y 位移，快速进场
 */
export const panelVariants: Variants = {
	initial: { opacity: 0, scale: 0.96, y: -4 },
	animate: { opacity: 1, scale: 1, y: 0 },
	exit: { opacity: 0, scale: 0.97, y: -2 },
};

/**
 * 模态框预设：纯 opacity 淡入
 * 注意：不要给面板加 scale/y 等 transform 动画——transform 缩放会要求
 * Chromium 在动画期间对面板图层（文字+边框+阴影）逐帧重栅格化，在
 * GPU 合成能力弱的机器（Electron 混合显卡/驱动黑名单/关闭硬件加速）
 * 上每帧 10-30ms，是弹窗"一顿一顿"的直接来源；opacity 是纯合成属性，
 * 零重栅格化。对齐官方 Modal 的做法（官方连 opacity 动画都没有）。
 */
export const modalVariants: Variants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

/** 遮罩淡入淡出 */
export const overlayVariants: Variants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

/** 工具提示：淡入 + 轻微位移 */
export const tooltipVariants: Variants = {
	initial: { opacity: 0, y: -3 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -2 },
};