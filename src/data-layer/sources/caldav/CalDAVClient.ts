/**
 * CalDAV 客户端
 *
 * 实现 CalDAV 协议的核心 HTTP 操作。
 * 支持 WebDAV 扩展方法（REPORT, PROPFIND, MKCALENDAR 等）。
 */

import { Logger } from '../../../utils/logger';

/**
 * CalDAV 配置
 */
export interface CalDAVConfig {
    url: string;                // CalDAV 服务器 URL
    username?: string;          // 用户名（基本认证）
    password?: string;          // 密码（基本认证）
    accessToken?: string;       // OAuth 访问令牌
    calendarPath?: string;      // 日历路径（可选）
}

/**
 * CalDAV 事件
 */
export interface CalDAVEvent {
    uid: string;                // 唯一标识
    ics: string;                // 完整 ICS 内容
    etag?: string;              // ETag 用于版本控制
    url: string;                // 资源 URL
}

/**
 * CalDAV 响应
 */
export interface CalDAVResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    status?: number;
}

/**
 * 日历信息
 */
export interface CalendarInfo {
    href: string;
    displayName?: string;
    description?: string;
    color?: string;
    supportedComponents?: string[];
}

/**
 * CalDAV 客户端
 */
export class CalDAVClient {
    private config: CalDAVConfig;

    constructor(config: CalDAVConfig) {
        this.config = config;
    }

