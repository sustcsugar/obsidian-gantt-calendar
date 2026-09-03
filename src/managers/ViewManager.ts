/**
 * 视图管理器
 *
 * 负责视图激活和刷新
 */

import type { App } from 'obsidian';
import { GC_VIEW_ID, GCMainView } from '../GCMainView';
import { GC_SIDEBAR_VIEW_ID, GCSidebarView } from '../GCSidebarView';

/**
 * 视图管理器
 */
export class ViewManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 激活日历视图
	 */
	async activateView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
		if (!leaf) {
			// Create new leaf in main area
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({
				type: GC_VIEW_ID,
				active: true,
			});
		}

		void this.app.workspace.revealLeaf(leaf);

		// 侧边栏仅在叶子尚不存在时顺带创建；已存在（哪怕当前被其他标签如
		// 文件目录遮挡）不再激活，避免 ribbon 点击把用户切换走的侧边栏抢回来。
		// 显式打开侧边栏请用 activateSidebarView（命令面板"打开侧边栏视图"）。
		const sidebarLeaf = this.app.workspace.getLeavesOfType(GC_SIDEBAR_VIEW_ID)[0];
		if (!sidebarLeaf) {
			await activateSidebarView(this.app);
		}
	}

	/**
	 * 刷新所有视图
	 */
	refreshAllViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(GC_VIEW_ID);
		leaves.forEach(leaf => {
			const view = leaf.view as unknown as GCMainView;
			if (view && view.refreshSettings) {
				view.refreshSettings();
			}
		});

		// 同时刷新侧边栏视图
		const sidebarLeaves = this.app.workspace.getLeavesOfType(GC_SIDEBAR_VIEW_ID);
		sidebarLeaves.forEach(leaf => {
			const view = leaf.view as unknown as GCSidebarView;
			if (view && view.refreshSettings) {
				view.refreshSettings();
			}
		});
	}

	/**
	 * 激活侧边栏视图
	 */
	async activateSidebarView(): Promise<void> {
		await activateSidebarView(this.app);
	}
}

/**
 * 激活侧边栏视图（独立函数，供命令调用）
 */
export async function activateSidebarView(app: App): Promise<void> {
	let leaf = app.workspace.getLeavesOfType(GC_SIDEBAR_VIEW_ID)[0];
	if (!leaf) {
		// 创建右侧侧边栏叶子
		const rightLeaf = app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			leaf = rightLeaf;
			await leaf.setViewState({
				type: GC_SIDEBAR_VIEW_ID,
				active: true,
			});
		}
	}

	if (leaf) {
		void app.workspace.revealLeaf(leaf);
	}
}
