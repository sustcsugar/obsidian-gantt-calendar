import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { DateTimePickerClasses } from '../../utils/bem';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { i18n } from '../../i18n/i18n';
import { Icon } from './Icon';

export interface DateTimePickerProps {
	/** 当前值（null = 未设置） */
	value: Date | null;
	/** 值变化回调（清除时传 null） */
	onChange: (d: Date | null) => void;
	/** 未设置时的占位文本 */
	placeholder?: string;
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const WEEKDAY_OFFSET = 6; // 周一为每周第一天：getDay() 周日(0) → 列 6

function parseTimeText(text: string): { h: number; m: number } | null {
	const match = TIME_RE.exec(text.trim());
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	if (h > 23 || m > 59) return null;
	return { h, m };
}

function isSameDay(a: Date | null, b: Date): boolean {
	return !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 以周一为首日，构建覆盖显示月份的 6×7 日期网格 */
function buildMonthGrid(year: number, month: number): Date[] {
	const first = new Date(year, month - 1, 1);
	const offset = (first.getDay() + WEEKDAY_OFFSET) % 7;
	const start = new Date(year, month - 1, 1 - offset);
	return Array.from({ length: 42 }, (_, i) =>
		new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
	);
}

/** 容错日期文本解析：2026-09-03 / 2026/9/3 / 2026.9.3、当年 9-3、自然词 今天/明天/后天 */
function parseDateText(text: string, now: Date): Date | null {
	const t = text.trim();
	if (!t) return null;
	if (t === i18n.t('modals.dateTimePicker.relToday')) return startOfDay(now);
	if (t === i18n.t('modals.dateTimePicker.relTomorrow')) return startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
	if (t === i18n.t('modals.dateTimePicker.relDayAfterTomorrow')) return startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
	let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
	if (m) {
		const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
		return isNaN(d.getTime()) ? null : startOfDay(d);
	}
	m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(t);
	if (m) {
		const d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
		return isNaN(d.getTime()) || d.getMonth() !== Number(m[1]) - 1 ? null : startOfDay(d);
	}
	return null;
}

/** 相对日期标签：今天/明天/后天，其余返回 null */
function relativeLabel(d: Date, now: Date): string | null {
	const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
	if (days === 0) return i18n.t('modals.dateTimePicker.relToday');
	if (days === 1) return i18n.t('modals.dateTimePicker.relTomorrow');
	if (days === 2) return i18n.t('modals.dateTimePicker.relDayAfterTomorrow');
	return null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 日期时间选择器（Ant Design showTime 面板复刻）
 *
 * 面板 = 左侧日历（‹‹‹›››切年切月 + 月份网格）+ 右侧时/分滚动列
 * + 底部「此刻」与「确定」。面板内选择写入草稿值，确定才提交并关闭；
 * 「此刻」立即写入当前时间并关闭。触发器输入框可直接键入日期（多分隔符容错）。
 */
export function DateTimePicker({ value, onChange, placeholder }: DateTimePickerProps): JSX.Element {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const [open, setOpen] = useState(false);
	const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
	const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
	/** 面板草稿值：确定才提交到 onChange */
	const [draft, setDraft] = useState<Date | null>(null);
	const [inputText, setInputText] = useState<string | null>(null);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	const now = useMemo(() => new Date(), []);

	// 弹层外点击 / Esc 关闭（未确定的草稿直接丢弃）
	useEffect(() => {
		if (!open) return;
		const onDocMouseDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', onDocMouseDown);
		document.addEventListener('keydown', onKeyDown, true);
		return () => {
			document.removeEventListener('mousedown', onDocMouseDown);
			document.removeEventListener('keydown', onKeyDown, true);
		};
	}, [open]);

	// 面板定位（portal 到 body 后用 fixed 坐标）：下方空间不足翻转到上方，
	// 右侧溢出改为右对齐；弹窗/页面滚动与窗口缩放时跟随重算
	const updatePos = useCallback(() => {
		const trigger = rootRef.current?.getBoundingClientRect();
		const panel = popoverRef.current;
		if (!trigger || !panel) return;
		const pw = panel.offsetWidth;
		const ph = panel.offsetHeight;
		let top = trigger.bottom + 4;
		if (top + ph > window.innerHeight - 8 && trigger.top - ph > 8) top = trigger.top - ph - 4;
		let left = trigger.left;
		if (left + pw > window.innerWidth - 8) left = trigger.right - pw;
		setPos({ top, left: Math.max(8, left) });
	}, []);

	useLayoutEffect(() => {
		if (!open) return;
		updatePos();
	}, [open, viewMonth, viewYear, updatePos]);

	useEffect(() => {
		if (!open) return;
		// capture 捕获弹窗内部滚动容器的滚动事件
		window.addEventListener('scroll', updatePos, true);
		window.addEventListener('resize', updatePos);
		return () => {
			window.removeEventListener('scroll', updatePos, true);
			window.removeEventListener('resize', updatePos);
		};
	}, [open, updatePos]);

	// 时/分滚动列：打开与选择后把选中项滚到列中部
	useEffect(() => {
		if (!open || !popoverRef.current) return;
		popoverRef.current.querySelectorAll<HTMLElement>('[data-selected="true"]').forEach(el => {
			const wrap = el.parentElement as HTMLElement | null;
			if (wrap) wrap.scrollTop = el.offsetTop - wrap.clientHeight / 2 + el.clientHeight / 2;
		});
	}, [open, draft, viewMonth, viewYear]);

	const openPanel = useCallback(() => {
		const base = value ?? new Date();
		setDraft(value);
		setViewYear(base.getFullYear());
		setViewMonth(base.getMonth() + 1);
		setOpen(true);
	}, [value]);

	const toggle = useCallback(() => {
		if (open) setOpen(false);
		else openPanel();
	}, [open, openPanel]);

	const commit = useCallback((d: Date | null) => {
		onChange(d);
		if (d) setDraft(d);
	}, [onChange]);

	const confirm = useCallback(() => {
		onChange(draft);
		setOpen(false);
	}, [draft, onChange]);

	const setNow = useCallback(() => {
		commit(new Date());
		setOpen(false);
	}, [commit]);

	/** 选中日期：保留面板草稿中的时间部分，面板保持打开（等确定） */
	const selectDay = useCallback((day: Date) => {
		setDraft(prev => new Date(day.getFullYear(), day.getMonth(), day.getDate(), prev?.getHours() ?? 0, prev?.getMinutes() ?? 0));
	}, []);

	/** 设置时间单位（时/分列点击）：无草稿日期时以今天为底 */
	const setTimeUnit = useCallback((unit: 'h' | 'm', v: number) => {
		setDraft(prev => {
			const base = prev ?? new Date();
			const next = new Date(base);
			if (unit === 'h') next.setHours(v, 0, 0, 0);
			else next.setMinutes(v, 0, 0);
			return next;
		});
	}, []);

	const applyDateText = useCallback(() => {
		if (inputText === null) return;
		const parsed = parseDateText(inputText, new Date());
		if (parsed) {
			const base = value ?? new Date();
			onChange(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), base.getHours(), base.getMinutes()));
		}
		setInputText(null);
	}, [inputText, value, onChange]);

	const clear = useCallback(() => {
		onChange(null);
		setDraft(null);
		setInputText(null);
		setOpen(false);
	}, [onChange]);

	const days = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
	const today = useMemo(() => new Date(), []);
	const weekdayNames = i18n.t('sidebar.dailyTimeline.weekdays') as unknown as string[];
	// 周一为首日：i18n 数组为周日索引，取一~六 + 周日；去掉"周"前缀只留汉字
	const weekdays = useMemo(
		() => [1, 2, 3, 4, 5, 6, 0].map(i => weekdayNames[i].replace(/^周/, '')),
		[weekdayNames]
	);
	const monthLabel = i18n.t('modals.dateTimePicker.monthFormat', { year: viewYear, month: viewMonth });
	const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
	const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

	const displayText = useMemo(() => {
		if (inputText !== null) return inputText;
		if (!value) return placeholder ?? '';
		const rel = relativeLabel(value, now);
		const time = formatDate(value, 'HH:mm');
		if (rel && time === '00:00') return rel;
		return rel ? `${rel} ${time}` : formatDate(value, 'yyyy-MM-dd HH:mm');
	}, [inputText, value, placeholder, now]);

	const renderTimeColumn = (unit: 'h' | 'm', values: number[], current: number | null) => (
		<div className={DateTimePickerClasses.elements.timeColumn}>
			{values.map(v => {
				const selected = current === v;
				return (
					<button
						key={v}
						className={[DateTimePickerClasses.elements.timeCell, selected ? DateTimePickerClasses.modifiers.timeCellSelected : ''].filter(Boolean).join(' ')}
						data-selected={String(selected)}
						tabIndex={-1}
						onClick={() => setTimeUnit(unit, v)}
					>
						{pad2(v)}
					</button>
				);
			})}
		</div>
	);

	return (
		<div className={DateTimePickerClasses.block} ref={rootRef}>
			<div className={DateTimePickerClasses.elements.trigger}>
				<input
					className={DateTimePickerClasses.elements.input}
					type="text"
					value={displayText}
					placeholder={placeholder ?? ''}
					spellCheck={false}
					onChange={(e) => setInputText(e.target.value)}
					onFocus={() => { if (open) return; openPanel(); }}
					onBlur={() => applyDateText()}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							applyDateText();
							(e.target as HTMLInputElement).blur();
						}
					}}
				/>
				{value ? (
					<button
						className={DateTimePickerClasses.elements.triggerClear}
						aria-label={i18n.t('common.clear')}
						onClick={(e) => {
							e.stopPropagation();
							clear();
						}}
					>
						<Icon icon="x" />
					</button>
				) : null}
				<button
					className={[DateTimePickerClasses.elements.triggerIcon, open ? 'is-open' : ''].join(' ')}
					aria-expanded={open}
					tabIndex={-1}
					onClick={toggle}
				>
					<Icon icon="calendar" />
				</button>
			</div>

			{open ? createPortal(
				<div
					className={DateTimePickerClasses.elements.popover}
					role="dialog"
					ref={popoverRef}
					style={{
						position: 'fixed',
						top: pos?.top ?? -9999,
						left: pos?.left ?? -9999,
						visibility: pos ? 'visible' : 'hidden',
						zIndex: 1000,
					}}
				>
					<div className={DateTimePickerClasses.elements.body}>
						{/* 左侧：日历 */}
						<div className={DateTimePickerClasses.elements.calendar}>
							<div className={DateTimePickerClasses.elements.header}>
								<button className={DateTimePickerClasses.elements.navButton} aria-label="<<" tabIndex={-1}
									onClick={() => setViewYear(viewYear - 1)}>
									<Icon icon="chevrons-left" />
								</button>
								<button className={DateTimePickerClasses.elements.navButton} aria-label="<" tabIndex={-1}
									onClick={() => { if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); } else setViewMonth(viewMonth - 1); }}>
									<Icon icon="chevron-left" />
								</button>
								<span className={DateTimePickerClasses.elements.monthLabel}>{monthLabel}</span>
								<button className={DateTimePickerClasses.elements.navButton} aria-label=">" tabIndex={-1}
									onClick={() => { if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); } else setViewMonth(viewMonth + 1); }}>
									<Icon icon="chevron-right" />
								</button>
								<button className={DateTimePickerClasses.elements.navButton} aria-label=">>" tabIndex={-1}
									onClick={() => setViewYear(viewYear + 1)}>
									<Icon icon="chevrons-right" />
								</button>
							</div>

							<div className={DateTimePickerClasses.elements.weekdays}>
								{weekdays.map((name, i) => (
									<span key={i} className={DateTimePickerClasses.elements.weekday}>{name}</span>
								))}
							</div>

							<div className={DateTimePickerClasses.elements.dayGrid}>
								{days.map((day) => {
									const otherMonth = day.getMonth() + 1 !== viewMonth;
									const classes = [
										DateTimePickerClasses.elements.dayCell,
										...(otherMonth ? [DateTimePickerClasses.modifiers.dayOtherMonth] : []),
										...(isSameDay(day, today) ? [DateTimePickerClasses.modifiers.dayToday] : []),
										...(isSameDay(draft, day) ? [DateTimePickerClasses.modifiers.daySelected] : []),
									].filter(Boolean).join(' ');
									return (
										<button
											key={day.getTime()}
											className={classes}
											tabIndex={-1}
											onClick={() => selectDay(day)}
										>
											{day.getDate()}
										</button>
									);
								})}
							</div>
						</div>

						{/* 右侧：时/分滚动列 */}
						<div className={DateTimePickerClasses.elements.timePanel}>
							{renderTimeColumn('h', hours, draft?.getHours() ?? null)}
							{renderTimeColumn('m', minutes, draft?.getMinutes() ?? null)}
						</div>
					</div>

					<div className={DateTimePickerClasses.elements.footer}>
						<button className={DateTimePickerClasses.elements.nowButton} onClick={setNow}>
							{i18n.t('modals.dateTimePicker.now')}
						</button>
						<button className={DateTimePickerClasses.elements.okButton} onClick={confirm}>
							{i18n.t('modals.dateTimePicker.ok')}
						</button>
					</div>
				</div>,
				document.body
			) : null}
		</div>
	);
}
