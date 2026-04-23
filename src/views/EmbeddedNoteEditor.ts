import { App, WorkspaceLeaf, TFile, MarkdownRenderer, Component } from 'obsidian';
import { findDailyNoteForDate, DailyNoteIndex } from '../utils/dailyNoteSettingsBridge';
import type { GanttCalendarSettings } from '../settings/types';
import { Logger } from '../utils/logger';
import { EmbeddedEditorClasses, DayViewClasses } from '../utils/bem';

/**
 * WorkspaceLeaf 内部接口
 *
 * Obsidian 的类型定义未暴露 containerEl，但运行时实际存在。
 * 通过此接口安全访问内部属性。
 */
interface InternalWorkspaceLeaf extends WorkspaceLeaf {
    containerEl: HTMLElement;
}

/**
 * 嵌入式笔记编辑器
 *
 * 通过创建 detached WorkspaceLeaf 并将其 DOM 挂载到自定义容器中，
 * 实现完整的 Obsidian 编辑体验（Live Preview / Source 模式）。
 *
 * 核心原理：
 * 1. new WorkspaceLeaf(workspace) 创建一个不挂在 workspace 布局树中的 leaf
 * 2. 将 leaf.containerEl 挂载到 DayView 的笔记区域 div
 * 3. leaf.openFile(file) 加载完整的 MarkdownView 编辑器
 * 4. 清理时调用 leaf.detach() 从 workspace 注销
 */
export class EmbeddedNoteEditor {
    private app: App;
    private container: HTMLElement;
    private leaf: InternalWorkspaceLeaf | null = null;
    private currentFilePath: string | null = null;
    private fallbackComponent: Component | null = null;

    constructor(app: App, container: HTMLElement) {
        this.app = app;
        this.container = container;
    }

    /**
     * 为指定日期打开 daily note 编辑器
     */
    async openDate(
        date: Date,
        dailyNoteIndex: DailyNoteIndex,
        settings: GanttCalendarSettings,
        parentComponent: Component
    ): Promise<void> {
        const file = findDailyNoteForDate(date, dailyNoteIndex, this.app, settings);

        if (!file) {
            this.showEmpty('未找到 Daily Note');
            return;
        }

        await this.openFile(file, parentComponent);
    }

    /**
     * 打开指定文件的编辑器
     */
    async openFile(file: TFile, parentComponent: Component): Promise<void> {
        // 同一文件，无需重新加载
        if (this.currentFilePath === file.path && this.leaf) {
            return;
        }

        // 关闭旧的编辑器
        await this.close();

        this.currentFilePath = file.path;

        try {
            // 显示加载状态
            this.container.empty();
            this.container.createEl('div', { text: '加载编辑器...', cls: 'gantt-task-empty' });

            // 创建 detached leaf（不挂在 workspace 布局树中）
            this.leaf = new (WorkspaceLeaf as any)(this.app.workspace) as InternalWorkspaceLeaf;

            // 将 leaf 的 DOM 挂载到我们的容器中
            this.container.empty();
            this.container.appendChild(this.leaf.containerEl);

            // 在 leaf 中打开文件（触发 MarkdownView 创建）
            await this.leaf.openFile(file);

            // 应用嵌入样式
            this.applyEmbeddedStyles();

            Logger.debug('EmbeddedNoteEditor', `Opened file: ${file.path}`);
        } catch (error) {
            Logger.error('EmbeddedNoteEditor', 'Failed to create embedded editor, falling back to preview', error);

            // 降级到只读预览模式
            this.leaf = null;
            await this.fallbackToPreview(file, parentComponent);
        }
    }

    /**
     * 关闭并清理编辑器
     */
    async close(): Promise<void> {
        // 清理 fallback component
        if (this.fallbackComponent) {
            this.fallbackComponent.unload();
            this.fallbackComponent = null;
        }

        // 清理 embedded leaf
        if (this.leaf) {
            try {
                if (this.leaf.containerEl.parentNode) {
                    this.leaf.containerEl.parentNode.removeChild(this.leaf.containerEl);
                }
                this.leaf.detach();
            } catch (e) {
                Logger.error('EmbeddedNoteEditor', 'Error closing leaf', e);
            }
            this.leaf = null;
        }

        this.currentFilePath = null;
    }

    /**
     * 获取当前打开的文件路径
     */
    getCurrentFilePath(): string | null {
        return this.currentFilePath;
    }

    /**
     * 显示空状态消息
     */
    private showEmpty(message: string): void {
        this.close();
        this.container.empty();
        this.container.createEl('div', { text: message, cls: 'gantt-task-empty' });
    }

    /**
     * 降级到只读预览模式（MarkdownRenderer）
     */
    private async fallbackToPreview(file: TFile, parentComponent: Component): Promise<void> {
        this.container.empty();

        const content = await this.app.vault.read(file);
        if (!content.trim()) {
            this.container.createEl('div', { text: '无内容', cls: 'gantt-task-empty' });
            return;
        }

        this.fallbackComponent = new Component();
        this.fallbackComponent.load();

        const noteBody = this.container.createDiv(DayViewClasses.elements.notesBody);
        await MarkdownRenderer.render(
            this.app,
            content,
            noteBody,
            file.path,
            this.fallbackComponent
        );
    }

    /**
     * 应用嵌入样式（隐藏不需要的 UI 元素，调整尺寸）
     */
    private applyEmbeddedStyles(): void {
        if (!this.leaf?.view) return;

        const containerEl = this.leaf.containerEl;

        // 确保 leaf 容器填满父容器
        containerEl.style.height = '100%';
        containerEl.style.width = '100%';
        containerEl.style.overflow = 'hidden';

        // 添加自定义 class 以便 CSS 选择器生效
        containerEl.classList.add(EmbeddedEditorClasses.block);
    }
}
