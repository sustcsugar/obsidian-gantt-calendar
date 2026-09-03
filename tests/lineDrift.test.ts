/**
 * 行号漂移二次匹配测试：
 * 文件上方插入/删除行时，下方任务通过指纹重配而非 deleted+created
 */
import { MarkdownDataSource } from '../src/data-layer/MarkdownDataSource';
import type { DataSourceChanges } from '../src/data-layer/types';
import { TFile } from 'obsidian';

function makeApp(files: Record<string, string>) {
	const fileOf = (path: string) => {
		const f = new TFile() as TFile & { extension: string; stat: { mtime: number; ctime: number; size: number } };
		f.path = path;
		f.extension = 'md';
		f.stat = { mtime: Date.now(), ctime: Date.now(), size: 100 };
		return f;
	};
	return {
		vault: {
			getAbstractFileByPath: (path: string) => fileOf(path),
			getMarkdownFiles: () => [{ path: 'a.md', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }],
			read: async (f: { path: string }) => files[f.path],
			on: () => ({}),
			offref: () => {},
		},
		metadataCache: { on: () => ({}) },
	} as never;
}

function newSource(app: unknown, changes: DataSourceChanges[]) {
	const ds = new MarkdownDataSource(app as never, { on: () => ({}), emit: () => {} } as never, {
		enabled: true,
		syncDirection: 'import-only',
		autoSync: false,
		conflictResolution: 'local-win',
		globalFilter: '',
		enabledFormats: ['tasks', 'dataview'],
	});
	(ds as unknown as { changeHandler: (c: DataSourceChanges) => Promise<void> }).changeHandler =
		async (c) => { changes.push(c); };
	return ds;
}

const anyDs = (ds: MarkdownDataSource) =>
	ds as unknown as { processFileModification: (p: string) => Promise<void> };

describe('行号漂移指纹二次匹配', () => {
	const original = [
		'- [ ] 任务A 📅 2026-08-20',
		'- [ ] 任务B 📅 2026-08-21',
		'- [ ] 任务C 📅 2026-08-22',
	].join('\n');

	it('上方插入一行：下方任务不再产生 deleted+created，而是 updated', async () => {
		const files = { 'notes/p.md': original };
		const changes: DataSourceChanges[] = [];
		const ds = newSource(makeApp(files), changes);
		await anyDs(ds).processFileModification('notes/p.md'); // 建立基线
		changes.length = 0;

		// 上方插入新任务
		files['notes/p.md'] = '- [ ] 新任务 📅 2026-08-19\n' + original;
		await anyDs(ds).processFileModification('notes/p.md');

		expect(changes).toHaveLength(1);
		const c = changes[0];
		// 指纹二次匹配效果：
		// 旧行为: 3 deleted + 4 created = 7 events（全量换血）
		// 新行为: 0 deleted + 1 created + 3 updated = 4 events（原地更新）
		expect(c.deleted).toHaveLength(0);
		expect(c.created).toHaveLength(1);
		expect(c.created[0].description).toBe('任务C');
		expect(c.updated.length).toBe(3);
	});

	it('上方删除一行：事件量可控', async () => {
		const withExtra = '- [ ] 待删除 📅 2026-08-18\n' + original;
		const files = { 'notes/p.md': withExtra };
		const changes: DataSourceChanges[] = [];
		const ds = newSource(makeApp(files), changes);
		await anyDs(ds).processFileModification('notes/p.md');
		changes.length = 0;

		// 删除第一行
		files['notes/p.md'] = original;
		await anyDs(ds).processFileModification('notes/p.md');

		expect(changes).toHaveLength(1);
		const c = changes[0];
		// 下方任务因 ID 匹配走 updated，仅被删任务产生 deleted
		expect(c.updated.length).toBeGreaterThanOrEqual(2);
		expect(c.deleted.length).toBeLessThanOrEqual(1);
	});

	it('内容不变时二次匹配不影响正常检测', async () => {
		const files = { 'notes/p.md': original };
		const changes: DataSourceChanges[] = [];
		const ds = newSource(makeApp(files), changes);
		await anyDs(ds).processFileModification('notes/p.md');
		changes.length = 0;

		// 修改任务B的日期
		files['notes/p.md'] = [
			'- [ ] 任务A 📅 2026-08-20',
			'- [ ] 任务B 📅 2026-08-25',
			'- [ ] 任务C 📅 2026-08-22',
		].join('\n');
		await anyDs(ds).processFileModification('notes/p.md');

		expect(changes).toHaveLength(1);
		expect(changes[0].updated).toHaveLength(1);
		expect(changes[0].updated[0].task?.description).toBe('任务B');
	});
});
