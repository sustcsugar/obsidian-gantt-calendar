/**
 * 旧版视图筛选偏好的一次性迁移源。
 *
 * 历史：viewFilters 曾存于全局 localStorage（跨 vault 共享、不随库同步、
 * 重装即失），现已迁至插件 data.json（按 vault 隔离、随库同步）。
 * 本文件是代码库中唯一允许触碰全局 localStorage 的位置：
 * 首次启动（data.json 无 viewFilters）时读取旧键导入并清除。
 *
 * 注：`no-restricted-globals` 为官方受保护规则禁止行内 disable，
 * 该豁免在 eslint.config.mjs 按文件配置层关闭。
 */
import type { ViewFilterState, ViewScope } from '../ui/store/calendarStore';

const LEGACY_VIEW_FILTERS_KEY = 'gantt-calendar-view-filters';/** 读取并清除旧 localStorage 键；不存在或损坏时返回 null */
export function readLegacyViewFilters(): Partial<Record<ViewScope, ViewFilterState>> | null {
	try {
		const raw = localStorage.getItem(LEGACY_VIEW_FILTERS_KEY);
		if (!raw) return null;
		localStorage.removeItem(LEGACY_VIEW_FILTERS_KEY);
		return JSON.parse(raw) as Partial<Record<ViewScope, ViewFilterState>>;
	} catch {
		return null;
	}
}
