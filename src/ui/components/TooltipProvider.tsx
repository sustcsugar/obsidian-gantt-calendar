import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type JSX,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { GCTask } from '../../types';
import { TooltipClasses } from '../../utils/bem';
import { TagPillSpan } from './TagPillSpan';
import { MOTION, tooltipVariants, easeOutTransition } from '../motion';
import {
	buildTooltipSections,
	type TooltipSection,
} from '../../components/tooltip/tooltipSections';
import { computeTooltipPosition } from '../../components/tooltip/tooltipPosition';
import {
	registerTooltipHolder,
	claimExclusiveTooltip,
} from '../../components/tooltip/tooltipCoordinator';

interface TooltipState {
	task: GCTask;
	anchor: HTMLElement;
	/** 悬停入口的光标位置（提供时鼠标优先锚定；未提供时仅作锚点无尺寸的回退） */
	mouse: { x: number; y: number } | null;
}

interface TooltipContextValue {
	show: (task: GCTask, anchor: HTMLElement, pos?: { x: number; y: number }) => void;
	hide: () => void;
	cancel: () => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export function useTaskTooltip(): TooltipContextValue {
	const ctx = useContext(TooltipContext);
	if (!ctx) throw new Error('useTaskTooltip 必须在 TooltipProvider 内使用');
	return ctx;
}

const SHOW_DELAY = 400;
const HIDE_DELAY = 100;

/**
 * 声明式任务 Tooltip 宿主：在 body 上渲染单个 tooltip
 * 内容构建与定位算法同命令式 TooltipManager 共享（components/tooltip）
 */
export function TooltipProvider({ children }: { children: ReactNode }): JSX.Element {
	const [state, setState] = useState<TooltipState | null>(null);
	const showTimer = useRef<number | null>(null);
	const hideTimer = useRef<number | null>(null);

	const clearTimers = useCallback(() => {
		if (showTimer.current !== null) {
			window.clearTimeout(showTimer.current);
			showTimer.current = null;
		}
		if (hideTimer.current !== null) {
			window.clearTimeout(hideTimer.current);
			hideTimer.current = null;
		}
	}, []);

	const cancel = useCallback(() => {
		clearTimers();
		setState(null);
	}, [clearTimers]);

	// 注册到跨实例互斥协调器：其他宿主（甘特图单例/别的 React root）弹出时立即隐藏本实例
	useEffect(() => registerTooltipHolder(cancel), [cancel]);

	const show = useCallback((task: GCTask, anchor: HTMLElement, pos?: { x: number; y: number }) => {
		clearTimers();
		showTimer.current = window.setTimeout(() => {
			claimExclusiveTooltip(cancel);
			setState({ task, anchor, mouse: pos ?? null });
		}, SHOW_DELAY);
	}, [clearTimers, cancel]);

	const hide = useCallback(() => {
		if (showTimer.current !== null) {
			window.clearTimeout(showTimer.current);
			showTimer.current = null;
		}
		hideTimer.current = window.setTimeout(() => {
			setState(null);
		}, HIDE_DELAY);
	}, []);

	useEffect(() => clearTimers, [clearTimers]);

	const value = useMemo(() => ({ show, hide, cancel }), [show, hide, cancel]);

	return (
		<TooltipContext.Provider value={value}>
			{children}
			<AnimatePresence>
				{state ? (
					<TooltipContent
						state={state}
						onClose={() => setState(null)}
					/>
				) : null}
			</AnimatePresence>
		</TooltipContext.Provider>
	);
}

function TooltipContent({ state, onClose }: { state: TooltipState; onClose: () => void }): JSX.Element {
	const { task, anchor, mouse } = state;
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

	// 实测尺寸后定位（useLayoutEffect 在绘制前执行，无闪烁）
	useLayoutEffect(() => {
		const el = tooltipRef.current;
		if (!el) return;
		const { left, top } = computeTooltipPosition({
			anchorRect: anchor.getBoundingClientRect(),
			mouse,
			// 调用方传入光标坐标即视为鼠标优先锚定（月视图等场景）
			preferMouse: mouse !== null,
			width: el.offsetWidth || 300,
			height: el.offsetHeight || 160,
		});
		setPosition({ left, top });
	}, [state, anchor, mouse]);

	const sections = useMemo(() => buildTooltipSections(task), [task]);

	return createPortal(
		<motion.div
			ref={tooltipRef}
			className={`${TooltipClasses.block} ${TooltipClasses.modifiers.visible}`}
			style={{ left: `${position?.left ?? -9999}px`, top: `${position?.top ?? -9999}px` }}
			variants={tooltipVariants}
			initial="initial"
			animate="animate"
			exit="exit"
			transition={easeOutTransition(MOTION.dur.fast)}
		>
			<div className={TooltipClasses.elements.description}>
				<strong>{task.description || ''}</strong>
			</div>
			<div className={TooltipClasses.elements.properties}>
				{sections.map((section: TooltipSection, idx: number) => (
					<div key={section.key}>
						{idx > 0 ? <div className={TooltipClasses.elements.propertyDivider} /> : null}
						<div className={TooltipClasses.elements.propertySection}>
							{section.key === 'tags' ? (
								<div className={TooltipClasses.elements.tags}>
									{(task.tags || []).map((t) => (
										<TagPillSpan key={t} label={t} showHash />
									))}
								</div>
							) : section.key === 'file' ? (
								<div className={TooltipClasses.elements.propertyRow}>
									<div className={TooltipClasses.elements.propertyLabel}>{section.rows[0].label}</div>
									<div className={`${TooltipClasses.elements.propertyValue} ${TooltipClasses.elements.fileLocation}`}>
										{section.rows[0].value}
									</div>
								</div>
							) : (
								section.rows.map((row, i) => (
									<div key={i} className={TooltipClasses.elements.propertyRow}>
										<div className={TooltipClasses.elements.propertyLabel}>{row.label}</div>
										<div
											className={[
												TooltipClasses.elements.propertyValue,
												row.valueClass,
												row.isOverdue ? TooltipClasses.modifiers.propertyValueOverdue : '',
											].filter(Boolean).join(' ')}
										>
											{row.value}
										</div>
									</div>
								))
							)}
						</div>
					</div>
				))}
			</div>
		</motion.div>,
		document.body
	);
}
