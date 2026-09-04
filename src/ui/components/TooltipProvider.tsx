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
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { GCTask } from '../../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { i18n } from '../../i18n/i18n';
import { TooltipClasses } from '../../utils/bem';
import { TagPillSpan } from './TagPillSpan';
import { isTouchNow } from '../utils/platform';
import { MOTION, tooltipVariants, easeOutTransition } from '../motion';

interface TooltipState {
	task: GCTask;
	anchor: HTMLElement;
	/** 相对视口的锚点位置（鼠标位置优先） */
	x: number;
	y: number;
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
 * 替换命令式 TooltipManager 单例（输出相同 BEM 类名）
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

	const show = useCallback((task: GCTask, anchor: HTMLElement, pos?: { x: number; y: number }) => {
		clearTimers();
		showTimer.current = window.setTimeout(() => {
			const rect = anchor.getBoundingClientRect();
			setState({
				task,
				anchor,
				x: pos?.x ?? rect.right + 10,
				y: pos?.y ?? rect.top,
			});
		}, SHOW_DELAY);
	}, [clearTimers]);

	const hide = useCallback(() => {
		if (showTimer.current !== null) {
			window.clearTimeout(showTimer.current);
			showTimer.current = null;
		}
		hideTimer.current = window.setTimeout(() => {
			setState(null);
		}, HIDE_DELAY);
	}, []);

	const cancel = useCallback(() => {
		clearTimers();
		setState(null);
	}, [clearTimers]);

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

/**
 * 触发组件：包裹需要悬浮提示的元素
 */
export function TaskTooltipTrigger({
	task,
	children,
}: {
	task: GCTask;
	children: ReactNode;
}): JSX.Element {
	const { show, hide, cancel } = useTaskTooltip();
	const ref = useRef<HTMLSpanElement | null>(null);

	const handleEnter = (e: ReactMouseEvent) => {
		show(task, e.currentTarget as HTMLElement, { x: e.clientX, y: e.clientY });
	};

	return (
		<span
			ref={ref}
			className="gc-u-inline"
			onMouseEnter={(e) => { if (!isTouchNow()) handleEnter(e); }}
			onMouseLeave={hide}
			onContextMenu={cancel}
			onDragStart={cancel}
		>
			{children}
		</span>
	);
}

function TooltipContent({ state, onClose }: { state: TooltipState; onClose: () => void }): JSX.Element {
	const { task, anchor, x, y } = state;
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

	// 实测尺寸后定位（useLayoutEffect 在绘制前执行，无闪烁）
	useLayoutEffect(() => {
		const el = tooltipRef.current;
		if (!el) return;
		const tooltipWidth = el.offsetWidth || 300;
		const tooltipHeight = el.offsetHeight || 160;
		const gap = 12;

		const rect = anchor.getBoundingClientRect();

		let left: number;
		let top: number;
		if (rect.width > 0 && rect.height > 0) {
			left = rect.right + gap;
			top = rect.top;
		} else {
			left = x + gap;
			top = y + gap;
		}
		if (left + tooltipWidth > window.innerWidth) left = rect.left - tooltipWidth - gap;
		left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));
		top = Math.max(10, top);
		if (top + tooltipHeight > window.innerHeight - 10) top = Math.max(10, window.innerHeight - tooltipHeight - 10);
		setPosition({ left, top });
	}, [state, anchor, x, y]);

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
				{sections.map((section, idx) => (
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

interface PropRow {
	label: string;
	value: string;
	valueClass?: string;
	isOverdue?: boolean;
}

interface TooltipSection {
	key: string;
	rows: PropRow[];
}

function buildTooltipSections(task: GCTask): TooltipSection[] {
	const sections: TooltipSection[] = [];

	const timeRows: PropRow[] = [];
	const pushTime = (date: Date | undefined, label: string, precision?: 'day' | 'time') => {
		if (!date) return;
		timeRows.push({ label, value: formatDate(date, precision === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') });
	};
	pushTime(task.createdDate, i18n.t('taskCard.created'), task.datePrecision?.createdDate);
	pushTime(task.startDate, i18n.t('taskCard.start'), task.datePrecision?.startDate);
	pushTime(task.scheduledDate, i18n.t('taskCard.scheduled'), task.datePrecision?.scheduledDate);
	if (task.dueDate) {
		timeRows.push({
			label: i18n.t('taskCard.due'),
			value: formatDate(task.dueDate, task.datePrecision?.dueDate === 'time' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'),
			isOverdue: task.dueDate < new Date() && !task.completed,
		});
	}
	pushTime(task.cancelledDate, i18n.t('taskCard.cancelled'), task.datePrecision?.cancelledDate);
	pushTime(task.completionDate, i18n.t('taskCard.done'), task.datePrecision?.completionDate);
	if (task.repeat) timeRows.push({ label: i18n.t('taskCard.repeat'), value: task.repeat });
	if (timeRows.length > 0) sections.push({ key: 'time', rows: timeRows });

	if (task.priority && task.priority !== 'normal') {
		const icons: Record<string, string> = { highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' };
		sections.push({
			key: 'priority',
			rows: [{
				label: i18n.t('taskCard.priority'),
				value: `${icons[task.priority] || ''} ${i18n.t(`common.priority.${task.priority}`)}`,
				valueClass: `priority-${task.priority}`,
			}],
		});
	}

	if (task.tags && task.tags.length > 0) sections.push({ key: 'tags', rows: [] });

	if (task.metadataFields && task.metadataFields.length > 0) {
		sections.push({
			key: 'metadata',
			rows: task.metadataFields.map((f) => ({ label: f.key, value: f.value || i18n.t('taskCard.emptyValue') })),
		});
	}

	sections.push({
		key: 'file',
		rows: [{ label: i18n.t('taskCard.fileLocation'), value: `${task.fileName}:${task.lineNumber}` }],
	});

	return sections;
}