import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
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

/**
 * 容错日期文本解析（NN/g 建议：接受多分隔符、忽略前导零、失败返回 null 不猜测）。
 * 支持：2026-09-03 / 2026/9/3 / 2026.9.3、当年 9-3 / 9/3、自然词 今天/明天/后天。
 */
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

/** 相对日期标签（Linear 式）：今天/明天/后天，其余返回 null */
function relativeLabel(d: Date, now: Date): string | null {
	const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
	if (days === 0) return i18n.t('modals.dateTimePicker.relToday');
	if (days === 1) return i18n.t('modals.dateTimePicker.relTomorrow');
	if (days === 2) return i18n.t('modals.dateTimePicker.relDayAfterTomorrow');
	return null;
}

/**
 * 日期时间选择器（Linear 风格，输入 + 日历混合模式）
 *
 * - 触发器为可键入输入框：直接输日期（多分隔符容错、支持"今天/明天"），
 *   日历图标展开弹层面板
 * - 弹层：快捷预设行（今天/明天/周末/下周）+ 月份网格（周一首日，
 *   ‹›切月 «»切年，方向键导航）+ 时间输入（↑↓ ±15 分钟）+ 清除
 * - 弹层自动翻转/对齐避免被裁剪；选中日期后保持打开以便继续调时间
 */
