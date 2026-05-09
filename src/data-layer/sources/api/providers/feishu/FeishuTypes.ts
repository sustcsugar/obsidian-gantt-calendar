/**
 * 飞书 API 类型定义
 *
 * 包含所有飞书相关的接口和类型定义
 */

// ==================== 基础类型 ====================

/**
 * HTTP 响应
 */
export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    text: string;
}

/**
 * 请求函数类型
 */
export type FetchFunction = (
    url: string,
    options?: {
        method?: string;
        body?: string;
        headers?: Record<string, string>;
    }
) => Promise<HttpResponse>;

// ==================== OAuth 相关类型 ====================

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

// ==================== Scope 常量类型 ====================

/**
 * 飞书 OAuth Scope 常量
 */
export const FEISHU_SCOPES = {
    /** 离线访问（启用 refresh_token 发放） */
    OFFLINE_ACCESS: 'offline_access',
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

// ==================== 用户相关类型 ====================

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
    openId: string;
    name: string;
    enName: string;
    email: string;
    avatar: string;
}

// ==================== 日历相关类型 ====================

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
 * 飞书任务时间字段
 */
export interface FeishuTaskTime {
    /** 时间戳（字符串格式的毫秒数，如 "1769040000000"） */
    timestamp?: string;
    /** 是否全天任务 */
    is_all_day?: boolean;
}

/**
 * 飞书任务（API原始返回格式）
 *
 * 注意：
 * - 时间字段 created_at, updated_at, completed_at 可能不返回或返回 "0"
 * - start/due 中的 timestamp 是字符串格式的毫秒时间戳
 */
export interface FeishuTaskRaw {
    guid: string;
    summary: string;
    description?: string;
    completed?: boolean;
    completed_at?: string;  // 字符串格式的毫秒时间戳，或 "0"
    created_at?: string;    // 字符串格式的毫秒时间戳
    updated_at?: string;    // 字符串格式的毫秒时间戳
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

/**
 * 飞书任务创建/更新响应（v2 API）
 *
 * v2 创建和更新接口返回单个 task 对象，而非 items 列表。
 * POST /open-apis/task/v2/tasks → { data: { task: { guid, ... } } }
 * PATCH /open-apis/task/v2/tasks/{guid} → { data: { task: { guid, ... } } }
 */
export interface FeishuTaskCreateResponse {
    code: number;
    msg: string;
    data?: {
        task?: FeishuTaskRaw;
    };
}
