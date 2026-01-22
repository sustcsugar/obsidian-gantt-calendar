/**
 * 飞书 OAuth 认证模块
 *
 * 处理飞书用户认证流程，使用 user_access_token
 * API 文档:
 * - 获取授权码: https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code
 * - 获取用户令牌（传统端点）: https://open.feishu.cn/document/authentication-management/access-token/obtain-user_token
 * - 刷新用户令牌（传统端点）: https://open.feishu.cn/document/authentication-management/access-token/refresh_user_token
 *
 * 注意：由于 CORS 限制，需要使用 Obsidian 的 requestUrl 方法进行 HTTP 请求
 */

import { Logger } from '../../../../../utils/logger';
import type { FeishuOAuthConfig, FeishuTokenResponseV2, FetchFunction } from './FeishuTypes';
import { API_ENDPOINTS, DEFAULT_REDIRECT_URI, DEFAULT_SCOPES } from './FeishuConstants';
import { FeishuHttpClient, buildRequestUrlConfig } from './FeishuHttpClient';

// ==================== 请求构建函数 ====================

/**
 * 构建授权 URL
 * @param clientId 应用 ID
 * @param redirectUri 重定向 URI
 * @param state 状态参数（防 CSRF）
 * @param scope 权限范围
 */
export function buildAuthUrl(
    clientId: string,
    redirectUri: string = DEFAULT_REDIRECT_URI,
    state?: string,
    scope?: string
): string {
    const params = new URLSearchParams();
    params.append('app_id', clientId);
    params.append('redirect_uri', redirectUri);
    if (state) {
        params.append('state', state);
    }
    if (scope) {
        params.append('scope', scope);
    }
    return `${API_ENDPOINTS.AUTH}?${params.toString()}`;
}

/**
 * 构建令牌交换请求体（v2 API，form-urlencoded 格式）
 * @param clientId 应用 ID (client_id)
 * @param clientSecret 应用密钥 (client_secret)
 * @param code 授权码
 * @param redirectUri 重定向 URI（必须与授权时使用的一致）
 */
export function buildTokenRequestBody(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string
): string {
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    return params.toString();
}

/**
 * 构建令牌刷新请求体（v2 API，form-urlencoded 格式）
 * @param clientId 应用 ID (client_id)
 * @param clientSecret 应用密钥 (client_secret)
 * @param refreshToken 刷新令牌 (refresh_token)
 */
export function buildRefreshTokenRequestBody(
    clientId: string,
    clientSecret: string,
    refreshToken: string
): string {
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    return params.toString();
}

/**
 * 生成随机 state（防 CSRF）
 */
export function generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
}

// ==================== 飞书 OAuth 类 ====================

/**
 * 飞书 OAuth 辅助类
 */
export class FeishuOAuth {
    /**
     * 获取默认重定向 URI
     */
    static getDefaultRedirectUri(): string {
        return DEFAULT_REDIRECT_URI;
    }

    /**
     * 生成授权 URL
     * @param config OAuth 配置
     * @returns 授权 URL
     */
    static getAuthUrl(config: FeishuOAuthConfig): string {
        const state = generateState();
        const scopes = config.scopes && config.scopes.length > 0
            ? config.scopes
            : DEFAULT_SCOPES;
        return buildAuthUrl(
            config.clientId,
            config.redirectUri || DEFAULT_REDIRECT_URI,
            state,
            scopes
        );
    }

