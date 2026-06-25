/**
 * Outlook Calendar 提供商
 *
 * 使用 Microsoft Graph API 通过 CalDAV 协议同步。
 * 支持 OAuth 2.0 认证。
 *
 * 文档: https://docs.microsoft.com/graph/api/resources/calendar
 */

import { requestUrl } from 'obsidian';
import { CalDAVDataSource, CalDAVDataSourceConfig } from '../CalDAVDataSource';
import { Logger } from '../../../../utils/logger';

/**
 * Outlook Calendar OAuth 配置
 */
export interface OutlookOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    accessToken?: string;
    refreshToken?: string;
}

/**
 * Outlook Calendar 提供商
 */
export class OutlookProvider extends CalDAVDataSource {
    private oauthConfig: OutlookOAuthConfig;
    private tenantId?: string;

    constructor(oauthConfig: OutlookOAuthConfig, tenantId?: string) {
        // Outlook CalDAV 端点
        const config: CalDAVDataSourceConfig = {
            autoSync: false,
            syncDirection: 'bidirectional',
            conflictResolution: 'newest-win',
            caldav: {
                provider: 'outlook',
                url: 'https://outlook.office.com/caldav/',
                accessToken: oauthConfig.accessToken,
            },
        };

        super('outlook-calendar', 'Outlook Calendar', config);
        this.oauthConfig = oauthConfig;
        this.tenantId = tenantId || 'common';
    }

    /**
     * 初始化 OAuth 连接
     */
    async initializeWithOAuth(): Promise<void> {
        if (this.oauthConfig.accessToken) {
            await this.initialize({
                autoSync: false,
                syncDirection: 'bidirectional',
                conflictResolution: 'newest-win',
                caldav: {
                    provider: 'outlook',
                    url: 'https://outlook.office.com/caldav/',
                    accessToken: this.oauthConfig.accessToken,
                },
            });
            return;
        }

        throw new Error('Outlook Calendar OAuth flow requires user interaction. Please provide access token.');
    }

    /**
     * 刷新访问令牌
     */
    async refreshAccessToken(): Promise<boolean> {
        if (!this.oauthConfig.refreshToken) {
            Logger.warn('OutlookProvider', 'No refresh token available');
            return false;
        }

        try {
            const response = await requestUrl({
                url: `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
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

                Logger.info('OutlookProvider', 'Access token refreshed');
                return true;
            }

            const error = response.json as unknown;
            Logger.error('OutlookProvider', 'Failed to refresh token', error);
            return false;
        } catch (error) {
            Logger.error('OutlookProvider', 'Token refresh error', error);
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
            response_mode: 'query',
            prompt: 'consent',
        });

        return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    }

    /**
     * 交换授权码获取访问令牌
     */
    async exchangeCodeForToken(code: string): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
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

                Logger.info('OutlookProvider', 'OAuth authorization successful');
                return true;
            }

            const error = response.json as unknown;
            Logger.error('OutlookProvider', 'Authorization code exchange failed', error);
            return false;
        } catch (error) {
            Logger.error('OutlookProvider', 'Token exchange error', error);
            return false;
        }
    }

    /**
     * 获取可访问的日历列表
     */
    async getCalendarList(): Promise<unknown[]> {
        try {
            const response = await requestUrl({
                url: 'https://graph.microsoft.com/v1.0/me/calendars',
                headers: {
                    'Authorization': `Bearer ${this.oauthConfig.accessToken}`,
                    'Content-Type': 'application/json',
                },
                throw: false,
            });

            if (response.status >= 200 && response.status < 300) {
                const data = response.json as { value?: unknown[] };
                return data.value || [];
            }

            Logger.error('OutlookProvider', 'Failed to get calendar list');
            return [];
        } catch (error) {
            Logger.error('OutlookProvider', 'Calendar list error', error);
            return [];
        }
    }

    /**
     * 选择特定日历进行同步
     */
    async selectCalendar(calendarId: string): Promise<void> {
        // Outlook CalDAV URL 格式
        const caldavUrl = `https://outlook.office.com/caldav/${encodeURIComponent(calendarId)}/`;

        this.getClient().setConfig({
            url: caldavUrl,
            calendarPath: caldavUrl,
        });

        Logger.info('OutlookProvider', `Selected calendar: ${calendarId}`);

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
            const errMsg = error instanceof Error ? error.message : String(error);
            if (errMsg.includes('401') || errMsg.includes('403')) {
                Logger.info('OutlookProvider', 'Token expired, attempting refresh');

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
    getOAuthConfig(): OutlookOAuthConfig {
        return { ...this.oauthConfig };
    }
}

/**
 * 默认 Outlook Graph API scopes
 */
const DEFAULT_SCOPES = [
    'Calendars.ReadWrite',
    'User.Read',
];
