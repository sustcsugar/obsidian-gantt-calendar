/**
 * ICS 任务转换器
 *
 * 负责 iCalendar (ICS) 格式与 GCTask 之间的双向转换。
 * 支持 VEVENT（事件）和 VTODO（任务）组件。
 *
 * RFC 5545: https://tools.ietf.org/html/rfc5545
 */

import type { GCTask } from '../../../../types';

/**
 * ICS 组件类型
 */
type ICSComponent = 'VEVENT' | 'VTODO';

/**
 * 解析后的 ICS 组件
 */
interface ParsedComponent {
    type: ICSComponent;
    properties: Map<string, string>;
    dateProperties: Map<string, Date>;
}

/**
 * 将 ICS 字符串转换为 GCTask
 */
export function icsToGCTask(ics: string): GCTask {
    const component = parseICS(ics);

    // 基础字段
    const task: GCTask = {
        filePath: 'caldav',
        fileName: 'caldav.ics',
        lineNumber: 0,
        content: component.properties.get('DESCRIPTION') || component.properties.get('SUMMARY') || '',
        description: component.properties.get('SUMMARY') || '',
        completed: false,
        priority: 'normal',
        tags: [],
    };

    // 完成状态
    const status = component.properties.get('STATUS');
    const percentComplete = component.properties.get('PERCENT-COMPLETE');

    if (status === 'COMPLETED' || percentComplete === '100') {
        task.completed = true;
    }

    // VTODO 特有的完成标记
    if (component.type === 'VTODO') {
        const completed = component.dateProperties.get('COMPLETED');
        if (completed) {
            task.completed = true;
            task.completionDate = completed;
        }
    }

    // 优先级（0-9，0=未定义，1=最高，9=最低）
    const priority = component.properties.get('PRIORITY');
    if (priority) {
        const num = parseInt(priority);
        if (num <= 1) task.priority = 'highest';
        else if (num <= 4) task.priority = 'high';
        else if (num <= 5) task.priority = 'normal';
        else if (num <= 7) task.priority = 'low';
        else task.priority = 'lowest';
    }

    // 日期字段
    if (component.dateProperties.has('DTSTART')) {
        task.startDate = component.dateProperties.get('DTSTART');
    }

    if (component.dateProperties.has('DUE')) {
        task.dueDate = component.dateProperties.get('DUE');
    }

    // VEVENT 使用 DTEND 作为结束时间
    if (component.type === 'VEVENT' && component.dateProperties.has('DTEND')) {
        task.dueDate = component.dateProperties.get('DTEND');
    }

    if (component.dateProperties.has('CREATED')) {
        task.createdDate = component.dateProperties.get('CREATED');
    }

    if (component.dateProperties.has('LAST-MODIFIED')) {
        task.lastModified = component.dateProperties.get('LAST-MODIFIED');
    }

    // 标签（从 CATEGORIES 解析）
    const categories = component.properties.get('CATEGORIES');
    if (categories) {
        task.tags = categories.split(',').map(t => t.trim());
    }

    // 额外信息存储在 content 中
    const location = component.properties.get('LOCATION');
    const url = component.properties.get('URL');
    if (location || url) {
        const extras: string[] = [];
        if (location) extras.push(`📍 ${location}`);
        if (url) extras.push(`🔗 ${url}`);
        if (task.content) {
            task.content = `${task.content}\n\n${extras.join('\n')}`;
        } else {
            task.content = extras.join('\n');
        }
    }

    return task;
}

/**
 * 将 GCTask 转换为 ICS 字符串
 */
export function gcTaskToICS(task: GCTask, uid?: string): string {
    const uidValue = uid || generateUID();
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    // 决定使用 VEVENT 还是 VTODO
    // 如果有明确的 startDate 且不等于 dueDate，使用 VEVENT
    // 否则使用 VTODO
    const useEvent = task.startDate && task.dueDate &&
        task.startDate.getTime() !== task.dueDate.getTime();

    const icsLines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ObsidianGanttCalendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `BEGIN:${useEvent ? 'VEVENT' : 'VTODO'}`,
        `UID:${uidValue}`,
        `DTSTAMP:${now}`,
    ];

    // 标题/摘要
    if (task.description) {
        icsLines.push(`SUMMARY:${escapeICSText(task.description)}`);
    }

    // 描述
    if (task.content && task.content !== task.description) {
        icsLines.push(`DESCRIPTION:${escapeICSText(task.content)}`);
    }

    // 优先级
    if (task.priority && task.priority !== 'normal') {
        const priorityMap: Record<string, string> = {
            'highest': '1',
            'high': '3',
            'normal': '5',
            'low': '7',
            'lowest': '9',
        };
        icsLines.push(`PRIORITY:${priorityMap[task.priority] || '5'}`);
    }

    // 日期字段
    if (task.dueDate) {
        const formatted = formatDateICS(task.dueDate);
        icsLines.push(`DUE:${formatted}`);
    }

    if (task.startDate) {
        const formatted = formatDateICS(task.startDate);
        icsLines.push(`DTSTART:${formatted}`);
    }

    // VEVENT 需要 DTEND
    if (useEvent && task.dueDate) {
        const formatted = formatDateICS(task.dueDate);
        icsLines.push(`DTEND:${formatted}`);
    }

    // 创建日期
    if (task.createdDate) {
        const formatted = formatDateICS(task.createdDate);
        icsLines.push(`CREATED:${formatted}`);
    }

    // 完成状态
    if (task.completed) {
        icsLines.push('STATUS:COMPLETED');
        if (task.completionDate) {
            const formatted = formatDateICS(task.completionDate);
            icsLines.push(`COMPLETED:${formatted}`);
        } else {
            icsLines.push(`COMPLETED:${now}`);
        }
        icsLines.push('PERCENT-COMPLETE:100');
    } else {
        icsLines.push('STATUS:NEEDS-ACTION');
    }

    // 标签
    if (task.tags && task.tags.length > 0) {
        icsLines.push(`CATEGORIES:${task.tags.join(',')}`);
    }

    // 结束
    icsLines.push(`END:${useEvent ? 'VEVENT' : 'VTODO'}`);
    icsLines.push('END:VCALENDAR');

    return icsLines.join('\r\n');
}

