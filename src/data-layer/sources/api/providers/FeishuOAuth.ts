/**
 * 飞书 OAuth 辅助类
 *
 * 处理飞书用户认证流程，使用 user_access_token
 * API 文档:
 * - 获取授权码: https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code
 * - 获取用户令牌（传统端点）: https://open.feishu.cn/document/authentication-management/access-token/obtain-user_token
 * - 刷新用户令牌（传统端点）: https://open.feishu.cn/document/authentication-management/access-token/refresh_user_token
 * - 获取用户信息: https://open.feishu.cn/document/authentication-management/management/get-user-info
 *
 * 注意：由于 CORS 限制，需要使用 Obsidian 的 requestUrl 方法进行 HTTP 请求
 */

import { Logger } from '../../../../utils/logger';

// ==================== API 端点常量 ====================

/**
 * 飞书 API 端点
 */
const API_ENDPOINTS = {
    /** 授权端点 */
    AUTH: 'https://accounts.feishu.cn/open-apis/authen/v1/authorize',
    /** 获取令牌端点（v2端点，使用 form-urlencoded 格式） */
    TOKEN: 'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
    /** 刷新令牌端点（v2端点，使用 form-urlencoded 格式） */
    REFRESH: 'https://open.feishu.cn/open-apis/authen/v2/oauth/refresh',
    /** 获取用户信息端点 */
    USER_INFO: 'https://open.feishu.cn/open-apis/authen/v1/user_info',
    /** 获取日历列表端点 */
    CALENDAR_LIST: 'https://open.feishu.cn/open-apis/calendar/v4/calendars',
    /** 获取任务列表端点（已废弃，使用按清单获取任务） */
    TASK_LIST: 'https://open.feishu.cn/open-apis/task/v2/tasks',
    /** 获取任务清单列表端点 */
    TASK_LISTS: 'https://open.feishu.cn/open-apis/task/v2/tasklists',
} as const;

/** 默认重定向 URI */
const DEFAULT_REDIRECT_URI = 'https://open.feishu.cn/api-explorer/loading';

// ==================== Scope 常量 ====================

/**
 * 飞书 OAuth Scope 常量
 */
export const FEISHU_SCOPES = {
    /** 日历只读权限 */
    CALENDAR_READONLY: 'calendar:calendar:readonly',
    /** 任务读取权限 */
    TASK_READ: 'task:task:read',
    /** 任务写入权限 */
    TASK_WRITE: 'task:task:write',
    /** 任务清单读取权限 */
    TASK_LIST_READ: 'task:tasklist:read',
    /** 任务清单写入权限 */
    TASK_LIST_WRITE: 'task:tasklist:write',
} as const;

/** 默认Scope组合（包含日历和任务权限） */
const DEFAULT_SCOPES = [
    FEISHU_SCOPES.CALENDAR_READONLY,
    FEISHU_SCOPES.TASK_READ,
    FEISHU_SCOPES.TASK_WRITE,
    FEISHU_SCOPES.TASK_LIST_READ,
    FEISHU_SCOPES.TASK_LIST_WRITE,
].join(' ');

// ==================== 类型定义 ====================

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
 * 飞书 Token 数据（v1 API）
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
 * 飞书 Token 响应（v1 API）
 */
export interface FeishuTokenResponse {
    code: number;
    msg: string;
    data?: FeishuTokenData;
}

/**
 * 飞书 Token 响应（v2 API，无 data 包裹层）
 */
