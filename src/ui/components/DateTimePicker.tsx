import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
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

function isSameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
 * 日期时间选择器（Linear 风格）
 *
 * 触发按钮 + 内联日历弹层：月份网格（周一为首日）、时间输入、今天/清除。
 * 日期与时间在同一弹层内完成编辑，选中日期后弹层保持打开以便继续调时间。
 */
export function DateTimePicker({ value, onChange, placeholder }: DateTimePickerProps): JSX.Element {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [open, setOpen] = useState(false);
	const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
	const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
	const [timeText, setTimeText] = useState('');

	const syncFromValue = useCallback((d: Date | null) => {
		const base = d ?? new Date();
		setViewYear(base.getFullYear());
		setViewMonth(base.getMonth() + 1);
		setTimeText(d ? formatDate(d, 'HH:mm') : '');
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

	const commit = useCallback((d: Date | null) => {
		onChange(d);
		if (d) setTimeText(formatDate(d, 'HH:mm'));
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

	const setToday = useCallback(() => {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), value?.getHours() ?? 0, value?.getMinutes() ?? 0);
		commit(next);
	}, [value, commit]);

	const clear = useCallback(() => {
		onChange(null);
		setTimeText('');
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

	return (
		<div className={DateTimePickerClasses.block} ref={rootRef}>
			<div
				className={DateTimePickerClasses.elements.trigger}
				role="button"
				tabIndex={0}
				aria-expanded={open}
				onClick={toggle}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						toggle();
					}
				}}
			>
				<span className={DateTimePickerClasses.elements.triggerIcon}>
					<Icon icon="calendar" />
				</span>
				<span className={DateTimePickerClasses.elements.triggerText} data-placeholder={!value}>
					{value ? formatDate(value, 'yyyy-MM-dd HH:mm') : (placeholder ?? '')}
				</span>
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
			</div>

			{open ? (
				<div className={DateTimePickerClasses.elements.popover} role="dialog">
					<div className={DateTimePickerClasses.elements.header}>
						<button
							className={DateTimePickerClasses.elements.navButton}
							aria-label="<"
							onClick={() => {
								if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); }
								else setViewMonth(viewMonth - 1);
							}}
						>
							<Icon icon="chevron-left" />
						</button>
						<span className={DateTimePickerClasses.elements.monthLabel}>{monthLabel}</span>
						<button
							className={DateTimePickerClasses.elements.navButton}
							aria-label=">"
							onClick={() => {
								if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); }
								else setViewMonth(viewMonth + 1);
							}}
						>
							<Icon icon="chevron-right" />
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
								...(value && isSameDay(day, value) ? [DateTimePickerClasses.modifiers.daySelected] : []),
							].join(' ');
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

					<div className={DateTimePickerClasses.elements.footer}>
						<input
							className={DateTimePickerClasses.elements.timeInput}
							type="text"
							inputMode="numeric"
							placeholder="HH:mm"
							value={timeText}
							disabled={!value}
							onChange={(e) => setTimeText(e.target.value)}
							onBlur={(e) => applyTime(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									applyTime((e.target as HTMLInputElement).value);
									(e.target as HTMLInputElement).blur();
								}
							}}
						/>
						<button className={DateTimePickerClasses.elements.footerButton} onClick={setToday}>
							{i18n.t('common.today')}
						</button>
						<button className={DateTimePickerClasses.elements.footerButton} onClick={clear}>
							{i18n.t('common.clear')}
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
