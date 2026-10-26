import {
    areSameCompletionDates,
    areSameDatePrecisionMaps,
    areSameTaskDates,
} from '../sync/taskTimeComparison';

describe('task time comparison', () => {
    it('compares dates with their precision semantics', () => {
        const day = new Date(2026, 9, 16);
        const timed = new Date(2026, 9, 16);

        expect(areSameTaskDates(day, 'day', new Date(2026, 9, 16, 9, 30), 'day')).toBe(true);
        expect(areSameTaskDates(
            new Date(2026, 9, 16, 9, 30, 45),
            'time',
            new Date(2026, 9, 16, 9, 30, 59),
            'time'
        )).toBe(true);
        expect(areSameTaskDates(day, 'day', timed, 'time')).toBe(false);
        expect(areSameTaskDates(undefined, undefined, undefined, 'time')).toBe(true);
    });

    it('compares completion dates at minute precision', () => {
        expect(areSameCompletionDates(
            new Date(2026, 9, 16, 8, 30, 10),
            new Date(2026, 9, 16, 8, 30, 59)
        )).toBe(true);
        expect(areSameCompletionDates(
            new Date(2026, 9, 16, 8, 30),
            new Date(2026, 9, 16, 8, 31)
        )).toBe(false);
    });

    it('treats missing precision as day and compares maps field by field', () => {
        expect(areSameDatePrecisionMaps(undefined, { dueDate: 'day' })).toBe(true);
        expect(areSameDatePrecisionMaps(
            { dueDate: 'day' },
            { startDate: 'day', dueDate: 'day' }
        )).toBe(true);
        expect(areSameDatePrecisionMaps(
            { dueDate: 'day' },
            { dueDate: 'time' }
        )).toBe(false);
    });
});