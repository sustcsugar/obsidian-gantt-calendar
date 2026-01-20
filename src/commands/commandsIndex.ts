/**
 * @fileoverview 命令注册统一入口
 * @module commands/commandsIndex
 */

import type GanttCalendarPlugin from '../../main';
import { registerCommonCommands } from './common';
import { registerEditorCommands } from './editor';
import { registerConditionalCommands } from './conditional';
import { registerFeishuCommands } from './feishuCommands';

/**
 * 注册所有命令
 * @param plugin 插件实例
 */
export function registerAllCommands(plugin: GanttCalendarPlugin): void {
	registerCommonCommands(plugin);
	registerEditorCommands(plugin);
	registerConditionalCommands(plugin);
	registerFeishuCommands(plugin);
}
