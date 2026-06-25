/**
 * @fileoverview 日期范围筛选器组件
 * @module toolbar/components/date-range-filter
 */

import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { ToolbarClasses } from '../../utils/bem';
import { i18n } from '../../i18n/i18n';

/**
 * 日期范围类型
 */
export type DateRangeType = 'all' | 'day' | 'week' | 'month' | 'custom';

/**
 * 日期范围状态
 */
export interface DateRangeState {
	type: DateRangeType;
	specificDate?: Date;
}

/**
 * 日期范围筛选器配置选项
 */
export interface DateRangeFilterOptions {
	/** 当前日期范围状态 */
	currentState: DateRangeState;
	/** 范围变化回调 */
	onRangeChange: (state: DateRangeState) => void;
	/** 容器样式类 */
	containerClass?: string;
	/** 日期输入框样式类 */
	inputClass?: string;
	/** 模式按钮样式类 */
	buttonClass?: string;
	/** 是否显示"全"选项 */
	showAllOption?: boolean;
	/** 自定义标签文本 */
	labelText?: string;
}

/**
 * 日期范围模式配置
 */
interface DateRangeMode {
	key: DateRangeType;
	label: string;
	title: string;
}

function getDefaultModes(): DateRangeMode[] {
	return [
		{ key: 'all', label: i18n.t('toolbar.dateFilter.all'), title: i18n.t('toolbar.dateFilter.allTime') },
		{ key: 'day', label: i18n.t('toolbar.dateFilter.day'), title: i18n.t('toolbar.dateFilter.byDay') },
		{ key: 'week', label: i18n.t('toolbar.dateFilter.week'), title: i18n.t('toolbar.dateFilter.byWeek') },
		{ key: 'month', label: i18n.t('toolbar.dateFilter.month'), title: i18n.t('toolbar.dateFilter.byMonth') }
	];
}

/**
 * 渲染日期范围筛选器
 *
 * 特性：
 * - 日期输入框支持自定义日期
 * - 快捷按钮：全/日/周/月
 * - 自定义日期时清除按钮高亮
 * - 记录前一个模式用于恢复
 * - 修复：选择日期后正确更新显示
 * - 修复：允许重复选择同一天
 *
 * @param container 容器元素
 * @param options 配置选项
 * @returns 包含更新函数和清理函数的对象
 */
export function renderDateRangeFilter(
	container: HTMLElement,
	options: DateRangeFilterOptions
): { updateState: (state: DateRangeState) => void; cleanup: () => void } {
	const {
		currentState,
		onRangeChange,
		containerClass,
		inputClass = ToolbarClasses.components.dateFilter.input,
		buttonClass = ToolbarClasses.components.dateFilter.modeBtn,
		showAllOption = true
	} = options;

	// 记录前一个模式（用于清除自定义日期后恢复）
	let previousMode: DateRangeType = 'week';
	// 记录当前输入框的值，用于检测是否重复选择同一天
	let lastInputValue: string = '';

	// 创建日期筛选组容器
	const dateFilterGroup = container.createDiv(ToolbarClasses.components.dateFilter.group);
	if (containerClass) dateFilterGroup.addClass(containerClass);

	// 创建日期输入框
	const dateInput = dateFilterGroup.createEl('input', {
		cls: inputClass,
		attr: { type: 'date' }
	});

	// 存储模式按钮元素
	const modeButtons: Map<DateRangeType, HTMLElement> = new Map();

	/**
	 * 更新输入框显示
	 */
	const updateInputDisplay = (state: DateRangeState) => {
		if (state.type === 'custom' && state.specificDate) {
			try {
				dateInput.value = formatDate(state.specificDate, 'yyyy-MM-dd');
				lastInputValue = dateInput.value;
			} catch {
				dateInput.value = '';
				lastInputValue = '';
			}
		} else if (state.type === 'day') {
			// 日模式显示当天日期
			const today = new Date();
			dateInput.value = formatDate(today, 'yyyy-MM-dd');
			lastInputValue = dateInput.value;
		} else {
			// 其他模式清空输入框
			dateInput.value = '';
			lastInputValue = '';
		}
	};

	// 设置初始值
	updateInputDisplay(currentState);

	/**
	 * 验证日期格式是否完整 (yyyy-MM-dd)
	 */
	const isValidDateFormat = (val: string): boolean => {
		return /^\d{4}-\d{2}-\d{2}$/.test(val);
	};

	/**
	 * 处理日期输入完成（只处理完整日期）
	 */
	const handleDateInput = () => {
		const val = dateInput.value;

		// 空值处理
		if (!val) {
			onRangeChange({ type: previousMode, specificDate: undefined });
			const prevBtn = modeButtons.get(previousMode);
			if (prevBtn) prevBtn.classList.add('active');
			lastInputValue = '';
			return;
		}

		// 只在日期格式完整时才触发筛选
		if (isValidDateFormat(val) && val !== lastInputValue) {
			const d = new Date(val);
			if (!isNaN(d.getTime())) {
				onRangeChange({ type: 'custom', specificDate: d });
				lastInputValue = val;
				// 清除所有按钮的高亮
				modeButtons.forEach(btn => btn.classList.remove('active'));
			}
		}
	};

	// 监听 input 事件（支持手动输入）
	// 监听 change 事件（支持日历选择）
	dateInput.addEventListener('input', handleDateInput);
	dateInput.addEventListener('change', handleDateInput);

	// 创建模式按钮
	const modes = showAllOption
		? getDefaultModes()
		: getDefaultModes().filter(m => m.key !== 'all');

	modes.forEach((mode) => {
		const btn = dateFilterGroup.createEl('button', {
			cls: buttonClass,
			text: mode.label,
			attr: { 'data-mode': mode.key, title: mode.title }
		});

		// 根据当前状态设置高亮
		if (currentState.type !== 'custom' && mode.key === currentState.type) {
			btn.classList.add('active');
			// 更新 previousMode
			previousMode = mode.key;
		}

		btn.addEventListener('click', () => {
			// 保存当前模式为前一个状态
			previousMode = mode.key;
			// 更新状态
			const specificDate = mode.key === 'day' ? new Date() : undefined;
			onRangeChange({ type: mode.key, specificDate });
			// 更新输入框显示
			updateInputDisplay({ type: mode.key, specificDate });
			// 高亮切换
			modeButtons.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
		});

		modeButtons.set(mode.key, btn);
	});

	/**
	 * 更新筛选器状态
	 */
	const updateState = (state: DateRangeState) => {
		// 更新模式按钮高亮
		modeButtons.forEach((btn, key) => {
			if (state.type !== 'custom' && key === state.type) {
				btn.classList.add('active');
				previousMode = key;
			} else {
				btn.classList.remove('active');
			}
		});

		// 更新输入框显示
		updateInputDisplay(state);
	};

	// 清理函数
	const cleanup = () => {
		modeButtons.clear();
		dateInput.remove();
		dateFilterGroup.remove();
	};

	return { updateState, cleanup };
}