    /**
     * 获取认证头
     */
    private getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};

        if (this.config.accessToken) {
            headers['Authorization'] = `Bearer ${this.config.accessToken}`;
        } else if (this.config.username && this.config.password) {
            headers['Authorization'] = 'Basic ' + btoa(`${this.config.username}:${this.config.password}`);
        }

        return headers;
    }

    /**
     * 发送 CalDAV 请求
     */
    private async request(
        method: string,
        url: string,
        headers?: Record<string, string>,
        body?: string
    ): Promise<CalDAVResponse<string>> {
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    ...this.getAuthHeaders(),
                    ...headers,
                },
                body,
            });

            const responseText = await response.text();

            if (response.ok) {
                return {
                    success: true,
                    data: responseText,
                    status: response.status,
                };
            }

            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
                status: response.status,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 验证连接
     */
    async validateConnection(): Promise<boolean> {
        try {
            // 尝试获取用户 Principal URL
            const response = await this.request(
                'PROPFIND',
                this.config.url,
                {
                    'Depth': '0',
                    'Content-Type': 'application/xml; charset=utf-8',
                },
                `<?xml version="1.0" encoding="utf-8" ?>
                <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
                    <D:prop>
                        <C:calendar-home-set/>
                        <D:current-user-principal/>
                    </D:prop>
                </D:propfind>`
            );

            return response.success;
        } catch {
            return false;
        }
    }

    /**
     * 获取日历列表
     */
    async getCalendars(): Promise<CalDAVResponse<CalendarInfo[]>> {
        const response = await this.request(
            'PROPFIND',
            this.config.url,
            {
                'Depth': '1',
                'Content-Type': 'application/xml; charset=utf-8',
            },
            `<?xml version="1.0" encoding="utf-8" ?>
            <D:propfind xmlns:D="DAV:" xmlns:A="http://apple.com/ns/ical/" xmlns:C="urn:ietf:params:xml:ns:caldav">
                <D:prop>
                    <D:displayname/>
                    <D:resourcetype/>
                    <A:calendar-color/>
                    <C:supported-calendar-component-set/>
                </D:prop>
            </D:propfind>`
        );

        if (!response.success) {
            return { success: false, error: response.error };
        }

        try {
            const calendars = this.parseCalendarList(response.data || '');
            return { success: true, data: calendars };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 解析日历列表
     */
    private parseCalendarList(xml: string): CalendarInfo[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const responses = Array.from(doc.querySelectorAll('response'));

        const calendars: CalendarInfo[] = [];

        for (const response of responses) {
            const href = response.querySelector('href')?.textContent;
            const propStat = response.querySelector('propstat');
            const prop = propStat?.querySelector('prop');

            if (!href || !prop) continue;

            // 只处理日历资源
            const resourceType = prop.querySelector('resourcetype');
            const isCalendar = resourceType?.querySelector('calendar') !== null;

            if (!isCalendar) continue;

            const displayName = prop.querySelector('displayname')?.textContent || undefined;
            const color = prop.querySelector('calendar-color')?.textContent || undefined;

            calendars.push({
                href: this.resolveUrl(href),
                displayName,
                color,
            });
        }

        return calendars;
    }

    /**
     * 获取事件列表（使用 REPORT 方法）
     */
    async getEvents(timeRange?: { start: Date; end: Date }): Promise<CalDAVResponse<CalDAVEvent[]>> {
        const calendarUrl = this.config.calendarPath || this.config.url;

        let requestBody = `<?xml version="1.0" encoding="utf-8" ?>
            <C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
                <D:prop>
                    <D:getetag/>
                    <C:calendar-data/>
                </D:prop>
                <C:filter>
                    <C:comp-filter name="VCALENDAR">
                        <C:comp-filter name="VEVENT">`;

        if (timeRange) {
            const start = this.formatDate(timeRange.start);
            const end = this.formatDate(timeRange.end);
            requestBody += `
                            <C:time-range start="${start}" end="${end}"/>`;
        }

        requestBody += `
                        </C:comp-filter>
                    </C:comp-filter>
                </C:filter>
            </C:calendar-query>`;

        const response = await this.request(
            'REPORT',
            calendarUrl,
            {
                'Depth': '1',
                'Content-Type': 'application/xml; charset=utf-8',
            },
            requestBody
        );

        if (!response.success) {
            return { success: false, error: response.error };
        }

        try {
            const events = this.parseEventList(response.data || '', calendarUrl);
            return { success: true, data: events };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 解析事件列表
     */
    private parseEventList(xml: string, baseUrl: string): CalDAVEvent[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const responses = Array.from(doc.querySelectorAll('response'));

        const events: CalDAVEvent[] = [];

        for (const response of responses) {
            const href = response.querySelector('href')?.textContent;
            const propStat = response.querySelector('propstat[prop*="200"]');
            const prop = propStat?.querySelector('prop');

            if (!href || !prop) continue;

            const etag = prop.querySelector('getetag')?.textContent?.replace(/"/g, '');
            const calendarData = prop.querySelector('calendar-data')?.textContent;

            if (!calendarData) continue;

            // 从 ICS 中提取 UID
            const uidMatch = calendarData.match(/UID:([^\r\n]+)/i);
            const uid = uidMatch ? uidMatch[1].trim() : this.generateUID();

            events.push({
                uid,
                ics: calendarData,
                etag,
                url: this.resolveUrl(href),
            });
        }

        return events;
    }

    /**
     * 获取单个事件
     */
    async getEvent(eventUrl: string): Promise<CalDAVResponse<CalDAVEvent>> {
        const response = await this.request(
            'GET',
            eventUrl,
            {
                'Accept': 'text/calendar',
            }
        );

        if (!response.success) {
            return { success: false, error: response.error };
        }

        // 从 ICS 中提取 UID
        const uidMatch = response.data?.match(/UID:([^\r\n]+)/i);
        const uid = uidMatch ? uidMatch[1].trim() : this.generateUID();

        return {
            success: true,
            data: {
                uid,
                ics: response.data || '',
                url: eventUrl,
            },
        };
    }

    /**
     * 创建事件
     */
    async createEvent(ics: string): Promise<CalDAVResponse<{ uid: string; url: string }>> {
        // 从 ICS 中提取 UID
        const uidMatch = ics.match(/UID:([^\r\n]+)/i);
        let uid = uidMatch ? uidMatch[1].trim() : this.generateUID();

        // 如果没有 UID，添加一个
        if (!uidMatch) {
            ics = ics.replace(/BEGIN:VEVENT/i, `BEGIN:VEVENT\r\nUID:${uid}`);
        }

        const calendarUrl = this.config.calendarPath || this.config.url;
        const eventUrl = `${calendarUrl}/${uid}.ics`;

        const response = await this.request(
            'PUT',
            eventUrl,
            {
                'Content-Type': 'text/calendar; charset=utf-8',
            },
            ics
        );

        if (response.success) {
            return {
                success: true,
                data: { uid, url: eventUrl },
            };
        }

        return { success: false, error: response.error };
    }

    /**
     * 更新事件
     */
    async updateEvent(eventUrl: string, ics: string, etag?: string): Promise<CalDAVResponse<void>> {
        const headers: Record<string, string> = {
            'Content-Type': 'text/calendar; charset=utf-8',
        };

        if (etag) {
            headers['If-Match'] = etag;
        }

        const response = await this.request('PUT', eventUrl, headers, ics);
        return {
            success: response.success,
            error: response.error,
            status: response.status,
        };
    }

    /**
     * 删除事件
     */
    async deleteEvent(eventUrl: string, etag?: string): Promise<CalDAVResponse<void>> {
        const headers: Record<string, string> = {};

        if (etag) {
            headers['If-Match'] = etag;
        }

        const response = await this.request('DELETE', eventUrl, headers);
        return {
            success: response.success,
            error: response.error,
            status: response.status,
        };
    }

    /**
     * 生成唯一 UID
     */
    private generateUID(): string {
        return `${Date.now()}@gantt-calendar`;
    }

    /**
     * 格式化日期为 CalDAV 格式
     */
    private formatDate(date: Date): string {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    /**
     * 解析相对 URL
     */
    private resolveUrl(href: string): string {
        if (href.startsWith('http')) {
            return href;
        }

        const baseUrl = this.config.url.replace(/\/$/, '');
        const cleanHref = href.startsWith('/') ? href : `/${href}`;

        return baseUrl + cleanHref;
    }

    /**
     * 设置配置
     */
    setConfig(config: Partial<CalDAVConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 获取配置
     */
    getConfig(): CalDAVConfig {
        return { ...this.config };
    }
}
