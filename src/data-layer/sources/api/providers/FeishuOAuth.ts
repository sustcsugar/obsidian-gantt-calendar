/**
 * 飞书 OAuth 辅助类
 *
 * 处理飞书用户认证流程，使用 user_access_token
 * API 文档:
 * - 获取授权码: https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code
 * - 获取用户令牌: https://open.feishu.cn/document/authentication-management/access-token/obtain-user_access_token
 * - 刷新用户令牌: https://open.feishu.cn/document/authentication-management/access-token/refresh-user_access_token
 *
 * 注意：由于 CORS 限制，需要使用 Obsidian 的 requestUrl 方法进行 HTTP 请求
 */

import { Logger } from '../../../../utils/logger';

const AUTH_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token';
const REFRESH_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token';
const USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
const CALENDAR_LIST_URL = 'https://open.feishu.cn/open-apis/calendar/v4/calendars';
const DEFAULT_REDIRECT_URI = 'https://open.feishu.cn/api-explorer/loading';

/**
 * HTTP 响应
 */
interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    text: string;
}

/**
 * 请求函数类型
 */
type FetchFunction = (
    url: string,
    options?: {
        method?: string;
        body?: string;
        headers?: Record<string, string>;
    }
) => Promise<HttpResponse>;

/**
 * 飞书 OAuth 配置
 */
export interface FeishuOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri?: string;
    scopes?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpireAt?: number;
}

/**
 * 飞书 Token 数据
 */
export interface FeishuTokenData {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    name?: string;
    user_id?: string;
}

/**
 * 飞书 Token 响应
 */
export interface FeishuTokenResponse {
    code: number;
    msg: string;
    data?: FeishuTokenData;
}

/**
 * 飞书用户信息响应（authen/v1/user_info）
 */
export interface FeishuUserInfoResponse {
    code: number;
    msg: string;
    data?: {
        name: string;
        en_name: string;
        email: string;
        avatar_url: string;
        avatar_middle?: string;
        avatar_thumb?: string;
        user_id: string;
        open_id: string;
        union_id?: string;
    };
}

/**
 * 飞书用户信息
 */
export interface FeishuUserInfo {
    userId: string;
    name: string;
    enName: string;
    email: string;
    avatar: string;
}

/**
 * 飞书日历信息
 */
export interface FeishuCalendar {
    calendar_id: string;
    summary: string;
    summary_alias?: string;
    description?: string;
    color?: number;
    timezone?: string;
    permissions?: 'private' | 'show_only_free_busy' | 'show_details' | 'public';
    role?: 'owner' | 'writer' | 'reader' | 'free_busy_reader';
    type?: 'primary' | 'shared' | 'subscription';
}

/**
 * 飞书日历列表响应
 */
export interface FeishuCalendarListResponse {
    code: number;
    msg: string;
    data?: {
        calendar_list?: FeishuCalendar[];
        page_token?: string;
        has_more?: boolean;
    };
}

/**
 * 飞书 OAuth 辅助类
 */
export class FeishuOAuth {
    // 可注入的请求函数（用于绕过 CORS）
    private static customFetch?: FetchFunction;

    /**
     * 设置自定义请求函数（用于 Obsidian 环境）
     * @param fetchFn 自定义请求函数
     */
    static setFetchFunction(fetchFn: FetchFunction): void {
        this.customFetch = fetchFn;
    }

    /**
     * 重置请求函数（恢复为原生 fetch）
     */
    static resetFetchFunction(): void {
        this.customFetch = undefined;
    }

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
        const state = this.generateState();

        // 构建授权参数
        const params = new URLSearchParams();
        params.append('app_id', config.clientId);
        params.append('redirect_uri', config.redirectUri || DEFAULT_REDIRECT_URI);
        params.append('state', state);

        // scope 参数：设置需要的权限
        // 如果配置中指定了 scopes，使用配置的；否则使用默认权限
        const scopes = config.scopes && config.scopes.length > 0
            ? config.scopes
            : 'calendar:calendar:readonly';

