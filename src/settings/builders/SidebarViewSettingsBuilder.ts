import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 侧边栏视图设置构建器
 * 卡片显示控制已整合到 CardDisplaySettingsBuilder，此处保留以备将来侧边栏专属设置
 */
export class SidebarViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 卡片显示控制已移至 CardDisplaySettingsBuilder
	}
}
