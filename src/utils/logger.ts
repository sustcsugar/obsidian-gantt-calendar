/**
 * 统一日志工具类
 * 根据插件设置的开发者模式控制日志输出
 *
 * 使用方式：
 * - Logger.error(tag, ...args)  - 错误日志，始终输出
 * - Logger.warn(tag, ...args)   - 警告日志，始终输出
 * - Logger.stats(tag, ...args)  - 统计信息，始终输出
 * - Logger.debug(tag, ...args)  - 调试日志，仅开发者模式输出
 */
export class Logger {
	private static plugin: any = null;
	private static LOG_PREFIX = '[GanttCalendar]';

	/**
	 * 初始化 Logger（由插件 main.ts 调用）
	 */
	static init(plugin: any): void {
		this.plugin = plugin;
	}

	/**
	 * 检查是否启用调试日志
	 */
	private static isDebugMode(): boolean {
		return this.plugin?.settings?.enableDebugMode === true;
	}

	/**
	 * 错误日志（始终输出）
	 */
	static error(tag: string, ...args: any[]): void {
		console.error(`${this.LOG_PREFIX}[${tag}]`, ...args);
	}

	/**
	 * 警告日志（始终输出）
	 */
	static warn(tag: string, ...args: any[]): void {
		console.warn(`${this.LOG_PREFIX}[${tag}]`, ...args);
	}

	/**
	 * 统计信息（始终输出，格式简化）
	 * 用于显示文件数量、任务数量、性能统计等
	 */
	static stats(tag: string, ...args: any[]): void {
		console.log(`${this.LOG_PREFIX}[${tag}]`, ...args);
	}

	/**
	 * 调试日志（仅开发者模式）
	 */
	static debug(tag: string, ...args: any[]): void {
		if (this.isDebugMode()) {
			console.log(`${this.LOG_PREFIX}[${tag}]`, ...args);
		}
	}

	/**
	 * 信息日志（仅开发者模式）
	 * 与 debug 相同，但语义上用于更重要的信息
	 */
	static info(tag: string, ...args: any[]): void {
		if (this.isDebugMode()) {
			console.log(`${this.LOG_PREFIX}[${tag}]`, ...args);
		}
	}
}
