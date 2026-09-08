/**
 * 任务悬浮卡片内容构建（框架无关纯函数）
 *
 * React TooltipProvider 与命令式 TooltipManager 共用，
 * 保证两端分组顺序与字段永不漂移：时间 → 优先级 → 标签 → 元数据 → 文件位置。
 */

import type { GCTask } from '../../types';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { i18n } from '../../i18n/i18n';

export interface TooltipPropRow {
	label: string;
	value: string;
	valueClass?: string;
	isOverdue?: boolean;
}

export interface TooltipSection {
	key: string;
	rows: TooltipPropRow[];
}

/** 优先级 emoji 映射（两端共用） */
const PRIORITY_ICONS: Record<string, string> = {
	highest: '🔺',
	high: '⏫',
	medium: '🔼',
	low: '🔽',
	lowest: '⏬',
};

export function buildTooltipSections(task: GCTask): TooltipSection[] {
	const sections: TooltipSection[] = [];

	const timeRows: TooltipPropRow[] = [];
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
		sections.push({
			key: 'priority',
			rows: [{
				label: i18n.t('taskCard.priority'),
				value: `${PRIORITY_ICONS[task.priority] || ''} ${i18n.t(`common.priority.${task.priority}`)}`,
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
