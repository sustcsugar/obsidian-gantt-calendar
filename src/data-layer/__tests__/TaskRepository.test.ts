/**
 * TaskRepository 单元测试
 */

import { TaskRepository } from '../TaskRepository';
import { EventBus } from '../EventBus';
import { IDataSource } from '../IDataSource';
import type { GCTask } from '../../types';
import type { DataSourceChanges, DataSourceConfig } from '../types';

// Mock 数据源用于测试
class MockDataSource implements IDataSource {
	readonly sourceId = 'mock';
	readonly sourceName = 'Mock Data Source';
	readonly isReadOnly = false;

	private tasks: GCTask[] = [];
	private changeHandler?: (changes: DataSourceChanges) => void | Promise<void>;

	async initialize(config: DataSourceConfig): Promise<void> {
		// Mock implementation
	}

	async getTasks(): Promise<GCTask[]> {
		return this.tasks;
	}

	onChange(handler: (changes: DataSourceChanges) => void | Promise<void>): void {
		this.changeHandler = handler;
	}

	async createTask(task: GCTask): Promise<string> {
		this.tasks.push(task);
		this.changeHandler?.({
			sourceId: this.sourceId,
			created: [task],
			updated: [],
			deleted: []
		});
		return `${task.filePath}:${task.lineNumber}`;
	}

	async updateTask(taskId: string, changes: any): Promise<void> {
		const task = this.tasks.find(t => `${t.filePath}:${t.lineNumber}` === taskId);
		if (task) {
			Object.assign(task, changes);
			this.changeHandler?.({
				sourceId: this.sourceId,
				created: [],
				updated: [{ id: taskId, changes }],
				deleted: []
			});
		}
	}

	async deleteTask(taskId: string): Promise<void> {
		const index = this.tasks.findIndex(t => `${t.filePath}:${t.lineNumber}` === taskId);
		if (index >= 0) {
			const task = this.tasks[index];
			this.tasks.splice(index, 1);
			this.changeHandler?.({
				sourceId: this.sourceId,
				created: [],
				updated: [],
				deleted: [task]
			});
		}
	}

	async getSyncStatus(): Promise<any> {
		return {
			syncDirection: 'bidirectional' as const,
			conflictResolution: 'local-win' as const
		};
	}

	destroy(): void {
		this.tasks = [];
	}
}

describe('TaskRepository', () => {
	let repository: TaskRepository;
	let eventBus: EventBus;
	let mockSource: MockDataSource;

	beforeEach(() => {
		eventBus = new EventBus();
		repository = new TaskRepository(eventBus);
		mockSource = new MockDataSource();
	});

	afterEach(() => {
		repository.clear();
		mockSource.destroy();
	});

	describe('registerDataSource', () => {
		it('should register a data source', () => {
			repository.registerDataSource(mockSource);

			const stats = repository.getStats();
			expect(stats.dataSources).toBe(1);
		});
	});

	describe('getAllTasks', () => {
		it('should return empty array initially', () => {
			repository.registerDataSource(mockSource);

			const tasks = repository.getAllTasks();
			expect(tasks).toEqual([]);
		});

		it('should return tasks from data source', async () => {
			repository.registerDataSource(mockSource);

			const mockTask: GCTask = {
				filePath: 'test.md',
				fileName: 'test.md',
				lineNumber: 1,
				content: '- [ ] Test task',
				description: 'Test task',
				completed: false,
				priority: 'normal',
				status: 'todo'
			};

			await mockSource.createTask(mockTask);

			// 等待事件处理
			await new Promise(resolve => setTimeout(resolve, 10));

			const tasks = repository.getAllTasks();
			expect(tasks).toHaveLength(1);
			expect(tasks[0].description).toBe('Test task');
		});
	});

	describe('getStats', () => {
		it('should return correct statistics', () => {
			repository.registerDataSource(mockSource);

			const stats = repository.getStats();
			expect(stats.dataSources).toBe(1);
			expect(stats.totalTasks).toBe(0);
			expect(stats.totalFiles).toBe(0);
		});
	});
});
