/**
 * Daily Note Settings Bridge
 *
 * 统一桥接层：在插件手动设置和 Obsidian 生态系统（核心日记插件 / Periodic Notes）之间提供一致的接口。
 * - 格式转换：Moment.js (YYYY-MM-DD) ↔ 插件自定义 (yyyy-MM-dd)
 * - 统一配置解析
 * - 日记索引缓存（懒加载 + vault 事件自动失效）
 * - 按日期查找/创建日记
 */

import { App, EventRef, TFile } from 'obsidian';
import type { GanttCalendarSettings } from '../settings/types';
import { formatDate } from '../dateUtils/dateUtilsIndex';
import { Logger } from './logger';
import { findDailyNoteRecursive } from './dailyNoteHelper';

import {
	getDailyNoteSettings,
	getAllDailyNotes,
	getDailyNote,
	appHasDailyNotesPluginLoaded,
} from 'obsidian-daily-notes-interface';

// ========== 格式转换 ==========

/** Moment.js 格式 → 插件自定义格式 (MM 两边一致，无需转换) */
function momentToPluginFormat(momentFormat: string): string {
	return momentFormat
		.replace(/YYYY/g, 'yyyy')
		.replace(/DD/g, 'dd');
}

/** 插件自定义格式 → Moment.js 格式 */
function pluginToMomentFormat(pluginFormat: string): string {
	return pluginFormat
		.replace(/yyyy/g, 'YYYY')
		.replace(/dd/g, 'DD');
}

// ========== 解析配置 ==========

export interface ResolvedDailyNoteSettings {
	folder: string;
	format: string;       // 插件自定义格式 (yyyy-MM-dd)
	momentFormat: string;  // Moment.js 格式 (YYYY-MM-DD)
	template: string;
}

export function getResolvedDailyNoteSettings(
	_settings: GanttCalendarSettings
): ResolvedDailyNoteSettings {
	if (_settings.followObsidianDailyNote) {
		const obsidianSettings = getDailyNoteSettings();
		return {
			folder: obsidianSettings.folder || '',
			format: momentToPluginFormat(obsidianSettings.format || 'YYYY-MM-DD'),
			momentFormat: obsidianSettings.format || 'YYYY-MM-DD',
			template: obsidianSettings.template || '',
		};
	}
	return {
		folder: _settings.dailyNotePath || 'DailyNotes',
		format: _settings.dailyNoteNameFormat || 'yyyy-MM-dd',
		momentFormat: pluginToMomentFormat(_settings.dailyNoteNameFormat || 'yyyy-MM-dd'),
		template: _settings.dailyNoteTemplatePath || '',
	};
}

/** 获取核心/Periodic Notes 插件的原始设置（供设置 UI 展示用） */
export function getObsidianDailyNoteSettings() {
	return getDailyNoteSettings();
}

/** 检查核心日记或 Periodic Notes 插件是否可用 */
export function isObsidianDailyNoteAvailable(): boolean {
	return appHasDailyNotesPluginLoaded();
}

// ========== 日记索引缓存 ==========

/**
 * 日记索引缓存
 * 包装 obsidian-daily-notes-interface 的 getAllDailyNotes()
 * 监听 vault 事件自动失效，懒加载
 */
export class DailyNoteIndex {
	private app: App;
	private cache: Record<string, TFile> | null = null;
	private eventRefs: EventRef[] = [];

	constructor(app: App) {
		this.app = app;
	}

	initialize(): void {
		this.eventRefs.push(
			this.app.vault.on('create', () => this.invalidate()),
			this.app.vault.on('delete', () => this.invalidate()),
			this.app.vault.on('rename', () => this.invalidate()),
		);
	}

	destroy(): void {
		this.eventRefs.forEach(ref => this.app.vault.offref(ref));
		this.eventRefs = [];
		this.cache = null;
	}

	/** 获取日记索引，懒加载 */
	getIndex(): Record<string, TFile> {
		if (!this.cache) {
			try {
				this.cache = getAllDailyNotes();
			} catch (err) {
				// 文件夹不存在等情况
				Logger.debug('DailyNoteIndex', 'Failed to build index:', err);
				this.cache = {};
			}
		}
			return this.cache;
	}

	invalidate(): void {
		this.cache = null;
	}
}

// ========== 查找日记 ==========

/**
 * 按日期查找日记文件
 *
 * Obsidian 模式：通过 obsidian-daily-notes-interface 索引查找（支持嵌套文件夹格式）
 * 手动模式：通过递归搜索（已修复嵌套格式 bug）
 */
export function findDailyNoteForDate(
	date: Date,
	index: DailyNoteIndex,
	app: App,
	settings: GanttCalendarSettings
): TFile | null {
	if (settings.followObsidianDailyNote) {
		const dailyNotes = index.getIndex();
		const momentDate = window.moment(date);
			return getDailyNote(momentDate, dailyNotes);
	}

	// 手动模式：提取纯文件名（修复嵌套文件夹格式 bug）
	const resolved = getResolvedDailyNoteSettings(settings);
	const fullFormatResult = formatDate(date, resolved.format);
	const fileName = fullFormatResult.split('/').pop()! + '.md';
	const result = findDailyNoteRecursive(app, resolved.folder, fileName);
	return result?.file ?? null;
}
