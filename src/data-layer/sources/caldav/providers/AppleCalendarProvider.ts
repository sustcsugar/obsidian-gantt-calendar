/**
 * Apple Calendar 提供商
 *
 * 使用 iCloud CalDAV 服务同步。
 * 支持基本认证和应用专用密码。
 *
 * 文档: https://developer.apple.com/documentation/calendardatasync
 */

import { CalDAVDataSource, CalDAVDataSourceConfig } from '../CalDAVDataSource';
import { Logger } from '../../../../utils/logger';

/**
 * Apple Calendar 配置
 */
export interface AppleCalendarConfig {
    username: string;      // Apple ID
    password: string;      // 应用专用密码（不是主密码）
}

/**
 * Apple Calendar 提供商
 */
export class AppleCalendarProvider extends CalDAVDataSource {
    private appleConfig: AppleCalendarConfig;

    constructor(appleConfig: AppleCalendarConfig) {
        // iCloud CalDAV 端点
        const config: CalDAVDataSourceConfig = {
            autoSync: false,
            syncDirection: 'bidirectional',
            conflictResolution: 'newest-win',
            caldav: {
                provider: 'apple',
                url: 'https://caldav.icloud.com/',
                username: appleConfig.username,
                password: appleConfig.password,
            },
        };

        super('apple-calendar', 'Apple Calendar', config);
        this.appleConfig = appleConfig;
    }

    /**
     * 初始化连接
     */
    async initializeConnection(): Promise<void> {
        await this.initialize({
            autoSync: false,
            syncDirection: 'bidirectional',
            conflictResolution: 'newest-win',
            caldav: {
                provider: 'apple',
                url: 'https://caldav.icloud.com/',
                username: this.appleConfig.username,
                password: this.appleConfig.password,
            },
        });
    }

    /**
     * 获取可访问的日历列表
     */
    async getCalendarList(): Promise<{ id: string; name: string; color?: string }[]> {
        const client = this.getClient();

        try {
            const response = await client.getCalendars();

            if (response.success && response.data) {
                return response.data.map(cal => ({
                    id: cal.href,
                    name: cal.displayName || 'Unnamed Calendar',
                    color: cal.color,
                }));
            }

            Logger.error('AppleCalendarProvider', 'Failed to get calendar list');
            return [];
        } catch (error) {
            Logger.error('AppleCalendarProvider', 'Calendar list error', error);
            return [];
        }
    }

    /**
     * 选择特定日历进行同步
     */
    async selectCalendar(calendarHref: string): Promise<void> {
        // Apple Calendar URL 格式
        const baseUrl = 'https://caldav.icloud.com/';
        const caldavUrl = `${baseUrl}${calendarHref.startsWith('/') ? calendarHref.slice(1) : calendarHref}`;

        this.getClient().setConfig({
            url: baseUrl,
            calendarPath: caldavUrl,
        });

        Logger.info('AppleCalendarProvider', `Selected calendar: ${calendarHref}`);

        // 重新拉取事件
        await this.fetchTasks();
    }

    /**
     * 测试连接
     */
    async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            const client = this.getClient();
            const isValid = await client.validateConnection();

            if (isValid) {
                return { success: true };
            }

            return {
                success: false,
                error: 'Connection failed. Please verify your Apple ID and app-specific password.',
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 获取配置
     */
    getConfig(): AppleCalendarConfig {
        return { ...this.appleConfig };
    }

    /**
     * 更新配置
     */
    updateConfig(config: Partial<AppleCalendarConfig>): void {
        if (config.username) this.appleConfig.username = config.username;
        if (config.password) this.appleConfig.password = config.password;

        // 更新客户端配置
        this.getClient().setConfig({
            username: this.appleConfig.username,
            password: this.appleConfig.password,
        });
    }
}

/**
 * 生成应用专用密码的帮助信息
 */
export function getAppSpecificPasswordHelp(): string {
    return `
To use Apple Calendar sync, you need an app-specific password:

1. Go to appleid.apple.com
2. Sign in with your Apple ID
3. Go to the "Security" section
4. Click "Generate Password" (under App-Specific Passwords)
5. Enter a label (e.g., "Obsidian Gantt Calendar")
6. Copy the generated password and use it here

Note: You must enable two-factor authentication on your Apple ID
to generate app-specific passwords.
`;
}
