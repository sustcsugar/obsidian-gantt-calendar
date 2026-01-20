/**
 * 飞书任务 Base 文件生成器
 *
 * 负责生成 Obsidian Base 配置文件，用于展示飞书任务
 */

import { TFile } from 'obsidian';
import { Logger } from '../../../../utils/logger';

/** Base配置选项 */
export interface BaseConfigOptions {
    /** Base文件名（不含扩展名） */
    fileName?: string;
    /** 关联的任务文件名 */
    taskFileName?: string;
}

/**
 * 飞书任务 Base 生成器
 */
export class FeishuTaskBase {
    /**
     * 生成Base文件的YAML内容
     * @param taskFileName 关联的任务文件名
     * @returns YAML内容
     */
    static generateBaseYaml(taskFileName: string = '飞书任务.md'): string {
        const yamlContent: Record<string, any> = {
            filters: {
                'or': [
                    { 'file.name': taskFileName.replace('.md', '') },
                    { 'file.name': taskFileName }
                ]
            },
            properties: {
                'task_id': {
                    displayName: '任务ID'
                },
                'summary': {
                    displayName: '标题'
                },
                'completed': {
                    displayName: '已完成'
                },
                'status': {
                    displayName: '状态'
                },
                'priority': {
                    displayName: '优先级'
                },
                'assignee': {
                    displayName: '负责人'
                },
                'start_time': {
                    displayName: '开始时间'
                },
                'due_time': {
                    displayName: '截止时间'
                },
                'created_at': {
                    displayName: '创建时间'
                },
                'completed_at': {
                    displayName: '完成时间'
                },
                'tasklist': {
                    displayName: '任务列表'
                },
                'sub_task_count': {
                    displayName: '子任务数'
                },
                'sub_task_completed_count': {
                    displayName: '已完成子任务'
                }
            },
            views: [
                {
                    type: 'table',
                    name: '全部任务',
                    filters: {
                        'file.name': taskFileName.replace('.md', '')
                    },
                    order: [
                        'completed',
                        'due_time',
                        'priority',
                        'summary'
                    ],
                    limit: 100
                },
                {
                    type: 'table',
                    name: '未完成任务',
                    filters: {
                        'and': [
                            { 'file.name': taskFileName.replace('.md', '') },
                            'completed == false'
                        ]
                    },
                    order: [
                        'due_time',
                        'priority',
                        'summary'
                    ],
                    limit: 100
                },
                {
                    type: 'table',
                    name: '已完成任务',
                    filters: {
                        'and': [
                            { 'file.name': taskFileName.replace('.md', '') },
                            'completed == true'
                        ]
                    },
                    order: [
                        '-completed_at',
                        'summary'
                    ],
                    limit: 100
                }
            ]
        };

        // 转换为YAML字符串格式
        return this.toYamlString(yamlContent);
    }

    /**
     * 将对象转换为YAML字符串
     * @param obj 对象
     * @param indent 缩进级别
     * @returns YAML字符串
     */
    private static toYamlString(obj: any, indent: number = 0): string {
        const padding = '  '.repeat(indent);
        let result = '';

        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined || value === null) {
                continue;
            }

            if (Array.isArray(value)) {
                result += `${padding}${key}:\n`;
                for (const item of value) {
                    if (typeof item === 'object') {
                        result += `${padding}- `;
                        const itemStr = this.toYamlString(item, 0);
                        // 移除第一行的缩进
                        result += itemStr.split('\n').map((line, i) =>
                            i === 0 ? line : padding + '  ' + line
                        ).join('\n');
                        result += '\n';
                    } else {
                        result += `${padding}- ${this.formatYamlValue(item)}\n`;
                    }
                }
            } else if (typeof value === 'object') {
                result += `${padding}${key}:\n`;
                result += this.toYamlString(value, indent + 1);
            } else {
                result += `${padding}${key}: ${this.formatYamlValue(value)}\n`;
            }
        }

        return result;
    }

    /**
     * 格式化YAML值
     * @param value 值
     * @returns 格式化后的字符串
     */
    private static formatYamlValue(value: any): string {
        if (typeof value === 'string') {
            // 如果是公式表达式（包含运算符、函数调用等），不加引号
            if (/^(?!.*"$).*(==|!=|>=|<=|>|<|\|\||&&|\..*\(|!|\+|-|\*|\/|%).*$/s.test(value) ||
                value.includes('file.') ||
                value.includes('formula.') ||
                value.includes('note.')) {
                return value;
            }
            // 包含特殊字符需要加引号
            if (/[:{}\[\],\n]/.test(value)) {
                return `"${value.replace(/"/g, '\\"')}"`;
            }
            return value;
        }
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        return String(value);
    }

    /**
     * 创建Base文件
     * @param app Obsidian App实例
     * @param options 配置选项
     * @returns 创建的文件
     */
    static async createBaseFile(
        app: any,
        options: BaseConfigOptions = {}
    ): Promise<TFile | null> {
        const fileName = options.fileName || '飞书任务';
        const taskFileName = options.taskFileName || '飞书任务.md';
        const filePath = `/${fileName}.base`;

        Logger.info('FeishuTaskBase', `Creating base file: ${filePath}`);

        // 检查文件是否已存在
        const existingFile = app.vault.getAbstractFileByPath(filePath) as TFile;
        if (existingFile) {
            Logger.info('FeishuTaskBase', `Base file already exists: ${filePath}`);
            return existingFile;
        }

        // 生成Base内容
        const content = this.generateBaseYaml(taskFileName);

        // 创建文件
        const newFile = await app.vault.create(filePath, content);
        Logger.info('FeishuTaskBase', `Created base file: ${filePath}`);

        return newFile;
    }

    /**
     * 更新现有Base文件
     * @param app Obsidian App实例
     * @param options 配置选项
     * @returns 更新后的文件
     */
    static async updateBaseFile(
        app: any,
        options: BaseConfigOptions = {}
    ): Promise<TFile | null> {
        const fileName = options.fileName || '飞书任务';
        const taskFileName = options.taskFileName || '飞书任务.md';
        const filePath = `/${fileName}.base`;

        Logger.info('FeishuTaskBase', `Updating base file: ${filePath}`);

        // 检查文件是否存在
        const existingFile = app.vault.getAbstractFileByPath(filePath) as TFile;
        if (!existingFile) {
            return this.createBaseFile(app, options);
        }

        // 生成新的Base内容
        const content = this.generateBaseYaml(taskFileName);

        // 更新文件
        await app.vault.modify(existingFile, content);
        Logger.info('FeishuTaskBase', `Updated base file: ${filePath}`);

        return existingFile;
    }
}
