/**
 * timelineModel 性能基准（非 jest 用例，node 直跑）
 *
 * 模拟真实规模库（默认 2500 任务）下的模型构建耗时，
 * 回归监控周视图/日视图渲染前的纯函数层开销。
 *
 * 运行：npm run bench
 */

import {
	buildWeekTimelineModel,
	buildDayTimelineModel,
} from '../../src/ui/views/week/timelineModel';
import type { GCTask as GCTaskType } from '../../src/types';

type Task = GCTaskType;

/** 任务形态分布（模拟真实混合库）：点 55% / 同日区间 20% / 跨夜 5% / ≥24h 15% / 双day 5% */
const SHAPES = ['point', 'sameday', 'overnight', 'long', 'allday'] as const;

function makeTasks(n: number, weekStart: Date): Task[] {
	const tasks: Task[] = [];
	for (let i = 0; i < n; i++) {
		const shape = SHAPES[i % SHAPES.length];
		// 70% 落在本周，30% 在周外（更接近真实全库）
		const inWeek = i % 10 < 7;
		const dayOffset = inWeek ? (i % 7) : 7 + (i % 30);
		const day = new Date(weekStart);
		day.setDate(day.getDate() + dayOffset);
		const lineNumber = i;

		const base = {
			filePath: `f${Math.floor(i / 200)}.md`,
			fileName: `f${Math.floor(i / 200)}.md`,
			lineNumber,
			content: '',
			description: `bench task ${i}`,
			completed: i % 4 === 0,
			priority: 'normal',
		};

		switch (shape) {
			case 'point':
				tasks.push({ ...base, dueDate: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8 + (i % 12), (i % 4) * 15), datePrecision: { dueDate: 'time' } });
				break;
			case 'sameday': {
				const h = 9 + (i % 8);
				tasks.push({
					...base,
					startDate: new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0),
					dueDate: new Date(day.getFullYear(), day.getMonth(), day.getDate(), h + 1 + (i % 3), 30),
					datePrecision: { startDate: 'time', dueDate: 'time' },
				});
				break;
			}
			case 'overnight': {
				tasks.push({
					...base,
					startDate: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 22, 0),
					dueDate: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 3, 0),
					datePrecision: { startDate: 'time', dueDate: 'time' },
				});
				break;
			}
			case 'long':
				tasks.push({
					...base,
					startDate: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0),
					dueDate: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 2 + (i % 5), 18, 0),
					datePrecision: { startDate: 'time', dueDate: 'time' },
				});
				break;
			case 'allday':
				tasks.push({
					...base,
					startDate: new Date(day.getFullYear(), day.getMonth(), day.getDate()),
					dueDate: new Date(day.getFullYear(), day.getMonth(), day.getDate() + (i % 4)),
					datePrecision: { startDate: 'day', dueDate: 'day' },
				});
				break;
		}
	}
	return tasks;
}

function bench(name: string, fn: () => unknown, iterations: number): { name: string; avgMs: number; totalMs: number } {
	// 预热一次（JIT / 内联缓存）
	fn();
	const t0 = process.hrtime.bigint();
	for (let i = 0; i < iterations; i++) fn();
	const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
	return { name, avgMs: totalMs / iterations, totalMs };
}

function main(): void {
	const N = Number(process.argv[2] ?? 2500);
	const ITER = 50;
	const weekStart = new Date(2026, 8, 7);
	const midWeek = new Date(2026, 8, 9);
	const tasks = makeTasks(N, weekStart);

	console.log(`timelineModel bench — ${N} tasks × ${ITER} iterations\n`);

	const rows = [
		bench('buildWeekTimelineModel', () => buildWeekTimelineModel(tasks, weekStart, 'startDate', 'dueDate', 'dueDate'), ITER),
		bench('buildDayTimelineModel  ', () => buildDayTimelineModel(tasks, midWeek, 'startDate', 'dueDate', 'dueDate'), ITER),
	];

	for (const r of rows) {
		console.log(`${r.name}  avg ${r.avgMs.toFixed(2)}ms  (total ${r.totalMs.toFixed(0)}ms)`);
	}

	// 参考阈值：周模型 2500 任务应在 15ms 内（单次构建影响 <1 帧）
	const weekAvg = rows[0].avgMs;
	const BUDGET_MS = 15;
	const verdict = weekAvg <= BUDGET_MS ? 'PASS' : 'FAIL';
	console.log(`\nweek model ${weekAvg.toFixed(2)}ms vs budget ${BUDGET_MS}ms → ${verdict}`);
	if (verdict === 'FAIL') process.exit(1);
}

main();
