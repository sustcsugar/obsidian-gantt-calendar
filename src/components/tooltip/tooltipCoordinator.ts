/**
 * 悬浮卡片跨实例互斥协调器
 *
 * React TooltipProvider 按宿主 React root 各持一份、TooltipManager 是全局单例，
 * 彼此互不知晓。任何一端真正弹出时通过 claimExclusiveTooltip 立即隐藏其他实例，
 * 强制"全屏最多一个悬浮卡片"这一不变量（此前仅靠单鼠标事实保证）。
 */

type CancelFn = () => void;

const holders = new Set<CancelFn>();

/** 注册一个可被互斥隐藏的悬浮卡片宿主，返回注销函数 */
export function registerTooltipHolder(cancel: CancelFn): () => void {
	holders.add(cancel);
	return () => {
		holders.delete(cancel);
	};
}

/** 当前宿主弹出时调用：立即取消（非延迟隐藏）其余所有宿主 */
export function claimExclusiveTooltip(cancel: CancelFn): void {
	for (const other of holders) {
		if (other !== cancel) other();
	}
}