    /**
     * 交换授权码获取令牌（v2 API）
     * @param config OAuth 配置
     * @param code 授权码
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns Token 响应
     */
    static async exchangeCodeForToken(
        config: FeishuOAuthConfig,
        code: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTokenResponseV2> {
        Logger.info('FeishuOAuth', 'Exchanging authorization code for token');

        // 使用辅助函数构建请求体
        const redirectUri = config.redirectUri || DEFAULT_REDIRECT_URI;
        const requestBodyStr = buildTokenRequestBody(config.clientId, config.clientSecret, code, redirectUri);

        Logger.debug('FeishuOAuth', 'Token exchange request', {
            url: API_ENDPOINTS.TOKEN,
            method: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            body: requestBodyStr,
            appId: config.clientId,
            code: code,
        });

        const response = await FeishuHttpClient.fetch(API_ENDPOINTS.TOKEN, {
            method: 'POST',
            body: requestBodyStr,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }, fetchFn);

        Logger.debug('FeishuOAuth', 'Token exchange response', {
            status: response.status,
            body: response.text,
        });

        // v2 API 响应格式直接包含 access_token，无 data 包裹层
        const data = await FeishuHttpClient.parseResponse<FeishuTokenResponseV2>(response);

        // 检查错误响应（v2 可能返回 error 字段）
        if (data.error || (data.code !== undefined && data.code !== 0)) {
            const errorMsg = data.error_description || data.error || '未知错误';
            const errorCode = data.code || -1;
            Logger.error('FeishuOAuth', 'Token exchange failed', { code: errorCode, msg: errorMsg });
            throw new Error(`飞书 OAuth 错误: ${errorMsg} (错误码: ${errorCode})`);
        }

        if (!data.access_token) {
            Logger.error('FeishuOAuth', 'Token response missing access_token');
            throw new Error('飞书 OAuth 错误: 响应中缺少 access_token');
        }

        Logger.info('FeishuOAuth', 'Token exchange successful', {
            hasAccessToken: !!data.access_token,
            hasRefreshToken: !!data.refresh_token,
            expiresIn: data.expires_in,
        });

        return data;
    }

    /**
     * 刷新访问令牌（v2 API）
     * @param config OAuth 配置
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns Token 响应
     */
    static async refreshAccessToken(
        config: FeishuOAuthConfig,
        fetchFn?: FetchFunction
    ): Promise<FeishuTokenResponseV2> {
        Logger.info('FeishuOAuth', 'Refreshing access token');

        if (!config.refreshToken) {
            throw new Error('没有可用的刷新令牌，请重新授权');
        }

        // 使用辅助函数构建请求体
        const requestBodyStr = buildRefreshTokenRequestBody(
            config.clientId,
            config.clientSecret,
            config.refreshToken
        );

        Logger.debug('FeishuOAuth', 'Token refresh request', {
            url: API_ENDPOINTS.REFRESH,
            method: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            body: requestBodyStr,
        });

        const response = await FeishuHttpClient.fetch(API_ENDPOINTS.REFRESH, {
            method: 'POST',
            body: requestBodyStr,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }, fetchFn);

        Logger.debug('FeishuOAuth', 'Token refresh response', {
            status: response.status,
            body: response.text,
        });

        // v2 API 响应格式直接包含 access_token，无 data 包裹层
        const data = await FeishuHttpClient.parseResponse<FeishuTokenResponseV2>(response);

        // 检查错误响应（v2 可能返回 error 字段）
        if (data.error || (data.code !== undefined && data.code !== 0)) {
            const errorMsg = data.error_description || data.error || '未知错误';
            const errorCode = data.code || -1;
            Logger.error('FeishuOAuth', 'Token refresh failed', { code: errorCode, msg: errorMsg });
            throw new Error(`飞书刷新令牌错误: ${errorMsg} (错误码: ${errorCode})`);
        }

        if (!data.access_token) {
            Logger.error('FeishuOAuth', 'Token refresh response missing access_token');
            throw new Error('飞书刷新令牌错误: 响应中缺少 access_token');
        }

        Logger.info('FeishuOAuth', 'Token refresh successful');
        return data;
    }

    /**
     * 格式化过期时间为可读字符串
     * @param expireAt 过期时间戳
     * @returns 格式化后的字符串
     */
    static formatExpireTime(expireAt: number): string {
        const now = Date.now();
        const remaining = expireAt - now;

        if (remaining <= 0) {
            return '已过期';
        }

        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} 天 ${hours % 24} 小时后过期`;
        } else if (hours > 0) {
            return `${hours} 小时 ${minutes} 分钟后过期`;
        } else {
            return `${minutes} 分钟后过期`;
        }
    }
}
