/**
 * 飞书用户信息 API
 *
 * 处理用户信息相关的 API 请求
 */

import { Logger } from '../../../../../utils/logger';
import type { FeishuUserInfo, FetchFunction } from './FeishuTypes';
import { API_ENDPOINTS } from './FeishuConstants';
import { FeishuHttpClient } from './FeishuHttpClient';
import type { FeishuUserInfoResponse } from './FeishuTypes';

/**
 * 飞书用户信息 API
 */
export class FeishuUserApi {
    /**
     * 获取用户信息
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 用户信息
     */
    static async getUserInfo(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuUserInfo> {
        Logger.info('FeishuUserApi', 'Fetching user info');

        const response = await FeishuHttpClient.fetch(API_ENDPOINTS.USER_INFO, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        Logger.debug('FeishuUserApi', 'User info response', {
            status: response.status,
            body: response.text,
        });

        const data = await FeishuHttpClient.parseResponse<FeishuUserInfoResponse>(response);

        if (data.code !== 0 || !data.data) {
            Logger.error('FeishuUserApi', 'Get user info failed', { code: data.code, msg: data.msg });
            throw new Error(`获取用户信息失败: ${data.msg}`);
        }

        const userInfo = data.data;
        return {
            userId: userInfo.user_id,
            name: userInfo.name,
            enName: userInfo.en_name,
            email: userInfo.email,
            avatar: userInfo.avatar_url || userInfo.avatar_middle || userInfo.avatar_thumb || '',
        };
    }
}
