/**
 * EventBus - 事件总线
 *
 * 提供发布-订阅模式的事件系统，用于组件间的解耦通信。
 *
 * 特性：
 * - 错误隔离：单个处理器错误不影响其他处理器
 * - 内存安全：自动清理无效的订阅
 * - 灵活订阅：支持持续订阅和一次性订阅
 */

import { EventHandler } from './types';
import { Logger } from '../utils/logger';

export class EventBus {
	private listeners: Map<string, Set<EventHandler>> = new Map();

	/**
	 * 订阅事件
	 * @param eventName - 事件名称
	 * @param handler - 事件处理器
	 */
	on(eventName: string, handler: EventHandler): void {
		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, new Set());
		}
		this.listeners.get(eventName)!.add(handler);
	}

	/**
	 * 取消订阅
	 * @param eventName - 事件名称
	 * @param handler - 事件处理器
	 */
	off(eventName: string, handler: EventHandler): void {
		const handlers = this.listeners.get(eventName);
		if (handlers) {
			handlers.delete(handler);
		}
	}

	/**
	 * 发布事件
	 * @param eventName - 事件名称
	 * @param data - 事件数据
	 */
	emit(eventName: string, data?: any): void {
		const handlers = this.listeners.get(eventName);
		if (handlers) {
			handlers.forEach(handler => {
				try {
					handler(data);
				} catch (error) {
					Logger.error('EventBus', `Error in ${eventName} handler:`, error);
				}
			});
		}
	}

	/**
	 * 一次性订阅
	 * @param eventName - 事件名称
	 * @param handler - 事件处理器（只触发一次后自动取消订阅）
	 */
	once(eventName: string, handler: EventHandler): void {
		const wrappedHandler = (data?: any) => {
			handler(data);
			this.off(eventName, wrappedHandler);
		};
		this.on(eventName, wrappedHandler);
	}

	/**
	 * 清空所有事件监听器
	 */
	clear(): void {
		this.listeners.clear();
	}

	/**
	 * 获取指定事件的监听器数量
	 * @param eventName - 事件名称
	 * @returns 监听器数量
	 */
	listenerCount(eventName: string): number {
		return this.listeners.get(eventName)?.size || 0;
	}

	/**
	 * 获取所有事件名称
	 * @returns 事件名称数组
	 */
	eventNames(): string[] {
		return Array.from(this.listeners.keys());
	}
}
