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

		this.app.workspace.revealLeaf(leaf);

		// 同时打开侧边栏视图
		await activateSidebarView(this.app);
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
		app.workspace.revealLeaf(leaf);
	}
}
