/**
 * 事件风暴修复回归测试：
 * 修改文件中单个任务时，只有该任务进入 updated，
 * 其余未变化任务不再产生 task:updated 事件。
 */
import { TFile } from 'obsidian';
import { MarkdownDataSource } from '../src/data-layer/MarkdownDataSource';
import type { DataSourceChanges } from '../src/data-layer/types';
import type { GCTask } from '../src/types';
import { EventBus } from '../src/data-layer/EventBus';

function makeApp(files: Record<string, string>) {
	const fileOf = (path: string) => {
		const f = new TFile() as TFile & { extension: string; stat: { mtime: number } };
		f.path = path;
		f.extension = 'md';
		f.stat = { mtime: Date.now(), ctime: Date.now(), size: 100 };
		return f;
	};
	return {
		vault: {
			getAbstractFileByPath: (path: string) => fileOf(path),
			getMarkdownFiles: () => [],
			read: async (f: { path: string }) => files[f.path],
			on: () => ({}),
			offref: () => {},
		},
		metadataCache: {
			getFileCache: () => null,
			on: () => ({}),
		},
	} as never;
}

function newSource(app: unknown, changes: DataSourceChanges[]) {
	const ds = new MarkdownDataSource(app as never, new EventBus(), {
		enabled: true,
		syncDirection: 'import-only',
		autoSync: false,
		conflictResolution: 'local-win',
		globalFilter: '',
		enabledFormats: ['tasks', 'dataview'],
	});
	// 注入 changeHandler 捕获输出
	(ds as unknown as { changeHandler: (c: DataSourceChanges) => Promise<void> }).changeHandler =
		async (c) => { changes.push(c); };
	return ds;
}

describe('事件风暴：字段级 diff', () => {
	const fileContent = [
		'- [ ] 任务A 📅 2026-08-20',
		'- [ ] 任务B 📅 2026-08-21',
		'- [ ] 任务C 📅 2026-08-22',
	].join('\n');

	it('首次处理：3 个任务全部为 created', async () => {
		const files = { 'notes/p.md': fileContent };
		const changes: DataSourceChanges[] = [];
		const ds = newSource(makeApp(files), changes);

		await (ds as unknown as { processFileModification: (p: string) => Promise<void> }).processFileModification('notes/p.md');

		expect(changes).toHaveLength(1);
		expect(changes[0].created).toHaveLength(3);
		expect(changes[0].updated).toHaveLength(0);
	});

	it('修改单个任务日期：只有 1 个任务进入 updated，其余 2 个不再发事件', async () => {
		const files = { 'notes/p.md': fileContent };
		const changes: DataSourceChanges[] = [];
		const ds = newSource(makeApp(files), changes);
		const anyDs = ds as unknown as { processFileModification: (p: string) => Promise<void> };

		await anyDs.processFileModification('notes/p.md'); // 建立基线缓存
		changes.length = 0;

		// 只改任务B的日期
		files['notes/p.md'] = [
			'- [ ] 任务A 📅 2026-08-20',
			'- [ ] 任务B 📅 2026-08-25',
			'- [ ] 任务C 📅 2026-08-22',
		].join('\n');
		await anyDs.processFileModification('notes/p.md');

		expect(changes).toHaveLength(1);
		expect(changes[0].updated).toHaveLength(1);
		expect((changes[0].updated[0].task as GCTask).description).toBe('任务B');
		expect(changes[0].created).toHaveLength(0);
		expect(changes[0].deleted).toHaveLength(0);
	});

	it('未修改任何任务：不产生 changes', async () => {
		const files = { 'notes/p.md': fileContent };
		const changes: DataSourceChanges[] = [];
		const ds = newSource(makeApp(files), changes);
		const anyDs = ds as unknown as { processFileModification: (p: string) => Promise<void> };

		await anyDs.processFileModification('notes/p.md');
		changes.length = 0;

		// 内容不变（mtime 变化由外部触发，内容相同）
		await anyDs.processFileModification('notes/p.md');

		expect(changes).toHaveLength(0);
	});

	it('勾选完成状态：对应任务进入 updated', async () => {
		const files = { 'notes/p.md': fileContent };
		const changes: DataSourceChanges[] = [];
		const ds = newSource(makeApp(files), changes);
		const anyDs = ds as unknown as { processFileModification: (p: string) => Promise<void> };

		await anyDs.processFileModification('notes/p.md');
		changes.length = 0;

		files['notes/p.md'] = [
			'- [x] 任务A ✅ 2026-08-27',
			'- [ ] 任务B 📅 2026-08-21',
			'- [ ] 任务C 📅 2026-08-22',
		].join('\n');
		await anyDs.processFileModification('notes/p.md');

		expect(changes[0].updated).toHaveLength(1);
		expect((changes[0].updated[0].task as GCTask).description).toBe('任务A');
	});

	it('插入新任务行：1 created + 后续行 ID 漂移按既有语义处理', async () => {
		const files = { 'notes/p.md': fileContent };
		const changes: DataSourceChanges[] = [];
		const ds = newSource(makeApp(files), changes);
		const anyDs = ds as unknown as { processFileModification: (p: string) => Promise<void> };

		await anyDs.processFileModification('notes/p.md');
		changes.length = 0;

		files['notes/p.md'] = [
			'- [ ] 任务零 📅 2026-08-19',
			'- [ ] 任务A 📅 2026-08-20',
			'- [ ] 任务B 📅 2026-08-21',
			'- [ ] 任务C 📅 2026-08-22',
		].join('\n');
		await anyDs.processFileModification('notes/p.md');

		// 插入行后按行号 ID 匹配：新尾行任务 created，
		// 行内容变化的上游任务 updated（指纹不同），无 deleted
		expect(changes[0].created).toHaveLength(1);
		expect(changes[0].created[0].description).toBe('任务C');
		expect(changes[0].deleted).toHaveLength(0);
		expect(changes[0].updated).toHaveLength(3); // 任务零/A/B 内容与旧行不同
	});
});
