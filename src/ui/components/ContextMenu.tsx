import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ContextMenuClasses } from '../../utils/bem';
import { Icon } from './Icon';
import { MOTION, panelVariants, easeOutTransition } from '../motion';
import { isPhoneNow } from '../utils/platform';

export interface ContextMenuItemDef {
	key: string;
	title: ReactNode;
	icon?: string;
	disabled?: boolean;
	onClick?: () => void;
}

export interface ContextMenuSection {
	items: ContextMenuItemDef[];
}

export interface ContextMenuTriggerProps {
	/** 触发右键菜单的目标内容 */
	children: ReactNode;
	/** 菜单内容：数组内每个元素为一段（段之间显示分隔线） */
	sections: ContextMenuSection[];
	/** 打开前回调 */
	onOpen?: () => void;
	/** 菜单类名 */
	className?: string;
	/** 禁用内置触屏长按（容器自管长按手势时使用，如时间画布的拖动/菜单复用手势） */
	longPressDisabled?: boolean;
}

interface MenuState {
	x: number;
	y: number;
}

/**
 * 声明式右键菜单：替换 registerTaskContextMenu + new Menu()
 * 在 contextmenu 事件位置弹出，点击外部 / Escape 关闭
 */
export function ContextMenuTrigger({
	children,
	sections,
	onOpen,
	className,
	longPressDisabled,
}: ContextMenuTriggerProps): JSX.Element {
	const [state, setState] = useState<MenuState | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);

	const handleContextMenu = useCallback((e: ReactMouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onOpen?.();
		setState({ x: e.clientX, y: e.clientY });
	}, [onOpen]);

	// ===== 触屏长按（500ms）唤出菜单；桌面右键不受影响 =====
	const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
	/** 长按唤出后抑制紧随的 click（否则抬指会顺带触发卡片点击打开文件） */
	const suppressClickRef = useRef(false);

	const clearLongPress = useCallback(() => {
		const lp = longPressRef.current;
		if (lp) {
			window.clearTimeout(lp.timer);
			longPressRef.current = null;
		}
	}, []);

	const handlePointerDown = useCallback((e: ReactPointerEvent) => {
		if (e.pointerType === 'mouse' || longPressDisabled) return; // 桌面走右键 / 左键点击；容器自管长按
		const x = e.clientX;
		const y = e.clientY;
		const timer = window.setTimeout(() => {
			longPressRef.current = null;
			suppressClickRef.current = true;
			window.setTimeout(() => { suppressClickRef.current = false; }, 400);
			navigator.vibrate?.(10);
			onOpen?.();
			setState({ x, y });
		}, 500);
		longPressRef.current = { timer, x, y };
	}, [onOpen]);

	const handlePointerMove = useCallback((e: ReactPointerEvent) => {
		const lp = longPressRef.current;
		if (!lp) return;
		// 位移超阈值视为滚动/滑动，取消长按
		if (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10) clearLongPress();
	}, [clearLongPress]);

	const handleClickCapture = useCallback((e: ReactMouseEvent) => {
		if (suppressClickRef.current) {
			e.preventDefault();
			e.stopPropagation();
		}
	}, []);

	const close = useCallback(() => setState(null), []);

	useEffect(() => {
		if (!state) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
		};
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	}, [state, close]);

	// Keep the menu inside the viewport: flip above / left of the cursor when
	// opening near the bottom / right edge would push the panel off-screen.
	useLayoutEffect(() => {
		if (!state || !menuRef.current) return;
		const rect = menuRef.current.getBoundingClientRect();
		const margin = 8;
		let x = state.x;
		let y = state.y;

		if (y + rect.height > window.innerHeight - margin) {
			y = Math.max(margin, state.y - rect.height);
		}
		if (x + rect.width > window.innerWidth - margin) {
			x = Math.max(margin, state.x - rect.width);
		}

		if (x !== state.x || y !== state.y) {
			setState({ x, y });
		}
	}, [state]);

	// 菜单项渲染（浮动菜单与手机底部面板共用）
	const renderSections = () => sections.map((section, si) => (
		<div key={si} className={ContextMenuClasses.section}>
			{section.items.map((item) => (
				<button
					key={item.key}
					className={`${ContextMenuClasses.item}${item.disabled ? ` ${ContextMenuClasses.itemDisabled}` : ''}`}
					disabled={item.disabled}
					onClick={() => {
						if (item.disabled) return;
						close();
						item.onClick?.();
					}}
				>
					{item.icon ? <Icon icon={item.icon} className={ContextMenuClasses.itemIcon} /> : null}
					<span className={ContextMenuClasses.itemLabel}>{item.title}</span>
				</button>
			))}
		</div>
	));

	const openAsSheet = state !== null && isPhoneNow();

	return (
		<div
			className={className}
			style={{ display: 'contents' }}
			onContextMenu={handleContextMenu}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={clearLongPress}
			onPointerCancel={clearLongPress}
			onClickCapture={handleClickCapture}
		>
			{children}
			{createPortal(
				<AnimatePresence>
					{state ? (
						openAsSheet ? (
							// 手机端：底部操作面板（拇指可达，符合移动习惯）
							<Fragment key="context-sheet">
								<motion.div
									className={ContextMenuClasses.sheetOverlay}
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={easeOutTransition(MOTION.dur.fast)}
									onClick={close}
								/>
								<motion.div
									key="context-sheet"
									ref={menuRef}
									className={`${ContextMenuClasses.container} ${ContextMenuClasses.sheet}`}
									initial={{ y: '100%' }}
									animate={{ y: 0 }}
									exit={{ y: '100%' }}
									transition={easeOutTransition(MOTION.dur.normal)}
								>
									<div className={ContextMenuClasses.sheetGrabber} />
									{renderSections()}
								</motion.div>
							</Fragment>
						) : (
							<motion.div
								key="context-menu"
								ref={menuRef}
								className={ContextMenuClasses.container}
								style={{ position: 'fixed', left: state.x, top: state.y }}
								variants={panelVariants}
								initial="initial"
								animate="animate"
								exit="exit"
								transition={easeOutTransition(MOTION.dur.fast)}
							>
								{renderSections()}
							</motion.div>
						)
					) : null}
				</AnimatePresence>,
				document.body
			)}
		</div>
	);
}