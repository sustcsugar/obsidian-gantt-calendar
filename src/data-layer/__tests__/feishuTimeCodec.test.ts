import {
    fromFeishuCompletedAt,
    fromFeishuTaskTime,
    hasMixedFeishuPrecision,
    isSameFeishuTime,
    toFeishuCompletedAt,
    toFeishuTaskTime,
} from '../feishu-sync/feishuTimeCodec';
import type { GCTask } from '../../types';

function createTask(overrides: Partial<GCTask> = {}): GCTask {
    return {
        filePath: 'Tasks.md',
        fileName: 'Tasks.md',
        lineNumber: 1,
        content: '- [ ] task',
        description: 'task',
        completed: false,
        priority: 'normal',
        ...overrides,
    };
}

describe('feishuTimeCodec', () => {
    it('maps day precision to an all-day Feishu time at local midnight', () => {
        const date = new Date(2026, 9, 16, 19, 42, 58);

        expect(toFeishuTaskTime(date, 'day')).toEqual({
            timestamp: String(new Date(2026, 9, 16).getTime()),
            is_all_day: true,
        });
    });

    it('maps missing precision to day for legacy tasks', () => {
        const date = new Date(2026, 9, 16, 8, 30);

        expect(toFeishuTaskTime(date)).toEqual({
            timestamp: String(new Date(2026, 9, 16).getTime()),
            is_all_day: true,
        });
    });

    it('truncates timed tasks to minute precision', () => {
        const date = new Date(2026, 9, 16, 8, 30, 45, 123);

        expect(toFeishuTaskTime(date, 'time')).toEqual({
            timestamp: String(new Date(2026, 9, 16, 8, 30).getTime()),
            is_all_day: false,
        });
    });

    it('restores Feishu all-day and timed values with precision', () => {
        expect(fromFeishuTaskTime({
            timestamp: String(new Date(2026, 9, 16, 8, 30, 45).getTime()),
            is_all_day: true,
        })).toEqual({
            date: new Date(2026, 9, 16),
            precision: 'day',
        });

        expect(fromFeishuTaskTime({
            timestamp: String(new Date(2026, 9, 16, 8, 30, 45).getTime()),
            is_all_day: false,
        })).toEqual({
            date: new Date(2026, 9, 16, 8, 30),
            precision: 'time',
        });
    });

    it('treats same-minute remote timestamps as equivalent', () => {
        const local = new Date(2026, 9, 16, 8, 30);

        expect(isSameFeishuTime(local, 'time', {
            timestamp: String(new Date(2026, 9, 16, 8, 30, 59).getTime()),
            is_all_day: false,
        })).toBe(true);
        expect(isSameFeishuTime(local, 'time', {
            timestamp: String(new Date(2026, 9, 16, 8, 30).getTime()),
            is_all_day: true,
        })).toBe(false);
    });

    it('normalizes completion timestamps to minutes and "0" to absent', () => {
        const completion = new Date(2026, 9, 16, 8, 30, 45);

        expect(toFeishuCompletedAt(completion)).toBe(
            String(new Date(2026, 9, 16, 8, 30).getTime())
        );
        expect(fromFeishuCompletedAt(toFeishuCompletedAt(completion))).toEqual(
            new Date(2026, 9, 16, 8, 30)
        );
        expect(fromFeishuCompletedAt('0')).toBeUndefined();
    });

    it('detects mixed start/due precision that Feishu cannot represent', () => {
        expect(hasMixedFeishuPrecision(createTask({
            startDate: new Date(2026, 9, 16),
            dueDate: new Date(2026, 9, 17),
            datePrecision: { startDate: 'day', dueDate: 'time' },
        }))).toBe(true);

        expect(hasMixedFeishuPrecision(createTask({
            startDate: new Date(2026, 9, 16),
            dueDate: new Date(2026, 9, 17),
            datePrecision: { startDate: 'time', dueDate: 'time' },
        }))).toBe(false);
    });
});
