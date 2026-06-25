/**
 * Google Calendar 提供商
 *
 * 使用 Google Calendar API 通过 CalDAV 协议同步。
 * 支持 OAuth 2.0 认证。
 *
 * 文档: https://developers.google.com/calendar/api/v3/reference
 */

import { requestUrl } from 'obsidian';
import { CalDAVDataSource, CalDAVDataSourceConfig } from '../CalDAVDataSource';
import { Logger } from '../../../../utils/logger';

/**
 * Google Calendar OAuth 配置
 */
export interface GoogleCalendarOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    accessToken?: string;
    refreshToken?: string;
}

/**
 * Google Calendar 提供商
 */
export class GoogleCalendarProvider extends CalDAVDataSource {
    private oauthConfig: GoogleCalendarOAuthConfig;

    constructor(oauthConfig: GoogleCalendarOAuthConfig) {
        // Google Calendar CalDAV 端点
        const config: CalDAVDataSourceConfig = {
            autoSync: false,
            syncDirection: 'bidirectional',
            conflictResolution: 'newest-win',
            caldav: {
                provider: 'google',
                url: 'https://apidata.googleusercontent.com/caldav/v2/',
                accessToken: oauthConfig.accessToken,
            },
        };

        super('google-calendar', 'Google Calendar', config);
        this.oauthConfig = oauthConfig;
    }

    /**
     * 初始化 OAuth 连接
     */
    async initializeWithOAuth(): Promise<void> {
        if (this.oauthConfig.accessToken) {
            // 使用现有 token
            await this.initialize({
                autoSync: false,
                syncDirection: 'bidirectional',
                conflictResolution: 'newest-win',
                caldav: {
                    provider: 'google',
                    url: 'https://apidata.googleusercontent.com/caldav/v2/',
                    accessToken: this.oauthConfig.accessToken,
                },
            });
            return;
        }

        // 需要进行 OAuth 流程
        throw new Error('Google Calendar OAuth flow requires user interaction. Please provide access token.');
    }

    /**
     * 刷新访问令牌
     */
    async refreshAccessToken(): Promise<boolean> {
        if (!this.oauthConfig.refreshToken) {
            Logger.warn('GoogleCalendarProvider', 'No refresh token available');
            return false;
        }

        try {
            const response = await requestUrl({
                url: 'https://oauth2.googleapis.com/token',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.oauthConfig.clientId,
                    client_secret: this.oauthConfig.clientSecret,
                    refresh_token: this.oauthConfig.refreshToken,
                    grant_type: 'refresh_token',
                }).toString(),
                throw: false,
            });

            if (response.status >= 200 && response.status < 300) {
                const data = response.json as { access_token?: string };
                this.oauthConfig.accessToken = data.access_token;

                // 更新 CalDAV 客户端配置
                this.getClient().setConfig({
                    accessToken: data.access_token,
                });

                Logger.info('GoogleCalendarProvider', 'Access token refreshed');
                return true;
            }

            const error = response.json as unknown;
            Logger.error('GoogleCalendarProvider', 'Failed to refresh token', error);
            return false;
        } catch (error) {
            Logger.error('GoogleCalendarProvider', 'Token refresh error', error);
            return false;
        }
    }

    /**
     * 获取 OAuth 授权 URL
     */
    getAuthorizationUrl(scopes: string[] = DEFAULT_SCOPES): string {
        const params = new URLSearchParams({
            client_id: this.oauthConfig.clientId,
            redirect_uri: this.oauthConfig.redirectUri,
            response_type: 'code',
            scope: scopes.join(' '),
            access_type: 'offline',
            prompt: 'consent',
        });

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    /**
     * 交换授权码获取访问令牌
     */
    async exchangeCodeForToken(code: string): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: 'https://oauth2.googleapis.com/token',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.oauthConfig.clientId,
                    client_secret: this.oauthConfig.clientSecret,
                    code,
                    redirect_uri: this.oauthConfig.redirectUri,
                    grant_type: 'authorization_code',
                }).toString(),
                throw: false,
            });

            if (response.status >= 200 && response.status < 300) {
                const data = response.json as { access_token?: string; refresh_token?: string };
                this.oauthConfig.accessToken = data.access_token;
                this.oauthConfig.refreshToken = data.refresh_token;

                Logger.info('GoogleCalendarProvider', 'OAuth authorization successful');
                return true;
            }

            const error = response.json as unknown;
            Logger.error('GoogleCalendarProvider', 'Authorization code exchange failed', error);
            return false;
        } catch (error) {
            Logger.error('GoogleCalendarProvider', 'Token exchange error', error);
            return false;
        }
    }

    /**
     * 获取可访问的日历列表
     */
    async getCalendarList(): Promise<unknown[]> {
        try {
            // 使用 Google Calendar API 获取日历列表
            const response = await requestUrl({
                url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
                headers: {
                    'Authorization': `Bearer ${this.oauthConfig.accessToken}`,
                },
                throw: false,
            });

            if (response.status >= 200 && response.status < 300) {
                const data = response.json as { items?: unknown[] };
                return data.items || [];
            }

            Logger.error('GoogleCalendarProvider', 'Failed to get calendar list');
            return [];
        } catch (error) {
            Logger.error('GoogleCalendarProvider', 'Calendar list error', error);
            return [];
        }
    }

    /**
     * 选择特定日历进行同步
     */
    async selectCalendar(calendarId: string): Promise<void> {
        // Google Calendar CalDAV URL 格式
        const caldavUrl = `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(calendarId)}/events/`;

        this.getClient().setConfig({
            url: caldavUrl,
            calendarPath: caldavUrl,
        });

        Logger.info('GoogleCalendarProvider', `Selected calendar: ${calendarId}`);

        // 重新拉取事件
        await this.fetchTasks();
    }

    /**
     * 重写 fetchTasks 以处理 token 过期
     */
    protected async fetchTasks(): Promise<void> {
        try {
            await super.fetchTasks();
        } catch (error) {
            // 检查是否为认证错误
            const errMsg = error instanceof Error ? error.message : String(error);
            if (errMsg.includes('401') || errMsg.includes('403')) {
                Logger.info('GoogleCalendarProvider', 'Token expired, attempting refresh');

                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    await super.fetchTasks();
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * 获取当前 OAuth 配置
     */
    getOAuthConfig(): GoogleCalendarOAuthConfig {
        return { ...this.oauthConfig };
    }
}

/**
 * 默认 Google Calendar API scopes
 */
const DEFAULT_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
];