export function DateTimePicker({ value, onChange, placeholder }: DateTimePickerProps): JSX.Element {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const [open, setOpen] = useState(false);
	const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
	const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
	const [timeText, setTimeText] = useState('');
	const [inputText, setInputText] = useState<string | null>(null);
	const [focusedDay, setFocusedDay] = useState<Date | null>(null);
	const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
	const [align, setAlign] = useState<'left' | 'right'>('left');

	const now = useMemo(() => new Date(), []);

	const syncFromValue = useCallback((d: Date | null) => {
		const base = d ?? new Date();
		setViewYear(base.getFullYear());
		setViewMonth(base.getMonth() + 1);
		setTimeText(d ? formatDate(d, 'HH:mm') : '');
		setFocusedDay(d ?? startOfDay(new Date()));
	}, []);

	const toggle = useCallback(() => {
		if (!open) syncFromValue(value);
		setOpen(!open);
	}, [open, value, syncFromValue]);

	// 弹层外点击 / Esc 关闭
	useEffect(() => {
		if (!open) return;
		const onDocMouseDown = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

	// 弹层定位：下方空间不足翻转到上方，右侧溢出改为右对齐
	useLayoutEffect(() => {
		if (!open || !popoverRef.current || !rootRef.current) return;
		const rect = popoverRef.current.getBoundingClientRect();
		const triggerTop = rootRef.current.getBoundingClientRect().top;
		setPlacement(rect.bottom > window.innerHeight && triggerTop > rect.height ? 'top' : 'bottom');
		setAlign(rect.right > window.innerWidth - 8 ? 'right' : 'left');
	}, [open, viewMonth, viewYear]);

	const commit = useCallback((d: Date | null) => {
		onChange(d);
		if (d) {
			setTimeText(formatDate(d, 'HH:mm'));
			setFocusedDay(startOfDay(d));
		}
	}, [onChange]);

	const selectDay = useCallback((day: Date) => {
		const base = value ?? new Date();
		const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes());
		commit(next);
	}, [value, commit]);

	const applyTime = useCallback((text: string) => {
		if (!value) return;
		const parsed = parseTimeText(text);
		if (!parsed) {
			setTimeText(formatDate(value, 'HH:mm'));
			return;
		}
		const next = new Date(value);
		next.setHours(parsed.h, parsed.m, 0, 0);
		commit(next);
	}, [value, commit]);

	const stepTime = useCallback((minutes: number) => {
		if (!value) return;
		const next = new Date(value);
		next.setMinutes(next.getMinutes() + minutes);
		commit(next);
	}, [value, commit]);

	const applyDateText = useCallback(() => {
		if (inputText === null) return;
		const parsed = parseDateText(inputText, new Date());
		if (parsed) {
			const base = value ?? new Date();
			const next = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), base.getHours(), base.getMinutes());
			commit(next);
		}
		setInputText(null);
	}, [inputText, value, commit]);

	const clear = useCallback(() => {
		onChange(null);
		setTimeText('');
		setInputText(null);
		setOpen(false);
	}, [onChange]);

	const days = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
	const today = useMemo(() => new Date(), []);
	const weekdayNames = i18n.t('sidebar.dailyTimeline.weekdays') as unknown as string[];
	// 周一为首日：i18n 数组为周日索引，取一~六 + 周日
	const weekdays = useMemo(
		() => [1, 2, 3, 4, 5, 6, 0].map(i => weekdayNames[i]),
		[weekdayNames]
	);
	const monthLabel = i18n.t('modals.dateTimePicker.monthFormat', { year: viewYear, month: viewMonth });

	const presetToday = startOfDay(new Date());
	const presets: Array<{ label: string; date: Date }> = [
		{ label: i18n.t('modals.dateTimePicker.presetToday'), date: presetToday },
		{ label: i18n.t('modals.dateTimePicker.presetTomorrow'), date: new Date(presetToday.getFullYear(), presetToday.getMonth(), presetToday.getDate() + 1) },
		{ label: i18n.t('modals.dateTimePicker.presetWeekend'), date: new Date(presetToday.getFullYear(), presetToday.getMonth(), presetToday.getDate() + ((6 - presetToday.getDay() + 7) % 7 || 7)) },
		{ label: i18n.t('modals.dateTimePicker.presetNextWeek'), date: new Date(presetToday.getFullYear(), presetToday.getMonth(), presetToday.getDate() + (8 - presetToday.getDay())) },
	];

	const displayText = useMemo(() => {
		if (inputText !== null) return inputText;
		if (!value) return placeholder ?? '';
		const rel = relativeLabel(value, now);
		const time = formatDate(value, 'HH:mm');
		if (rel && time === '00:00') return rel;
		return rel ? `${rel} ${time}` : formatDate(value, 'yyyy-MM-dd HH:mm');
	}, [inputText, value, placeholder, now]);

	const dayGridKeyDown = useCallback((e: React.KeyboardEvent) => {
		const base = focusedDay ?? value ?? new Date();
		let next: Date | null = null;
		if (e.key === 'ArrowLeft') next = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1);
		else if (e.key === 'ArrowRight') next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
		else if (e.key === 'ArrowUp') next = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 7);
		else if (e.key === 'ArrowDown') next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7);
		else if (e.key === 'Enter' && focusedDay) { selectDay(focusedDay); e.preventDefault(); return; }
		if (!next) return;
		e.preventDefault();
		setFocusedDay(next);
		setViewYear(next.getFullYear());
		setViewMonth(next.getMonth() + 1);
	}, [focusedDay, value, selectDay]);

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
					onFocus={() => { if (open) return; syncFromValue(value); setOpen(true); }}
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
					aria-label={i18n.t('common.today')}
					aria-expanded={open}
					tabIndex={-1}
					onClick={toggle}
				>
					<Icon icon="calendar" />
				</button>
			</div>

			{open ? (
				<div
					className={[
						DateTimePickerClasses.elements.popover,
						placement === 'top' ? DateTimePickerClasses.modifiers.popoverTop : '',
						align === 'right' ? DateTimePickerClasses.modifiers.popoverRight : '',
					].filter(Boolean).join(' ')}
					role="dialog"
					ref={popoverRef}
				>
					{/* 快捷预设行 */}
					<div className={DateTimePickerClasses.elements.presets}>
						{presets.map(p => (
							<button
								key={p.label}
								className={[DateTimePickerClasses.elements.preset, isSameDay(value, p.date) ? DateTimePickerClasses.modifiers.presetActive : ''].filter(Boolean).join(' ')}
								onClick={() => {
									const base = value ?? new Date();
									commit(new Date(p.date.getFullYear(), p.date.getMonth(), p.date.getDate(), base.getHours(), base.getMinutes()));
								}}
							>
								{p.label}
							</button>
						))}
					</div>

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

					<div className={DateTimePickerClasses.elements.dayGrid} onKeyDown={dayGridKeyDown}>
						{days.map((day) => {
							const otherMonth = day.getMonth() + 1 !== viewMonth;
							const classes = [
								DateTimePickerClasses.elements.dayCell,
								...(otherMonth ? [DateTimePickerClasses.modifiers.dayOtherMonth] : []),
								...(isSameDay(day, today) ? [DateTimePickerClasses.modifiers.dayToday] : []),
								...(isSameDay(value, day) ? [DateTimePickerClasses.modifiers.daySelected] : []),
								...(focusedDay && isSameDay(day, focusedDay) ? [DateTimePickerClasses.modifiers.dayFocused] : []),
							].filter(Boolean).join(' ');
							return (
								<button
									key={day.getTime()}
									className={classes}
									tabIndex={-1}
									onClick={() => { setFocusedDay(day); selectDay(day); }}
								>
									{day.getDate()}
								</button>
							);
						})}
					</div>

					<div className={DateTimePickerClasses.elements.footer}>
						<input
							className={DateTimePickerClasses.elements.timeInput}
							type="text"
							inputMode="numeric"
							placeholder={i18n.t('modals.dateTimePicker.timePlaceholder')}
							value={timeText}
							disabled={!value}
							onChange={(e) => setTimeText(e.target.value)}
							onBlur={(e) => applyTime(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									applyTime((e.target as HTMLInputElement).value);
									(e.target as HTMLInputElement).blur();
								} else if (e.key === 'ArrowUp') {
									e.preventDefault();
									stepTime(15);
								} else if (e.key === 'ArrowDown') {
									e.preventDefault();
									stepTime(-15);
								}
							}}
						/>
						<button className={DateTimePickerClasses.elements.footerButton} onClick={clear}>
							{i18n.t('common.clear')}
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
