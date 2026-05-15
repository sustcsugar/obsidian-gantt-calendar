/**
 * 在时间轴容器中渲染当前时间指示线
 *
 * @param container - 时间轴容器（需设置 position: relative）
 * @param slotSelector - 时间槽元素的 CSS 选择器
 * @param lineClassName - 指示线元素的 CSS 类名
 * @param startHour - 起始小时（默认 0）
 * @param endHour - 结束小时（默认 24，不含）
 */
export function renderCurrentTimeLine(
	container: HTMLElement,
	slotSelector: string,
	lineClassName: string,
	startHour = 0,
	endHour = 24
): void {
	const now = new Date();
	const currentHour = now.getHours();
	if (currentHour < startHour || currentHour >= endHour) return;

	const currentMinute = now.getMinutes();
	const slots = container.querySelectorAll(slotSelector);
	const slotIndex = currentHour - startHour;
	const slot = slots[slotIndex] as HTMLElement;
	if (!slot) return;

	const slotTop = slot.offsetTop;
	const slotHeight = slot.offsetHeight;
	const minuteOffset = (currentMinute / 60) * slotHeight;
	const lineTop = slotTop + minuteOffset;

	const line = container.createDiv(lineClassName);
	line.style.top = `${lineTop}px`;
}