export interface FeishuTokenResponseV2 {
    code?: number;
    error?: string;
    error_description?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
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

// ==================== 任务清单相关类型 ====================

/**
 * 飞书任务清单成员
 */
export interface FeishuTaskListMember {
    id: string;
    name?: string;
    role: string;
    type: string;
}

/**
 * 飞书任务清单
 */
export interface FeishuTaskList {
    guid: string;
    name: string;
    created_at: string;
    updated_at: string;
    archive_msec: string;
    creator?: { id: string; type: string; };
    owner?: { id: string; role: string; type: string; };
    members?: FeishuTaskListMember[];
    url?: string;
}

/**
 * 飞书任务清单响应
 */
export interface FeishuTaskListResponse {
    code: number;
    msg: string;
    data?: {
        items?: FeishuTaskList[];
        page_token?: string;
        has_more?: boolean;
    };
}

// ==================== 任务相关类型 ====================

/**
 * 飞书任务用户信息
 */
export interface FeishuTaskUser {
    user_id: string;
    name: string;
    avatar_url?: string;
}

/**
 * 飞书任务字段值
 */
export interface FeishuTaskFieldValue {
    id?: string;
    type: string;
    text?: string;
    number?: number;
    select?: { id: string; name: string; };
    user?: FeishuTaskUser[];
    date?: { timestamp?: number; };
}

/**
 * 飞书任务成员（API返回格式）
 */
export interface FeishuTaskMember {
    id: string;
    name?: string;
    role: string;
    type: string;
}

/**
 * 飞书任务（API原始返回格式）
 *
 * 注意：
 * - 时间字段 create_time, update_time, completed_at 可能不返回或返回 "0"
 * - start/due 中的 timestamp 是字符串格式的毫秒时间戳
 */
export interface FeishuTaskRaw {
    guid: string;
    summary: string;
    description?: string;
    completed?: boolean;
    completed_at?: string;  // 字符串格式的毫秒时间戳，或 "0"
    create_time?: string;   // 字符串格式的毫秒时间戳
    update_time?: string;   // 字符串格式的毫秒时间戳
    start?: FeishuTaskTime;
    due?: FeishuTaskTime;
    status?: string;
    priority?: string;
    assignee?: FeishuTaskMember;
    members?: FeishuTaskMember[];
    subtask_count?: number;
    custom_fields?: Record<string, any>;
}

/**
 * 飞书任务时间字段
 */
export interface FeishuTaskTime {
    /** 时间戳（字符串格式的毫秒数，如 "1769040000000"） */
    timestamp?: string;
    /** 是否全天任务 */
    is_all_day?: boolean;
}

/**
 * 飞书任务
 */
export interface FeishuTask {
    /** 任务GUID */
    task_guid: string;
    /** 任务标题/摘要 */
    summary: string;
    /** 任务描述 */
    description?: string;
    /** 是否已完成 */
    completed?: boolean;
    /** 完成时间 */
    completed_at?: string;
    /** 开始时间 */
    start_time?: FeishuTaskTime;
    /** 截止时间 */
    due_time?: FeishuTaskTime;
    /** 创建时间 */
    created_at?: string;
    /** 更新时间 */
    updated_at?: string;
    /** 任务状态 */
    status?: string;
    /** 优先级 */
    priority?: string;
    /** 负责人 */
    assignee?: FeishuTaskUser;
    /** 关注者列表 */
    followers?: FeishuTaskUser[];
    /** 任务所属任务列表 */
    tasklist_guid?: string;
    /** 任务列表名称 */
    tasklist_name?: string;
    /** 自定义字段 */
    custom_fields?: Record<string, FeishuTaskFieldValue>;
    /** 子任务数量 */
    sub_task_count?: number;
    /** 已完成子任务数量 */
    sub_task_completed_count?: number;
}

/**
 * 飞书任务列表响应
 */
export interface FeishuTaskResponse {
    code: number;
    msg: string;
    data?: {
        items?: FeishuTaskRaw[];
        page_token?: string;
        has_more?: boolean;
    };
}

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
 * 构建 Obsidian requestUrl 兼容的请求配置
 * @param url 请求 URL
 * @param method 请求方法
 * @param body 请求体
 * @param headers 请求头
 */
export function buildRequestUrlConfig(
    url: string,
    method: string,
    body?: string,
    headers?: Record<string, string>
): {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    throw: boolean;
} {
    const config: {
        url: string;
        method: string;
        headers?: Record<string, string>;
        body?: string;
        throw: boolean;
    } = {
        url,
        method,
        throw: false,
    };

    // 设置请求头
    if (headers) {
        config.headers = headers;
    }

    // 只有非 GET 请求才传递 body
    if (method !== 'GET' && body) {
        config.body = body;
    }

    return config;
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

        // 打印完整请求信息用于调试
        console.log('=== 飞书 OAuth Token 交换请求 ===');
        console.log('URL:', API_ENDPOINTS.TOKEN);
        console.log('Method: POST');
        console.log('Content-Type: application/x-www-form-urlencoded');
        console.log('Request Body (完整):', requestBodyStr);
        console.log('App ID:', config.clientId);
        console.log('Authorization Code:', code);

        const response = await this.fetch(API_ENDPOINTS.TOKEN, {
            method: 'POST',
            body: requestBodyStr,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }, fetchFn);

        // 打印完整响应信息
        console.log('=== 飞书 OAuth Token 交换响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        // v2 API 响应格式直接包含 access_token，无 data 包裹层
        const data = await this.parseResponse<FeishuTokenResponseV2>(response);

        // 检查错误响应（v2 可能返回 error 字段）
        if (data.error || (data.code !== undefined && data.code !== 0)) {
            const errorMsg = data.error_description || data.error || '未知错误';
            const errorCode = data.code || -1;
            console.error('=== Token 交换失败 ===');
            console.error('错误码:', errorCode);
            console.error('错误信息:', errorMsg);
            Logger.error('FeishuOAuth', 'Token exchange failed', { code: errorCode, msg: errorMsg });
            throw new Error(`飞书 OAuth 错误: ${errorMsg} (错误码: ${errorCode})`);
        }

        if (!data.access_token) {
            console.error('=== Token 交换失败 ===');
            console.error('响应中缺少 access_token');
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

        // 打印完整请求信息用于调试
        console.log('=== 飞书 OAuth Token 刷新请求 ===');
        console.log('URL:', API_ENDPOINTS.REFRESH);
        console.log('Method: POST');
        console.log('Content-Type: application/x-www-form-urlencoded');
        console.log('Request Body (完整):', requestBodyStr);

        const response = await this.fetch(API_ENDPOINTS.REFRESH, {
            method: 'POST',
            body: requestBodyStr,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }, fetchFn);

        // 打印完整响应信息
        console.log('=== 飞书 OAuth Token 刷新响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        // v2 API 响应格式直接包含 access_token，无 data 包裹层
        const data = await this.parseResponse<FeishuTokenResponseV2>(response);

        // 检查错误响应（v2 可能返回 error 字段）
        if (data.error || (data.code !== undefined && data.code !== 0)) {
            const errorMsg = data.error_description || data.error || '未知错误';
            const errorCode = data.code || -1;
            console.error('=== Token 刷新失败 ===');
            console.error('错误码:', errorCode);
            console.error('错误信息:', errorMsg);
            Logger.error('FeishuOAuth', 'Token refresh failed', { code: errorCode, msg: errorMsg });
            throw new Error(`飞书刷新令牌错误: ${errorMsg} (错误码: ${errorCode})`);
        }

        if (!data.access_token) {
            console.error('=== Token 刷新失败 ===');
            console.error('响应中缺少 access_token');
            Logger.error('FeishuOAuth', 'Token refresh response missing access_token');
            throw new Error('飞书刷新令牌错误: 响应中缺少 access_token');
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

        console.log('=== 飞书获取用户信息请求 ===');
        console.log('URL:', API_ENDPOINTS.USER_INFO);
        console.log('Method: GET');

        const response = await this.fetch(API_ENDPOINTS.USER_INFO, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        console.log('=== 飞书获取用户信息响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuUserInfoResponse>(response);

        if (data.code !== 0 || !data.data) {
            console.error('=== 获取用户信息失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
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
        const url = new URL(API_ENDPOINTS.CALENDAR_LIST);
        url.searchParams.append('page_size', '500');

        console.log('=== 飞书获取日历列表请求 ===');
        console.log('URL:', url.toString());

        const response = await this.fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        console.log('=== 飞书获取日历列表响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuCalendarListResponse>(response);

        if (data.code !== 0) {
            console.error('=== 获取日历列表失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
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
     * 获取用户任务列表
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @param pageSize 每页数量，默认100
     * @param pageToken 分页令牌
     * @returns 任务列表
     */
    static async getTaskList(
        accessToken: string,
        fetchFn?: FetchFunction,
        pageSize: number = 100,
        pageToken?: string
    ): Promise<{ tasks: FeishuTask[]; hasMore: boolean; nextPageToken?: string }> {
        Logger.info('FeishuOAuth', 'Fetching task list');

        // 构建 URL 参数
        const url = new URL(API_ENDPOINTS.TASK_LIST);
        url.searchParams.append('page_size', pageSize.toString());
        if (pageToken) {
            url.searchParams.append('page_token', pageToken);
        }

        console.log('=== 飞书获取任务列表请求 ===');
        console.log('URL:', url.toString());

        const response = await this.fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        console.log('=== 飞书获取任务列表响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuTaskResponse>(response);

        if (data.code !== 0) {
            console.error('=== 获取任务列表失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            Logger.error('FeishuOAuth', 'Get task list failed', { code: data.code, msg: data.msg });
            throw new Error(`获取任务列表失败: ${data.msg}`);
        }

        const rawTasks = data.data?.items || [];
        const hasMore = data.data?.has_more || false;
        const nextPageToken = data.data?.page_token;

        // 映射字段：FeishuTaskRaw -> FeishuTask
        // 注意：API 返回的时间戳是毫秒数字，需要转换为字符串
        const tasks: FeishuTask[] = rawTasks.map(task => ({
            task_guid: task.guid,
            summary: task.summary,
            description: task.description,
            completed: task.completed,
            completed_at: task.completed_at ? String(task.completed_at) : undefined,
            created_at: task.create_time ? String(task.create_time) : undefined,
            updated_at: task.update_time ? String(task.update_time) : undefined,
            start_time: task.start,
            due_time: task.due,
            status: task.status,
            priority: task.priority,
            assignee: task.assignee ? { user_id: task.assignee.id, name: task.assignee.name || '' } : undefined,
            followers: task.members?.filter(m => m.role === 'follower').map(m => ({ user_id: m.id, name: m.name || '' })),
            sub_task_count: task.subtask_count,
            sub_task_completed_count: 0,
        }));

        console.log(`=== 成功获取 ${tasks.length} 个任务 ===`);
        tasks.forEach((task, index) => {
            const status = task.completed ? '[已完成]' : '[未完成]';
            console.log(`${index + 1}. ${task.summary} ${status}`);
        });

        return {
            tasks,
            hasMore,
            nextPageToken,
        };
    }

    /**
     * 获取用户任务清单列表
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @param pageSize 每页数量，默认50
     * @param pageToken 分页令牌
     * @returns 任务清单列表
     */
    static async getTaskLists(
        accessToken: string,
        fetchFn?: FetchFunction,
        pageSize: number = 50,
        pageToken?: string
    ): Promise<{ taskLists: FeishuTaskList[]; hasMore: boolean; nextPageToken?: string }> {
        Logger.info('FeishuOAuth', 'Fetching task lists');

        // 构建 URL 参数
        const url = new URL(API_ENDPOINTS.TASK_LISTS);
        url.searchParams.append('page_size', pageSize.toString());
        url.searchParams.append('user_id_type', 'open_id');
        if (pageToken) {
            url.searchParams.append('page_token', pageToken);
        }

        console.log('=== 飞书获取任务清单请求 ===');
        console.log('URL:', url.toString());

        const response = await this.fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        console.log('=== 飞书获取任务清单响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuTaskListResponse>(response);

        if (data.code !== 0) {
            console.error('=== 获取任务清单失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            Logger.error('FeishuOAuth', 'Get task lists failed', { code: data.code, msg: data.msg });
            throw new Error(`获取任务清单失败: ${data.msg}`);
        }

        const taskLists = data.data?.items || [];
        const hasMore = data.data?.has_more || false;
        const nextPageToken = data.data?.page_token;

        console.log(`=== 成功获取 ${taskLists.length} 个任务清单 ===`);
        taskLists.forEach((list, index) => {
            console.log(`${index + 1}. ${list.name} (${list.guid})`);
        });

        return {
            taskLists,
            hasMore,
            nextPageToken,
        };
    }

    /**
     * 获取所有任务清单（自动分页）
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 所有任务清单列表
     */
    static async getAllTaskLists(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTaskList[]> {
        const allTaskLists: FeishuTaskList[] = [];
        let pageToken: string | undefined = undefined;
        let pageCount = 0;
        const maxPages = 10; // 最多获取10页，防止无限循环

        while (pageCount < maxPages) {
            const result: Awaited<ReturnType<typeof FeishuOAuth.getTaskLists>> = await this.getTaskLists(accessToken, fetchFn, 50, pageToken);
            allTaskLists.push(...result.taskLists);

            if (!result.hasMore || !result.nextPageToken) {
                break;
            }

            pageToken = result.nextPageToken;
            pageCount++;
        }

        console.log(`=== 共获取 ${allTaskLists.length} 个任务清单 ===`);
        return allTaskLists;
    }

    /**
     * 获取指定任务清单中的任务
     * @param accessToken 访问令牌
     * @param tasklistGuid 任务清单GUID
     * @param tasklistName 任务清单名称
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 任务列表
     */
    static async getTasksByTaskList(
        accessToken: string,
        tasklistGuid: string,
        tasklistName: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTask[]> {
        Logger.info('FeishuOAuth', `Fetching tasks for task list: ${tasklistName}`);

        // 构建请求 URL
        const url = `${API_ENDPOINTS.TASK_LISTS}/${tasklistGuid}/tasks`;

        console.log('=== 飞书获取清单任务请求 ===');
        console.log('Task List:', tasklistName);
        console.log('URL:', url);

        const response = await this.fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        console.log('=== 飞书获取清单任务响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuTaskResponse>(response);

        if (data.code !== 0) {
            console.error('=== 获取清单任务失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            Logger.error('FeishuOAuth', 'Get tasks by task list failed', { code: data.code, msg: data.msg });
            throw new Error(`获取清单任务失败: ${data.msg}`);
        }

        const tasks = data.data?.items || [];

        // 调试：打印第一个任务的原始数据
        if (tasks.length > 0) {
            console.log('=== 第一个任务的原始数据 ===');
            console.log(JSON.stringify(tasks[0], null, 2));
            console.log('==============================');
        }

        // 将 API 返回的原始任务数据转换为我们需要的格式
        // 注意：API 返回的时间戳是毫秒数字，需要转换为字符串
        const tasksWithListInfo: FeishuTask[] = tasks.map(task => ({
            task_guid: task.guid,
            summary: task.summary,
            description: task.description,
            completed: task.completed,
            completed_at: task.completed_at ? String(task.completed_at) : undefined,
            created_at: task.create_time ? String(task.create_time) : undefined,
            updated_at: task.update_time ? String(task.update_time) : undefined,
            start_time: task.start,
            due_time: task.due,
            status: task.status,
            priority: task.priority,
            assignee: task.assignee ? { user_id: task.assignee.id, name: task.assignee.name || '' } : undefined,
            followers: task.members?.filter(m => m.role === 'follower').map(m => ({ user_id: m.id, name: m.name || '' })),
            tasklist_guid: tasklistGuid,
            tasklist_name: tasklistName,
            sub_task_count: task.subtask_count,
            sub_task_completed_count: 0,
        }));

        console.log(`=== 成功获取清单 "${tasklistName}" 中的 ${tasks.length} 个任务 ===`);

        return tasksWithListInfo;
    }

    /**
     * 获取所有任务（通过任务清单获取）
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 所有任务列表
     */
    static async getAllTasks(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTask[]> {
        console.log('=== 开始获取所有任务（通过任务清单） ===');

        // 1. 获取所有任务清单
        const taskLists = await this.getAllTaskLists(accessToken, fetchFn);

        if (taskLists.length === 0) {
            console.log('=== 未找到任何任务清单 ===');
            return [];
        }

        // 2. 获取每个任务清单中的任务
        const allTasks: FeishuTask[] = [];
        for (const taskList of taskLists) {
            const tasks = await this.getTasksByTaskList(
                accessToken,
                taskList.guid,
                taskList.name,
                fetchFn
            );
            allTasks.push(...tasks);
        }

        console.log(`=== 共获取 ${allTasks.length} 个任务（来自 ${taskLists.length} 个任务清单） ===`);
        return allTasks;
    }

    /**
     * 创建 Obsidian requestUrl 兼容的 fetch 函数
     *
     * 用于在 Obsidian 插件环境中绕过 CORS 限制。
     *
     * @param requestUrl Obsidian 的 requestUrl 函数
     * @returns FetchFunction 兼容的请求函数
     */
    static createRequestFetch(requestUrl: typeof import('obsidian').requestUrl): FetchFunction {
        return async (url: string, options?: {
            method?: string;
            body?: string;
            headers?: Record<string, string>;
        }) => {
            const method = options?.method || 'GET';

            // 使用辅助函数构建请求配置
            const config = buildRequestUrlConfig(
                url,
                method,
                options?.body,
                options?.headers
            );

            const result = await requestUrl(config);

            // 检查状态码，如果是 4xx/5xx，记录错误信息
            if (result.status >= 400) {
                console.error('=== requestUrl HTTP 错误 ===');
                console.error('Status:', result.status);
                console.error('Headers:', result.headers);
                console.error('Body:', result.text);
                console.error('========================');
            }

            return {
                status: result.status,
                headers: result.headers || {},
                text: result.text || '',
            };
        };
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

    // ==================== 私有方法 ====================

    /**
     * 发起 HTTP 请求
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
        const actualFetch = fetchFn || this.defaultFetch;
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
}
