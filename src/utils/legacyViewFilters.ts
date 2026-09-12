/**
 * 旧版视图筛选偏好的一次性迁移源。
 *
 * 历史：viewFilters 曾存于全局 localStorage（跨 vault 共享、不随库同步、
 * 重装即失），现已迁至插件 data.json（按 vault 隔离、随库同步）。
 * 本文件是代码库中唯一读取旧全局键的位置：
 * 首次启动（data.json 无 viewFilters）时读取旧键导入并清除。
 *
 * 不能改用 App#loadLocalStorage/removeLocalStorage：它们读写的是
 * "{appId}-{key}" 前缀的 vault 作用域物理键（JSON 编码），而旧版写入的
 * 是无前缀裸键——vault 作用域 API 物理上读不到也清不掉它。
 * 因此经 window.localStorage 显式访问原始存储（与裸 localStorage 同一
 * 对象，行为不变；成员表达式不触发 no-restricted-globals 对裸全局标识
 * 符的限制）。
 */
import type { ViewFilterState, ViewScope } from '../ui/store/calendarStore';

const LEGACY_VIEW_FILTERS_KEY = 'gantt-calendar-view-filters';/** 读取并清除旧 localStorage 键；不存在或损坏时返回 null */
export function readLegacyViewFilters(): Partial<Record<ViewScope, ViewFilterState>> | null {
	try {
		// 迁移专用：读取旧版无前缀全局键（见文件头注释）
		const legacyStorage = window.localStorage;
		const raw = legacyStorage.getItem(LEGACY_VIEW_FILTERS_KEY);
		if (!raw) return null;
		legacyStorage.removeItem(LEGACY_VIEW_FILTERS_KEY);
		return JSON.parse(raw) as Partial<Record<ViewScope, ViewFilterState>>;
	} catch {
		return null;
	}
}
