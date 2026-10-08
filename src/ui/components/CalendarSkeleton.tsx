import type { JSX } from 'react';
import { CalendarSkeletonClasses } from '../../utils/bem';

/**
 * 启动期任务加载骨架（P0 骨架先行）
 *
 * tasksReady=false 时由 App/SidebarApp 渲染：全库首扫在后台进行，
 * 内容区以纯视觉占位先行接管，扫描完成后真实视图自动替换。
 * 纯装饰性占位，无文案，无需 i18n。
 */
export function CalendarSkeleton(): JSX.Element {
	return (
		<div className={CalendarSkeletonClasses.block} aria-hidden="true">
			<div className={CalendarSkeletonClasses.elements.bar} />
			<div className={CalendarSkeletonClasses.elements.bar} />
			<div className={CalendarSkeletonClasses.elements.bar} />
		</div>
	);
}
