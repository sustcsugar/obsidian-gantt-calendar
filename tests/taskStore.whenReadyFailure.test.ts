import type { App } from 'obsidian';
import { TaskStore } from '../src/TaskStore';

/**
 * P0''：whenReady 失败兜底。
 * 旧行为：初始化失败时 initResolve 永不调用 → whenReady() 永久挂起
 * → 视图骨架永远无法解除（永久白屏）。失败必须同样结算门闩（reject）。
 */
describe('TaskStore whenReady 失败兜底（P0 双引号兜底）', () => {
	test('initialize 失败时 whenReady() 拒绝而非永久挂起', async () => {
		const app = {
			vault: {
				getMarkdownFiles: (): never => {
					throw new Error('vault boom');
				},
			},
		} as unknown as App;
		const store = new TaskStore(app);

		const whenReady = store.whenReady();

		await expect(store.initialize('')).rejects.toThrow('vault boom');
		await expect(whenReady).rejects.toThrow('vault boom');
	});
});
