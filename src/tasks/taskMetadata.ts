/**
 * 任务内联元数据（%%[key:: value]%%）读写辅助。
 *
 * 写回链路只接受整份 `metadataFields` 数组（见 taskUpdater / taskSerializer），
 * 因此这里提供幂等的「单字段增删」纯函数，避免每个调用点手写 filter + append。
 *
 * 约定：
 * - 所有函数都返回**新数组**，绝不原地修改传入的数组。
 *   数据层的任务对象在缓存中共享（TaskStore.getAllTasks 返回缓存数组本体），
 *   原地修改会静默污染缓存。
 * - `tid` / `parent` 是任务层级的保留键，不应出现在通用元数据展示里。
 */

import type { MetadataField } from '../types';
import { RegularExpressions } from '../utils/RegularExpressions';

/** 任务层级保留键（写入磁盘的 key 名） */
export const HIERARCHY_METADATA_KEYS = {
	tid: 'tid',
	parent: 'parent',
} as const;

/** 展示层需要过滤掉的保留键 */
export const RESERVED_METADATA_KEYS: ReadonlySet<string> = new Set([
	HIERARCHY_METADATA_KEYS.tid,
	HIERARCHY_METADATA_KEYS.parent,
]);

/** tid 字符集：小写 base36 */
const TID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** tid 长度 */
export const TID_LENGTH = 8;

/** 生成 tid 时的最大重试次数（碰撞时） */
const TID_MAX_ATTEMPTS = 32;

/**
 * 读取首个同名 key 的值。
 * 与解析层 `findMetadataValue` 保持同一语义（大小写敏感、取第一个）。
 */
export function getMetadataValue(fields: MetadataField[] | undefined, key: string): string | undefined {
	if (!fields) return undefined;
	const entry = fields.find((f) => f.key === key);
	return entry?.value || undefined;
}

/**
 * 幂等 upsert：存在则替换第一个同名 key，并删除其余重复项；不存在则追加到末尾。
 *
 * 返回新数组。
 */
export function setMetadataField(
	fields: MetadataField[] | undefined,
	key: string,
	value: string
): MetadataField[] {
	const source = fields ?? [];
	const next: MetadataField[] = [];
	let written = false;

	for (const field of source) {
		if (field.key === key) {
			if (!written) {
				next.push({ key, value });
				written = true;
			}
			continue;
		}
		next.push({ key: field.key, value: field.value });
	}

	if (!written) {
		next.push({ key, value });
	}
	return next;
}

/**
 * 删除全部同名 key。返回新数组。
 */
export function removeMetadataField(fields: MetadataField[] | undefined, key: string): MetadataField[] {
	const source = fields ?? [];
	return source.filter((field) => field.key !== key).map((field) => ({ key: field.key, value: field.value }));
}

/**
 * 供 tooltip / 卡片展示：剔除 `tid` / `parent` 等保留键。
 */
export function visibleMetadataFields(fields: MetadataField[] | undefined): MetadataField[] {
	const source = fields ?? [];
	return source
		.filter((field) => !RESERVED_METADATA_KEYS.has(field.key))
		.map((field) => ({ key: field.key, value: field.value }));
}

/** 是否为合法 tid（8 位小写 base36） */
export function isValidTid(value: string | undefined): boolean {
	if (!value) return false;
	return RegularExpressions.TaskHierarchy.tid.test(value);
}

/**
 * 生成一个未被占用的 tid。
 *
 * @param taken 已占用的 tid 集合（来自当前任务缓存），用于冲突检测
 * @param random 注入随机源，便于测试
 */
export function generateTid(taken: ReadonlySet<string> = new Set(), random: () => number = Math.random): string {
	for (let attempt = 0; attempt < TID_MAX_ATTEMPTS; attempt++) {
		let candidate = '';
		for (let i = 0; i < TID_LENGTH; i++) {
			const index = Math.floor(random() * TID_ALPHABET.length) % TID_ALPHABET.length;
			candidate += TID_ALPHABET[index];
		}
		if (!taken.has(candidate)) return candidate;
	}

	// 极端情况下随机源退化（或占用集合异常大）：用时间戳派生，避免死循环
	const seed = `${Date.now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`;
	let fallback = '';
	for (let i = 0; i < TID_LENGTH; i++) {
		const code = seed.charCodeAt(i % seed.length);
		fallback += TID_ALPHABET[code % TID_ALPHABET.length];
	}
	let suffix = 0;
	let candidate = fallback;
	while (taken.has(candidate)) {
		suffix = (suffix + 1) % TID_ALPHABET.length;
		candidate = `${fallback.slice(0, TID_LENGTH - 1)}${TID_ALPHABET[suffix]}`;
	}
	return candidate;
}
