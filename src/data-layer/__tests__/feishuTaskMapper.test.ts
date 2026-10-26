import {
    fromFeishuTask,
    toFeishuCompletionTime,
    toFeishuTaskPayload,
} from '../feishu-sync/taskMapper';
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

describe('feishu task mapper', () => {
    it('maps start and due dates with their precision', () => {
        const task = createTask({
            startDate: new Date(2026, 9, 16, 9, 15, 30),
            dueDate: new Date(2026, 9, 17, 8, 30, 30),
            datePrecision: { startDate: 'time', dueDate: 'day' },
        });

        expect(toFeishuTaskPayload(task)).toEqual({
            summary: 'task',
            start: {
                timestamp: String(new Date(2026, 9, 16, 9, 15).getTime()),
                is_all_day: false,
            },
            due: {
                timestamp: String(new Date(2026, 9, 17).getTime()),
                is_all_day: true,
            },
        });
    });

    it('can explicitly clear remote dates during updates', () => {
        expect(toFeishuTaskPayload(createTask(), { includeClearedDates: true })).toEqual({
            summary: 'task',
            start: null,
            due: null,
        });
    });

    it('maps completed_at as minute precision', () => {
        const completion = new Date(2026, 9, 16, 8, 30, 45);

        expect(toFeishuCompletionTime(createTask({
            completed: true,
            completionDate: completion,
        }))).toBe(String(new Date(2026, 9, 16, 8, 30).getTime()));

        expect(toFeishuCompletionTime(createTask())).toBe('0');
    });

    it('maps a remote task to local date, precision and completion updates', () => {
        expect(fromFeishuTask({
            task_guid: 'guid-1',
            summary: 'remote task',
            completed: true,
            completed_at: String(new Date(2026, 9, 16, 8, 30, 45).getTime()),
            start_time: {
                timestamp: String(new Date(2026, 9, 16, 9, 15, 30).getTime()),
                is_all_day: false,
            },
            due_time: {
                timestamp: String(new Date(2026, 9, 17, 19, 42, 30).getTime()),
                is_all_day: true,
            },
            priority: 'high',
        })).toEqual({
            feishuGuid: 'guid-1',
            description: 'remote task',
            completed: true,
            completionDate: new Date(2026, 9, 16, 8, 30),
            startDate: new Date(2026, 9, 16, 9, 15),
            dueDate: new Date(2026, 9, 17),
            priority: 'high',
            datePrecision: {
                completionDate: 'time',
                startDate: 'time',
                dueDate: 'day',
            },
        });
    });

    it('uses null to represent cleared remote dates and completion', () => {
        expect(fromFeishuTask({
            task_guid: 'guid-1',
            summary: 'remote task',
            completed: false,
            completed_at: '0',
        })).toEqual({
            feishuGuid: 'guid-1',
            description: 'remote task',
            completed: false,
            completionDate: null,
            dueDate: null,
            startDate: null,
        });
    });
});
