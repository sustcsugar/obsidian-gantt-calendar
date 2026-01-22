/**
 * 飞书 HTTP 客户端
 *
 * 封装 HTTP 请求逻辑，支持原生 fetch 和 Obsidian requestUrl
 */

import type { FetchFunction, HttpResponse } from './FeishuTypes';
import { Logger } from '../../../../../utils/logger';

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
 * 飞书 HTTP 客户端
 */
export class FeishuHttpClient {
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
                Logger.error('FeishuHttpClient', 'HTTP error', {
                    status: result.status,
                    headers: result.headers,
                    body: result.text,
                });
            }

            return {
                status: result.status,
                headers: result.headers || {},
                text: result.text || '',
            };
        };
    }

    /**
     * 发起 HTTP 请求
     * @param url 请求 URL
     * @param options 请求选项
     * @param fetchFn 可选的自定义 fetch 函数
     * @returns HTTP 响应
     */
    static async fetch(
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
     * 解析 HTTP 响应
     * @param response HTTP 响应
     * @returns 解析后的数据
     */
    static async parseResponse<T>(response: HttpResponse): Promise<T> {
        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.text || 'Error'}`);
        }
        return JSON.parse(response.text) as T;
    }

    /**
     * 默认的 fetch 实现（原生 fetch）
     * @param url 请求 URL
     * @param options 请求选项
     * @returns HTTP 响应
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
}
