/**
 * 飞书日历 API
 *
 * 处理日历相关的 API 请求
 */

import { Logger } from '../../../../../utils/logger';
import type { FeishuCalendar, FetchFunction } from './FeishuTypes';
import { API_ENDPOINTS } from './FeishuConstants';
import { FeishuHttpClient } from './FeishuHttpClient';
import type { FeishuCalendarListResponse } from './FeishuTypes';

/**
 * 飞书日历 API
 */
export class FeishuCalendarApi {
    /**
     * 获取用户日历列表
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 日历列表
     */
    static async getCalendarList(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuCalendar[]> {
        Logger.info('FeishuCalendarApi', 'Fetching calendar list');

        // 构建 URL 参数
        const url = new URL(API_ENDPOINTS.CALENDAR_LIST);
        url.searchParams.append('page_size', '500');

        const response = await FeishuHttpClient.fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        Logger.debug('FeishuCalendarApi', 'Calendar list response', {
            status: response.status,
            body: response.text,
        });

        const data = await FeishuHttpClient.parseResponse<FeishuCalendarListResponse>(response);

        if (data.code !== 0) {
            Logger.error('FeishuCalendarApi', 'Get calendar list failed', { code: data.code, msg: data.msg });
            throw new Error(`获取日历列表失败: ${data.msg}`);
        }

        const calendarList = data.data?.calendar_list || [];
        Logger.debug('FeishuCalendarApi', `Fetched ${calendarList.length} calendars`,
            calendarList.map((cal, index) => {
                const isPrimary = cal.type === 'primary';
                return `${index + 1}. ${cal.summary} (${cal.calendar_id})${isPrimary ? ' [主日历]' : ''}`;
            })
        );

        return calendarList;
    }
}