/**
 * 解析 ICS 字符串
 */
function parseICS(ics: string): ParsedComponent {
    const lines = ics.split(/\r\n|\n|\r/);
    const properties = new Map<string, string>();
    const dateProperties = new Map<string, Date>();

    let currentComponent: ICSComponent | null = null;
    let continuation = false;
    let lastKey = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 跳过空行
        if (!line) continue;

        // 处理续行（以空格或制表符开头）
        if (line.startsWith(' ') || line.startsWith('\t')) {
            if (lastKey && continuation) {
                const currentValue = properties.get(lastKey) || '';
                properties.set(lastKey, currentValue + line.slice(1));
            }
            continue;
        }

        // 解析行
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).split(';')[0]; // 忽略参数
        const value = line.slice(colonIndex + 1);

        // 处理 BEGIN/END
        if (key === 'BEGIN') {
            if (value === 'VCALENDAR') {
                // VCALENDAR begin
            } else if (value === 'VEVENT' || value === 'VTODO') {
                currentComponent = value;
            }
            continue;
        }

        if (key === 'END') {
            if (value === 'VCALENDAR') {
                // VCALENDAR end
            } else if (value === 'VEVENT' || value === 'VTODO') {
                currentComponent = null;
            }
            continue;
        }

        // 只处理 VEVENT/VTODO 内的属性
        if (!currentComponent) continue;

        // 存储属性
        properties.set(key, value);
        lastKey = key;
        continuation = true;

        // 解析日期属性
        if (isDateProperty(key)) {
            const date = parseICSDate(value);
            if (date) {
                dateProperties.set(key, date);
            }
        }
    }

    return {
        type: currentComponent || 'VTODO',
        properties,
        dateProperties,
    };
}

/**
 * 判断是否为日期属性
 */
function isDateProperty(key: string): boolean {
    const dateProperties = [
        'DTSTART', 'DTEND', 'DUE', 'CREATED', 'COMPLETED',
        'LAST-MODIFIED', 'DTSTAMP', 'RECURRENCE-ID'
    ];
    return dateProperties.includes(key);
}

/**
 * 解析 ICS 日期
 */
function parseICSDate(value: string): Date | null {
    if (!value) return null;

    // 移除时区标识（如 TZID=...）
    const colonIndex = value.lastIndexOf(':');
    const dateStr = colonIndex > 0 ? value.slice(colonIndex + 1) : value;

    try {
        // 基本格式：YYYYMMDDTHHMMSS[Z]
        const year = parseInt(dateStr.slice(0, 4));
        const month = parseInt(dateStr.slice(4, 6)) - 1; // JS 月份从 0 开始
        const day = parseInt(dateStr.slice(6, 8));

        let hours = 0, minutes = 0, seconds = 0;
        let isUTC = false;

        if (dateStr.includes('T')) {
            hours = parseInt(dateStr.slice(9, 11));
            minutes = parseInt(dateStr.slice(11, 13));
            seconds = parseInt(dateStr.slice(13, 15));
            isUTC = dateStr.endsWith('Z');
        }

        const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));

        // 如果不是 UTC 时间，转换为本地时间
        if (!isUTC) {
            return new Date(year, month, day, hours, minutes, seconds);
        }

        return date;
    } catch {
        return null;
    }
}

/**
 * 格式化日期为 ICS 格式
 */
function formatDateICS(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * 转义 ICS 文本
 */
function escapeICSText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')  // 反斜杠
        .replace(/;/g, '\\;')     // 分号
        .replace(/,/g, '\\,')     // 逗号
        .replace(/\n/g, '\\n')    // 换行
        .replace(/\r/g, '\\r');   // 回车
}

/**
 * 生成 UID
 */
function generateUID(): string {
    return `${Date.now()}@gantt-calendar`;
}

/**
 * 从 ICS 中提取 UID
 */
export function extractUID(ics: string): string | null {
    const match = ics.match(/UID:([^\r\n]+)/i);
    return match ? match[1].trim() : null;
}
