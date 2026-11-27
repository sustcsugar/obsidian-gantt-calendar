import type { GCTask } from '../../../types';
import { i18n } from '../../../i18n/i18n';
import { buildTaskHierarchy } from '../../../tasks/hierarchy/taskHierarchy';
import { buildTooltipSections } from '../tooltipSections';

function makeTask(lineNumber: number, overrides: Partial<GCTask> = {}): GCTask {
	return {
		filePath: 'a.md',
		fileName: 'a',
		lineNumber,
		content: `- [ ] 任务 ${lineNumber}`,
		description: `任务 ${lineNumber}`,
		completed: false,
		priority: 'normal',
		...overrides,
	};
}

function rel(tid?: string, parent?: string): Partial<GCTask> {
	return { tid, parentTid: parent };
}

function sectionKeys(task: GCTask, index = buildTaskHierarchy([task])): string[] {
	return buildTooltipSections(task, { index }).map((s) => s.key);
}

describe('buildTooltipSections —— 无层级上下文', () => {
	it('不出现父/子区块（与改造前一致）', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const child = makeTask(2, rel(undefined, 'pppp1111'));
		const keys = buildTooltipSections(child).map((s) => s.key);

		expect(keys).not.toContain('parent');
		expect(keys).not.toContain('children');
	});

	it('没有父子关系的任务不产生空区块', () => {
		const task = makeTask(1);
		expect(sectionKeys(task)).not.toContain('parent');
		expect(sectionKeys(task)).not.toContain('children');
	});
});

describe('buildTooltipSections —— 父任务', () => {
	it('子任务提示里出现父任务一行', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const child = makeTask(2, rel(undefined, 'pppp1111'));
		const index = buildTaskHierarchy([parent, child]);

		const sections = buildTooltipSections(child, { index });
		const parentSection = sections.find((s) => s.key === 'parent');

		expect(parentSection).toBeDefined();
		expect(parentSection?.rows[0].label).toBe(i18n.t('taskCard.parentTask'));
		expect(parentSection?.rows[0].value).toContain(parent.description);
	});

	it('父任务已完成时带完成标记', () => {
		const parent = makeTask(1, { ...rel('pppp1111'), completed: true });
		const child = makeTask(2, rel(undefined, 'pppp1111'));
		const index = buildTaskHierarchy([parent, child]);

		const row = buildTooltipSections(child, { index }).find((s) => s.key === 'parent')?.rows[0];
		expect(row?.value).toContain('✓');
	});

	it('断链时标红提示父任务已不存在', () => {
		const orphan = makeTask(1, rel(undefined, 'missing1'));
		const index = buildTaskHierarchy([orphan]);

		const row = buildTooltipSections(orphan, { index }).find((s) => s.key === 'parent')?.rows[0];
		expect(row?.value).toBe(i18n.t('taskCard.parentMissing'));
		expect(row?.valueClass).toBeTruthy();
	});

	it('父任务被筛选隐藏时追加标注', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const child = makeTask(2, rel(undefined, 'pppp1111'));
		const index = buildTaskHierarchy([parent, child]);

		const row = buildTooltipSections(child, {
			index,
			isVisible: (task) => task !== parent,
		}).find((s) => s.key === 'parent')?.rows[0];

		expect(row?.value).toContain(i18n.t('taskCard.parentHidden'));
	});
});

describe('buildTooltipSections —— 子任务', () => {
	it('父任务提示里出现子任务汇总与逐条列表', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const child1 = makeTask(2, { ...rel(undefined, 'pppp1111'), completed: true });
		const child2 = makeTask(3, rel(undefined, 'pppp1111'));
		const index = buildTaskHierarchy([parent, child1, child2]);

		const section = buildTooltipSections(parent, { index }).find((s) => s.key === 'children');
		expect(section).toBeDefined();
		expect(section?.rows[0].value).toContain('1/2');
		expect(section?.rows[0].value).toContain('50%');
		expect(section?.rows).toHaveLength(3);
	});

	it('超过 6 条子任务时折叠并给出剩余数量', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const children = Array.from({ length: 9 }, (_, i) => makeTask(i + 2, rel(undefined, 'pppp1111')));
		const index = buildTaskHierarchy([parent, ...children]);

		const rows = buildTooltipSections(parent, { index }).find((s) => s.key === 'children')?.rows ?? [];
		// 1 汇总 + 6 子任务 + 1 折叠提示
		expect(rows).toHaveLength(8);
		expect(rows[7].value).toBe(i18n.t('taskCard.moreChildren', { count: 3 }));
	});

	it('自定义 maxChildren 生效', () => {
		const parent = makeTask(1, rel('pppp1111'));
		const children = Array.from({ length: 4 }, (_, i) => makeTask(i + 2, rel(undefined, 'pppp1111')));
		const index = buildTaskHierarchy([parent, ...children]);

		const rows = buildTooltipSections(parent, { index, maxChildren: 2 })
			.find((s) => s.key === 'children')?.rows ?? [];
		expect(rows).toHaveLength(4);
	});

	it('叶子任务没有子任务区块', () => {
		const leaf = makeTask(1, rel('llll0001'));
		expect(sectionKeys(leaf)).not.toContain('children');
	});
});

describe('buildTooltipSections —— 元数据过滤', () => {
	it('tid / parent 不出现在元数据区块', () => {
		const task = makeTask(1, {
			...rel('pppp1111', 'qqqq2222'),
			metadataFields: [
				{ key: 'tid', value: 'pppp1111' },
				{ key: 'parent', value: 'qqqq2222' },
				{ key: 'project', value: 'obsidian' },
			],
		});
		const index = buildTaskHierarchy([task]);

		const metadata = buildTooltipSections(task, { index }).find((s) => s.key === 'metadata');
		expect(metadata?.rows).toEqual([{ label: 'project', value: 'obsidian' }]);
	});

	it('只有层级字段时不产生元数据区块', () => {
		const task = makeTask(1, {
			...rel('pppp1111'),
			metadataFields: [{ key: 'tid', value: 'pppp1111' }],
		});
		const index = buildTaskHierarchy([task]);
		expect(buildTooltipSections(task, { index }).some((s) => s.key === 'metadata')).toBe(false);
	});
});
