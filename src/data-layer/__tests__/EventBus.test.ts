/**
 * EventBus 单元测试
 */

import { EventBus } from '../EventBus';

describe('EventBus', () => {
	let eventBus: EventBus;

	beforeEach(() => {
		eventBus = new EventBus();
	});

	afterEach(() => {
		eventBus.clear();
	});

	describe('on and emit', () => {
		it('should emit events to subscribers', () => {
			let received = false;
			eventBus.on('test', () => {
				received = true;
			});

			eventBus.emit('test');

			expect(received).toBe(true);
		});

		it('should pass data to event handlers', () => {
			let receivedData: unknown = null;
			const testData = { message: 'hello' };

			eventBus.on('test', (data) => {
				receivedData = data;
			});

			eventBus.emit('test', testData);

			expect(receivedData).toEqual(testData);
		});

		it('should support multiple subscribers for the same event', () => {
			let count = 0;

			eventBus.on('test', () => {
				count += 1;
			});

			eventBus.on('test', () => {
				count += 1;
			});

			eventBus.emit('test');

			expect(count).toBe(2);
		});
	});

	describe('off', () => {
		it('should remove event subscribers', () => {
			let received = false;
			const handler = () => {
				received = true;
			};

			eventBus.on('test', handler);
			eventBus.off('test', handler);
			eventBus.emit('test');

			expect(received).toBe(false);
		});
	});

	describe('once', () => {
		it('should only trigger once', () => {
			let count = 0;

			eventBus.once('test', () => {
				count += 1;
			});

			eventBus.emit('test');
			eventBus.emit('test');
			eventBus.emit('test');

			expect(count).toBe(1);
		});
	});

	describe('error handling', () => {
		it('should handle errors in isolation', () => {
			let received = false;

			eventBus.on('test', () => {
				throw new Error('Test error');
			});

			eventBus.on('test', () => {
				received = true;
			});

			// 应该不会抛出未捕获的异常
			expect(() => {
				eventBus.emit('test');
			}).not.toThrow();

			// 第二个处理器应该仍然执行
			expect(received).toBe(true);
		});
	});

	describe('listenerCount', () => {
		it('should return the correct number of listeners', () => {
			expect(eventBus.listenerCount('test')).toBe(0);

			eventBus.on('test', () => {});
			expect(eventBus.listenerCount('test')).toBe(1);

			eventBus.on('test', () => {});
			expect(eventBus.listenerCount('test')).toBe(2);

			eventBus.on('other', () => {});
			expect(eventBus.listenerCount('other')).toBe(1);
		});
	});

	describe('eventNames', () => {
		it('should return all event names with listeners', () => {
			eventBus.on('event1', () => {});
			eventBus.on('event2', () => {});
			eventBus.on('event3', () => {});

			const names = eventBus.eventNames();

			expect(names).toHaveLength(3);
			expect(names).toContain('event1');
			expect(names).toContain('event2');
			expect(names).toContain('event3');
		});
	});

	describe('clear', () => {
		it('should remove all event listeners', () => {
			eventBus.on('event1', () => {});
			eventBus.on('event2', () => {});
			eventBus.on('event3', () => {});

			eventBus.clear();

			expect(eventBus.listenerCount('event1')).toBe(0);
			expect(eventBus.listenerCount('event2')).toBe(0);
			expect(eventBus.listenerCount('event3')).toBe(0);
		});
	});
});
