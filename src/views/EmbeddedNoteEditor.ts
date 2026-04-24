import { App, WorkspaceLeaf, WorkspaceSplit, WorkspaceTabs, TFile, MarkdownRenderer, Component } from 'obsidian';
import { findDailyNoteForDate, DailyNoteIndex } from '../utils/dailyNoteSettingsBridge';
import type { GanttCalendarSettings } from '../settings/types';
import { Logger } from '../utils/logger';
import { EmbeddedEditorClasses, DayViewClasses } from '../utils/bem';

/**
 * WorkspaceLeaf / WorkspaceSplit 内部接口
 * Obsidian 类型定义未暴露 containerEl，但运行时实际存在
 */
interface InternalWorkspaceLeaf extends WorkspaceLeaf {
    containerEl: HTMLElement;
}

interface InternalWorkspaceSplit extends WorkspaceSplit {
    containerEl: HTMLElement;
    getRoot: () => any;
    getContainer: () => any;
    children: any[];
    replaceChild: (index: number, child: any) => void;
}

type ConstructableWorkspaceSplit = new (ws: App['workspace'], dir: 'horizontal' | 'vertical') => WorkspaceSplit;

/**
 * 临时屏蔽 setActiveLeaf 的工具函数
 * Obsidian 1.8.7+ 在 createLeafInParent 时会激活新 leaf，需要阻止
 */
function suppressSetActiveLeaf(app: App): () => void {
    const original = app.workspace.setActiveLeaf.bind(app.workspace);
    app.workspace.setActiveLeaf = () => {};
    return () => {
        app.workspace.setActiveLeaf = original;
    };
}

/**
 * 嵌入式笔记编辑器
 *
 * 参照 Hover Editor 插件的实现方式：
 * 1. 创建独立的 WorkspaceSplit（不挂在 workspace tab 系统中）
 * 2. 将 split.containerEl 挂载到 DayView 的笔记区域 div
 * 3. 通过 workspace.createLeafInParent(split, 0) 在 split 中创建 leaf
 * 4. leaf.openFile(file) 加载完整的 MarkdownView 编辑器
 * 5. 清理时 leaf.detach() 移除 leaf
 */
export class EmbeddedNoteEditor {
    private app: App;
    private container: HTMLElement;
    private rootSplit: InternalWorkspaceSplit | null = null;
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
            // 1. 创建独立的 WorkspaceSplit（参照 Hover Editor）
            this.rootSplit = new (WorkspaceSplit as unknown as ConstructableWorkspaceSplit)(
                this.app.workspace,
                'vertical'
            ) as InternalWorkspaceSplit;

            // 让 split 能找到正确的 rootSplit 和 container
            this.rootSplit.getRoot = () => this.app.workspace.rootSplit!;
            this.rootSplit.getContainer = () => this.app.workspace.rootSplit!;

            // 2. 将 split 的 DOM 挂载到我们的容器中
            this.container.empty();
            this.container.appendChild(this.rootSplit.containerEl);

            // 3. 屏蔽 setActiveLeaf，防止 Obsidian 激活新 leaf（参照 Hover Editor）
            const restore = suppressSetActiveLeaf(this.app);
            let rawLeaf: WorkspaceLeaf;
            try {
                rawLeaf = this.app.workspace.createLeafInParent(this.rootSplit, 0);
            } finally {
                restore();
            }
            this.leaf = rawLeaf as InternalWorkspaceLeaf;

            // 4. 展开 WorkspaceTabs（createLeafInParent 可能把 leaf 包在 tabs 里）
            this.unwrapTabs();

            // 5. 在 leaf 中打开文件
            await this.leaf.openFile(file);

            // 6. 应用嵌入样式
            this.applyEmbeddedStyles();

            Logger.debug('EmbeddedNoteEditor', `Opened file: ${file.path}`);
        } catch (error) {
            Logger.error('EmbeddedNoteEditor', 'Failed to create embedded editor, falling back to preview', error);

            // 降级到只读预览模式
            this.leaf = null;
            this.rootSplit = null;
            await this.fallbackToPreview(file, parentComponent);
        }
    }

    /**
     * 展开 WorkspaceTabs
     * createLeafInParent 可能将 leaf 包裹在 WorkspaceTabs 中，
     * 需要将其展开为直接子节点以避免显示标签栏
     */
    private unwrapTabs(): void {
        if (!this.rootSplit) return;
        try {
            this.rootSplit.children.forEach((item: any, index: number) => {
                if (item instanceof WorkspaceTabs && (item as any).children?.length > 0) {
                    this.rootSplit!.replaceChild(index, (item as any).children[0]);
                }
            });
        } catch (e) {
            Logger.debug('EmbeddedNoteEditor', 'unwrapTabs failed (non-critical)', e);
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

        // 清理 leaf
        if (this.leaf) {
            try {
                this.leaf.detach();
            } catch (e) {
                Logger.error('EmbeddedNoteEditor', 'Error closing leaf', e);
            }
            this.leaf = null;
        }

        // 清理 rootSplit 的 DOM
        if (this.rootSplit) {
            try {
                if (this.rootSplit.containerEl?.parentNode) {
                    this.rootSplit.containerEl.parentNode.removeChild(this.rootSplit.containerEl);
                }
            } catch (e) {
                Logger.error('EmbeddedNoteEditor', 'Error closing rootSplit', e);
            }
            this.rootSplit = null;
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
     * 应用嵌入样式
     */
    private applyEmbeddedStyles(): void {
        if (!this.rootSplit || !this.leaf) return;

        // rootSplit 容器填满
        const splitEl = this.rootSplit.containerEl;
        splitEl.style.height = '100%';
        splitEl.style.width = '100%';

        // leaf 容器填满并添加自定义 class
        const leafEl = this.leaf.containerEl;
        leafEl.style.height = '100%';
        leafEl.style.width = '100%';
        leafEl.style.overflow = 'hidden';
        leafEl.classList.add(EmbeddedEditorClasses.block);
    }
}
