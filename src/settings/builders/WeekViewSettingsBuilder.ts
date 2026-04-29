import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 周视图设置构建器
 * 卡片显示控制已整合到 CardDisplaySettingsBuilder，此处保留以备将来周视图专属设置
 */
export class WeekViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 卡片显示控制已移至 CardDisplaySettingsBuilder
	}
}