        if (scopes) {
            params.append('scope', scopes);
        }

        return `${AUTH_URL}?${params.toString()}`;
    }

    /**
     * 交换授权码获取令牌
     * @param config OAuth 配置
     * @param code 授权码
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns Token 响应
     */
    static async exchangeCodeForToken(
        config: FeishuOAuthConfig,
        code: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTokenResponse> {
        Logger.info('FeishuOAuth', 'Exchanging authorization code for token');

        // 构建请求体
        const requestBody = {
            app_id: config.clientId,
            app_secret: config.clientSecret,
            grant_type: 'authorization_code',
            code: code,
        };

        const requestBodyStr = JSON.stringify(requestBody);

        // 打印完整请求信息用于调试
        console.log('=== 飞书 OAuth Token 交换请求 ===');
        console.log('URL:', TOKEN_URL);
        console.log('Method: POST');
        console.log('Headers:', { 'Content-Type': 'application/json' });
        console.log('Request Body (完整):', requestBodyStr);
        console.log('App ID:', config.clientId);
        console.log('App Secret:', config.clientSecret);
        console.log('Authorization Code:', code);
        console.log('Grant Type: authorization_code');

        const response = await this.fetch(TOKEN_URL, {
            method: 'POST',
            body: requestBodyStr,
        }, fetchFn);

        // 打印完整响应信息
        console.log('=== 飞书 OAuth Token 交换响应 ===');
        console.log('Status:', response.status);
        console.log('Response Headers:', response.headers);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuTokenResponse>(response);

        if (data.code !== 0) {
            console.error('=== Token 交换失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            console.error('完整响应:', JSON.stringify(data, null, 2));
            Logger.error('FeishuOAuth', 'Token exchange failed', { code: data.code, msg: data.msg });
            throw new Error(`飞书 OAuth 错误: ${data.msg} (错误码: ${data.code})`);
        }

        Logger.info('FeishuOAuth', 'Token exchange successful', {
            hasAccessToken: !!data.data?.access_token,
            hasRefreshToken: !!data.data?.refresh_token,
            expiresIn: data.data?.expires_in,
        });

        return data;
    }

    /**
     * 刷新访问令牌
     * @param config OAuth 配置
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns Token 响应
     */
    static async refreshAccessToken(
        config: FeishuOAuthConfig,
        fetchFn?: FetchFunction
    ): Promise<FeishuTokenResponse> {
        Logger.info('FeishuOAuth', 'Refreshing access token');

        if (!config.refreshToken) {
            throw new Error('没有可用的刷新令牌，请重新授权');
        }

        // 构建请求体
        const requestBody = {
            app_id: config.clientId,
            app_secret: config.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: config.refreshToken,
        };

        const requestBodyStr = JSON.stringify(requestBody);

        // 打印完整请求信息用于调试
        console.log('=== 飞书 OAuth Token 刷新请求 ===');
        console.log('URL:', REFRESH_URL);
        console.log('Method: POST');
        console.log('Headers:', { 'Content-Type': 'application/json' });
        console.log('Request Body (完整):', requestBodyStr);
        console.log('App ID:', config.clientId);
        console.log('App Secret:', config.clientSecret);
        console.log('Refresh Token:', config.refreshToken);
        console.log('Grant Type: refresh_token');

        const response = await this.fetch(REFRESH_URL, {
            method: 'POST',
            body: requestBodyStr,
        }, fetchFn);

        // 打印完整响应信息
        console.log('=== 飞书 OAuth Token 刷新响应 ===');
        console.log('Status:', response.status);
        console.log('Response Headers:', response.headers);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuTokenResponse>(response);

        if (data.code !== 0) {
            console.error('=== Token 刷新失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            console.error('完整响应:', JSON.stringify(data, null, 2));
            Logger.error('FeishuOAuth', 'Token refresh failed', { code: data.code, msg: data.msg });
            throw new Error(`飞书刷新令牌错误: ${data.msg} (错误码: ${data.code})`);
        }

        Logger.info('FeishuOAuth', 'Token refresh successful');

        return data;
    }

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
        Logger.info('FeishuOAuth', 'Fetching user info');

        // 打印请求信息
        console.log('=== 飞书获取用户信息请求 ===');
        console.log('URL:', USER_INFO_URL);
        console.log('Method: GET');
        console.log('Headers:', { 'Authorization': `Bearer ${accessToken?.substring(0, 20)}...` });
        console.log('Token (前20位):', accessToken?.substring(0, 20));

        const response = await this.fetch(USER_INFO_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        // 打印响应信息
        console.log('=== 飞书获取用户信息响应 ===');
        console.log('Status:', response.status);
        console.log('Response Headers:', response.headers);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuUserInfoResponse>(response);

        if (data.code !== 0 || !data.data) {
            console.error('=== 获取用户信息失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            console.error('完整响应:', JSON.stringify(data, null, 2));
            Logger.error('FeishuOAuth', 'Get user info failed', { code: data.code, msg: data.msg });
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
        Logger.info('FeishuOAuth', 'Fetching calendar list');

        // 构建 URL 参数
        const url = new URL(CALENDAR_LIST_URL);
        url.searchParams.append('page_size', '500');

        // 打印请求信息
        console.log('=== 飞书获取日历列表请求 ===');
        console.log('URL:', url.toString());
        console.log('Method: GET');
        console.log('Headers:', { 'Authorization': `Bearer ${accessToken?.substring(0, 20)}...` });

        const response = await this.fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        // 打印响应信息
        console.log('=== 飞书获取日历列表响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuCalendarListResponse>(response);

        if (data.code !== 0) {
            console.error('=== 获取日历列表失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            console.error('完整响应:', JSON.stringify(data, null, 2));
            Logger.error('FeishuOAuth', 'Get calendar list failed', { code: data.code, msg: data.msg });
            throw new Error(`获取日历列表失败: ${data.msg}`);
        }

        const calendarList = data.data?.calendar_list || [];
        console.log(`=== 成功获取 ${calendarList.length} 个日历 ===`);
        calendarList.forEach((cal, index) => {
            const isPrimary = cal.type === 'primary';
            console.log(`${index + 1}. ${cal.summary} (${cal.calendar_id})${isPrimary ? ' [主日历]' : ''}`);
        });

        return calendarList;
    }

    /**
     * 发起 HTTP 请求（支持自定义 fetch 函数以绕过 CORS）
     * @param url 请求 URL
     * @param options 请求选项
     * @param fetchFn 可选的自定义请求函数（优先级高于 static customFetch）
     */
    private static async fetch(
        url: string,
        options: {
            method?: string;
            body?: string;
            headers?: Record<string, string>;
        } = {},
        fetchFn?: FetchFunction
    ): Promise<HttpResponse> {
        const actualFetch = fetchFn || this.customFetch || this.defaultFetch;
        return actualFetch(url, options);
    }

    /**
     * 默认的 fetch 实现（原生 fetch）
     */
    private static async defaultFetch(
        url: string,
        options: {
            method?: string;
            body?: string;
            headers?: Record<string, string>;
        } = {}
    ): Promise<HttpResponse> {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            body: options.body,
        });

        // 转换 Headers 为普通对象
        const headersObj: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headersObj[key] = value;
        });

        return {
            status: response.status,
            headers: headersObj,
            text: await response.text(),
        };
    }

    /**
     * 解析 HTTP 响应
     */
    private static async parseResponse<T>(response: HttpResponse): Promise<T> {
        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.text || 'Error'}`);
        }
        return JSON.parse(response.text) as T;
    }

    /**
     * 生成随机 state（防 CSRF）
     */
    private static generateState(): string {
        return Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }

    /**
     * 格式化过期时间为可读字符串
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
