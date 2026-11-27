import type { MetadataField } from '../../types';
import {
	RESERVED_METADATA_KEYS,
	TID_LENGTH,
	generateTid,
	getMetadataValue,
	isValidTid,
	removeMetadataField,
	setMetadataField,
	visibleMetadataFields,
} from '../taskMetadata';

const fields = (...pairs: Array<[string, string]>): MetadataField[] =>
	pairs.map(([key, value]) => ({ key, value }));

describe('taskMetadata', () => {
	describe('getMetadataValue', () => {
		it('返回首个同名 key 的值', () => {
			expect(getMetadataValue(fields(['a', '1'], ['a', '2']), 'a')).toBe('1');
		});

		it('缺字段返回 undefined（含空数组与 undefined）', () => {
			expect(getMetadataValue(undefined, 'a')).toBeUndefined();
			expect(getMetadataValue([], 'a')).toBeUndefined();
			expect(getMetadataValue(fields(['b', '1']), 'a')).toBeUndefined();
		});

		it('空字符串值视为缺失', () => {
			expect(getMetadataValue(fields(['a', '']), 'a')).toBeUndefined();
		});
	});

	describe('setMetadataField', () => {
		it('不存在时追加到末尾', () => {
			const result = setMetadataField(fields(['a', '1']), 'tid', 'abcd1234');
			expect(result).toEqual(fields(['a', '1'], ['tid', 'abcd1234']));
		});

		it('存在时替换首个并删除重复键', () => {
			const result = setMetadataField(fields(['tid', 'old'], ['a', '1'], ['tid', 'dup']), 'tid', 'new');
			expect(result).toEqual(fields(['tid', 'new'], ['a', '1']));
		});

		it('空输入时创建单元素数组', () => {
			expect(setMetadataField(undefined, 'parent', 'x')).toEqual(fields(['parent', 'x']));
		});

		it('不修改传入数组，返回新数组', () => {
			const source = fields(['a', '1']);
			const result = setMetadataField(source, 'a', '2');
			expect(source).toEqual(fields(['a', '1']));
			expect(result).not.toBe(source);
		});

		it('幂等：连续写同一值不会产生重复键', () => {
			const once = setMetadataField(undefined, 'parent', 'x');
			const twice = setMetadataField(once, 'parent', 'x');
			expect(twice).toEqual(fields(['parent', 'x']));
		});
	});

	describe('removeMetadataField', () => {
		it('删除全部同名 key 并保留顺序', () => {
			const result = removeMetadataField(fields(['a', '1'], ['parent', 'x'], ['b', '2'], ['parent', 'y']), 'parent');
			expect(result).toEqual(fields(['a', '1'], ['b', '2']));
		});

		it('不存在的 key 返回等值新数组', () => {
			const source = fields(['a', '1']);
			const result = removeMetadataField(source, 'parent');
			expect(result).toEqual(source);
			expect(result).not.toBe(source);
		});
	});

	describe('visibleMetadataFields', () => {
		it('过滤 tid / parent 保留键', () => {
			const result = visibleMetadataFields(fields(['tid', 'x'], ['a', '1'], ['parent', 'y'], ['b', '2']));
			expect(result).toEqual(fields(['a', '1'], ['b', '2']));
		});

		it('根除空输入', () => {
			expect(visibleMetadataFields(undefined)).toEqual([]);
		});

		it('保留键集合包含 tid 与 parent', () => {
			expect(RESERVED_METADATA_KEYS.has('tid')).toBe(true);
			expect(RESERVED_METADATA_KEYS.has('parent')).toBe(true);
		});
	});

	describe('generateTid', () => {
		it('生成 8 位小写 base36', () => {
			const tid = generateTid();
			expect(tid).toHaveLength(TID_LENGTH);
			expect(isValidTid(tid)).toBe(true);
		});

		it('避开已占用的 tid', () => {
			// 固定随机源：先产出全 a，再产出全 b
			let call = 0;
			const random = () => {
				call += 1;
				return call <= TID_LENGTH ? 0 : 0.5;
			};
			const taken = new Set<string>(['a'.repeat(TID_LENGTH)]);
			const tid = generateTid(taken, random);
			expect(tid).not.toBe('a'.repeat(TID_LENGTH));
			expect(isValidTid(tid)).toBe(true);
		});

		it('随机源退化时仍能返回合法且不冲突的 tid', () => {
			const constant = () => 0;
			const tid = generateTid(new Set(['a'.repeat(TID_LENGTH)]), constant);
			expect(isValidTid(tid)).toBe(true);
			expect(tid).not.toBe('a'.repeat(TID_LENGTH));
		});
	});

	describe('isValidTid', () => {
		it.each([
			['k3m9x2qa', true],
			['abcdefgh', true],
			['01234567', true],
			['ABCD1234', false],
			['abc', false],
			['abcdefghi', false],
			['abc-def1', false],
			['', false],
		])('%s → %s', (value, expected) => {
			expect(isValidTid(value)).toBe(expected);
		});

		it('undefined 非法', () => {
			expect(isValidTid(undefined)).toBe(false);
		});
	});
});
