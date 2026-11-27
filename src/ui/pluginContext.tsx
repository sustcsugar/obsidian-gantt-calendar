import { createContext, useContext } from 'react';
import type { IPluginContext } from '../types';

/**
 * React 上下文：向所有 UI 组件提供插件上下文（settings / app / taskCache）
 */
export const PluginContext = createContext<IPluginContext | null>(null);

export function usePlugin(): IPluginContext {
	const ctx = useContext(PluginContext);
	if (!ctx) {
		throw new Error('usePlugin 必须在 PluginProvider 内使用');
	}
	return ctx;
}

export function useApp(): IPluginContext['app'] {
	return usePlugin().app;
}

/**
 * 可选插件上下文：用于可能挂在无 PluginContext 的 React root 下的组件
 * （如 modalHost 的弹窗宿主）。无上下文时返回 null，不抛错。
 */
export function useOptionalPlugin(): IPluginContext | null {
	return useContext(PluginContext);
}