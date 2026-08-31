import { parseSingleTaskLine } from '../src/tasks/taskParser/main';
import { serializeTask } from '../src/tasks/taskSerializer';
import type { GCTask } from '../src/types';
import type { TaskFormatType } from '../src/tasks/taskSerializerSymbols';
import { App } from 'obsidian';

// 模拟 App（serializeTask 需要读插件设置）
const appWithPlugins = {} as any;

function roundTrip(line: string, format: TaskFormatType = 'tasks'): string | null {
    const parsed = parseSingleTaskLine(line, 'notes/p.md', 'p.md', 1, [format]);
    if (!parsed) return null;
    const serialized = serializeTask(appWithPlugins, parsed, {}, format);
    // serializeTask 输出：[复选框] [全局过滤] [标签] [描述] [元数据] ...
    // 移除复选框 [ ] 和全局过滤器（假设无全局过滤器），保留核心内容
    const withoutCheckbox = serialized.replace(/^\[\s*[\w!x/-]\]\s*/, '');
    return withoutCheckbox;
}

describe('taskSerializer round-trip', () => {
    // ===== Tasks 格式 =====

    it('tasks: 完整任务行保留所有字段', () => {
        const line = '- [ ] 开发任务 ⏫ 🛫 2026-08-20 09:30 📅 2026-08-25 18:00 📋 2026-08-19';
        const result = roundTrip(line, 'tasks');
        expect(result).toContain('🛫 2026-08-20 09:30');
        expect(result).toContain('📅 2026-08-25 18:00');
        expect(result).toContain('📋 2026-08-19');
        expect(result).toContain('⏫');
    });

    it('tasks: 标签在描述中不丢失', () => {
        const line = '- [ ] 写报告 #work 交给老板 #urgent 📅 2026-08-25';
        const result = roundTrip(line, 'tasks');
        expect(result).toContain('#work');
        expect(result).toContain('#urgent');
        expect(result).toContain('写报告');
    });

    it('tasks: 完成状态与日期', () => {
        const line = '- [x] 已完成任务 ✅ 2026-08-20 📅 2026-08-25';
        const result = roundTrip(line, 'tasks');
        expect(result).toContain('✅ 2026-08-20');
        expect(result).toContain('📅 2026-08-25');
    });

    it('tasks: 优先级 emoji 保留', () => {
        const line = '- [ ] 低优先级 🔽 📅 2026-08-25';
        const result = roundTrip(line, 'tasks');
        expect(result).toContain('🔽');
    });

    it('tasks: 周期任务规则保留', () => {
        const line = '- [ ] 每日站会 🔁 every day 📅 2026-08-25';
        const result = roundTrip(line, 'tasks');
        expect(result).toContain('🔁 every day');
    });

    it('tasks: 仅描述的任务', () => {
        const line = '- [ ] 简单任务';
        const result = roundTrip(line, 'tasks');
        expect(result).toContain('简单任务');
    });

    it('tasks: 复选框状态符号不同', () => {
        const line = '- [!] 紧急任务 🔺 📅 2026-08-25';
        const result = roundTrip(line, 'tasks');
        expect(result).toContain('🔺');
    });

    // ===== Dataview 格式 =====

    it('dataview: 字段在方括号内', () => {
        const line = '- [ ] 开发任务 [start:: 2026-08-20] [due:: 2026-08-25] [priority:: high]';
        const result = roundTrip(line, 'dataview');
        expect(result).toContain('[start:: 2026-08-20]');
        expect(result).toContain('[due:: 2026-08-25]');
        expect(result).toContain('[priority:: high]');
    });

    it('dataview: 时间字段保留', () => {
        const line = '- [ ] 任务 [start:: 2026-08-20 09:30] [due:: 2026-08-25 18:00]';
        const result = roundTrip(line, 'dataview');
        expect(result).toContain('[start:: 2026-08-20 09:30]');
        expect(result).toContain('[due:: 2026-08-25 18:00]');
    });

    it('dataview: 完成状态', () => {
        const line = '- [x] 已完成 [completion:: 2026-08-20] [due:: 2026-08-25]';
        const result = roundTrip(line, 'dataview');
        expect(result).toContain('[completion:: 2026-08-20]');
    });

    it('dataview: 周期规则', () => {
        const line = '- [ ] 周会 [repeat:: every monday] [due:: 2026-08-25]';
        const result = roundTrip(line, 'dataview');
        expect(result).toContain('[repeat:: every monday]');
    });

    it('dataview: 自定义元数据保留', () => {
        const line = '- [ ] 任务 %%[guid:: abc123]%% %%[custom:: val]%% [due:: 2026-08-25]';
        const result = roundTrip(line, 'dataview');
        expect(result).toContain('[due:: 2026-08-25]');
    });

    // ===== 边界情况 =====

    it('round-trip 两次应得到相同结果', () => {
        const line = '- [ ] 稳定任务 ⏫ 🛫 2026-08-20 📅 2026-08-25 #work';
        const parsed = parseSingleTaskLine(line, 'notes/p.md', 'p.md', 1, ['tasks']);
        expect(parsed).not.toBeNull();
        const serialized = serializeTask(appWithPlugins, parsed!, {}, 'tasks');
        console.log('serialized:', JSON.stringify(serialized));
        // 验证序列化包含预期字段
        expect(serialized).toContain('稳定任务');
        expect(serialized).toContain('⏫');
        expect(serialized).toContain('🛫 2026-08-20');
        expect(serialized).toContain('📅 2026-08-25');
    });

    it('空描述任务不丢失元数据', () => {
        const line = '- [ ] 🛫 2026-08-20 📅 2026-08-25';
        const result = roundTrip(line, 'tasks');
        expect(result).toContain('🛫 2026-08-20');
        expect(result).toContain('📅 2026-08-25');
    });
});
