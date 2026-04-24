/**
 * 正则表达式常量定义
 * 用于解析任务行和列表项
 */
export class RegularExpressions {
    // ==================== 基础格式常量 ====================

    /** 日期格式：YYYY-MM-DD */
    public static readonly dateFormat = 'YYYY-MM-DD';

    /** 日期时间格式：YYYY-MM-DD HH:mm */
    public static readonly dateTimeFormat = 'YYYY-MM-DD HH:mm';

    // ==================== 时间精度复用片段 ====================

    /** 可选的时间部分正则片段（空格 + HH:mm），用于组合日期正则 */
    private static readonly OPTIONAL_TIME = '(?: \\d{2}:\\d{2})?';

    // ==================== 基础正则表达式 ====================

    /**
     * 缩进正则
     * 匹配列表标记前的缩进（包括 > 用于可能的嵌套引用或 Obsidian 提示框）
     * 匹配示例：空格、制表符、> 符号
     */
    public static readonly indentationRegex = /^([\s\t>]*)/;

    /**
     * 列表标记正则
     * 匹配 - * + 无序列表标记，或数字列表标记（如 1. 或 1)）
     * 匹配示例：-, *, +, 1., 1)
     */
    public static readonly listMarkerRegex = /([-*+]|[0-9]+[.)])/;

    /**
     * 复选框正则
     * 匹配复选框并捕获内部的状态字符
     * 匹配示例：[x], [ ], [/], [-]
     */
    public static readonly checkboxRegex = /\[(.)\]/u;

    /**
     * 复选框后的内容正则
     * 匹配复选框后的任务描述内容
     */
    public static readonly afterCheckboxRegex = / *(.*)/u;

    // ==================== 组合正则表达式 ====================

    /**
     * 任务行正则
     * 组合基础正则，用于解析完整的任务行
     * 匹配顺序：
     * 1. 缩进 (indentationRegex)
     * 2. 列表标记 (listMarkerRegex)
     * 3. 空格
     * 4. 复选框 (checkboxRegex)
     * 5. 复选框后的内容 (afterCheckboxRegex)
     *
     * 匹配示例：
     * - [ ] 任务内容
     *   - [x] 已完成任务
     * > - [ ] 引用块中的任务
     * 1. [ ] 数字列表任务
     */
    public static readonly taskRegex = new RegExp(
        RegularExpressions.indentationRegex.source +
            RegularExpressions.listMarkerRegex.source +
            ' +' +
            RegularExpressions.checkboxRegex.source +
            RegularExpressions.afterCheckboxRegex.source,
        'u',
    );

    /**
     * 非任务行正则
     * 用于"创建或编辑任务"命令，解析可能存在的缩进和状态
     * 与 taskRegex 的区别：列表标记和复选框是可选的
     * 匹配顺序：
     * 1. 缩进 (indentationRegex)
     * 2. 列表标记（可选）(listMarkerRegex)
     * 3. 复选框（可选）(checkboxRegex)
     * 4. 复选框后的内容 (afterCheckboxRegex)
     *
     * 匹配示例：
     * - [ ] 有复选框的行
     * - 没有复选框的列表项
     * 普通文本行
     * > 嵌套引用行
     */
    public static readonly nonTaskRegex = new RegExp(
        RegularExpressions.indentationRegex.source +
            RegularExpressions.listMarkerRegex.source +
            '? *(' +
            RegularExpressions.checkboxRegex.source +
            ')?' +
            RegularExpressions.afterCheckboxRegex.source,
        'u',
    );

    // ==================== Tasks 格式正则表达式 ====================

    /**
     * Tasks 格式正则表达式集合
     * 基于 Obsidian Tasks 插件的 emoji 格式
     * 文档：https://github.com/obsidian-tasks-group/obsidian-tasks
     */
    public static readonly Tasks = {
        /**
         * 优先级 emoji 符号常量
         * 用于匹配和序列化任务优先级
         */
        prioritySymbols: {
            /** 最高优先级 🔺 */
            highest: '🔺',
            /** 高优先级 ⏫ */
            high: '⏫',
            /** 中优先级 🔼 */
            medium: '🔼',
            /** 低优先级 🔽 */
            low: '🔽',
            /** 最低优先级 ⏬ */
            lowest: '⏬',
        } as const,

        /**
         * 日期 emoji 符号常量
         * 用于匹配和序列化任务日期字段
         */
        dateSymbols: {
            /** 创建日期 ➕ */
            created: '➕',
            /** 开始日期 🛫 */
            start: '🛫',
            /** 计划日期 ⏳ (或 ⌛) */
            scheduled: '⏳',
            /** 截止日期 📅 (或 📆、🗓) */
            due: '📅',
            /** 取消日期 ❌ */
            cancelled: '❌',
            /** 完成日期 ✅ */
            completion: '✅',
        } as const,

        /**
         * 周期任务符号常量
         * 用于匹配和序列化任务周期规则
         */
        repeatSymbols: {
            /** 周期任务 🔁 */
            repeat: '🔁',
        } as const,

        /**
         * 优先级匹配正则
         * 捕获组1为优先级 emoji 符号
         * 使用全局匹配以查找所有优先级标记（虽然任务只应有一个）
         *
         * @example
         * "任务 ⏫" -> 匹配 "⏫"
         * "🔺 重要任务" -> 匹配 "🔺"
         */
        priorityRegex: /\s*(🔺|⏫|🔼|🔽|⏬)\s*/g,

        /**
         * 创建日期正则
         * 匹配：➕ YYYY-MM-DD
         * 捕获组1为日期字符串
         *
         * @example
         * "➕ 2024-01-15" -> 匹配，捕获 "2024-01-15"
         * "任务 ➕2024-01-15" -> 匹配，捕获 "2024-01-15"
         */
        createdDateRegex: /➕\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/g,

        /**
         * 开始日期正则
         * 匹配：🛫 YYYY-MM-DD
         * 捕获组1为日期字符串
         *
         * @example
         * "🛫 2024-01-15" -> 匹配，捕获 "2024-01-15"
         */
        startDateRegex: /🛫\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/g,

        /**
         * 计划日期正则
         * 匹配：⏳ YYYY-MM-DD 或 ⌛ YYYY-MM-DD
         * 两种 emoji 都表示计划日期（scheduled）
         * 捕获组1为日期字符串
         *
         * @example
         * "⏳ 2024-01-15" -> 匹配，捕获 "2024-01-15"
         * "⌛ 2024-01-15" -> 匹配，捕获 "2024-01-15"
         */
        scheduledDateRegex: /(?:⏳|⌛)\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/g,

        /**
         * 截止日期正则
         * 匹配：📅 YYYY-MM-DD 或 📆 YYYY-MM-DD 或 🗓 YYYY-MM-DD
         * 三种 emoji 都表示截止日期（due）
         * 捕获组1为日期字符串
         *
         * @example
         * "📅 2024-01-15" -> 匹配，捕获 "2024-01-15"
         * "📆2024-01-15" -> 匹配，捕获 "2024-01-15"
         */
        dueDateRegex: /(?:📅|📆|🗓)\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/g,

        /**
         * 取消日期正则
         * 匹配：❌ YYYY-MM-DD
         * 捕获组1为日期字符串
         *
         * @example
         * "❌ 2024-01-15" -> 匹配，捕获 "2024-01-15"
         */
        cancelledDateRegex: /❌\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/g,

        /**
         * 完成日期正则
         * 匹配：✅ YYYY-MM-DD
         * 捕获组1为日期字符串
         *
         * @example
         * "✅ 2024-01-15" -> 匹配，捕获 "2024-01-15"
         */
        completionDateRegex: /✅\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/g,

        /**
         * 周期任务规则正则
         * 匹配：🔁 every <规则>
         * 规则必须以 every 开头，支持 when done 后缀
         * 捕获组1为完整规则字符串
         *
         * @example
         * "🔁 every day" -> 匹配，捕获 "every day"
         * "🔁every week on Monday" -> 匹配，捕获 "every week on Monday"
         * "🔁 every 3 days when done" -> 匹配，捕获 "every 3 days when done"
         */
        repeatRegex: /🔁\s*(every\s+.+?)(?=\s*(?:➕|🛫|⏳|📅|❌|✅|⏫|🔺|🔼|🔽|⏬|$))/gi,

        /**
         * 任意日期字段正则
         * 用于快速检测任务是否包含 Tasks 格式的日期标记
         * 捕获组1为日期 emoji，捕获组2为日期值
         *
         * @example
         * "任务 📅 2024-01-15" -> 匹配
         * "任务 ➕2024-01-15 ✅2024-01-20" -> 可多次匹配
         */
        anyDateFieldRegex: /(➕|🛫|⏳|📅|❌|✅)\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/g,

        /**
         * 任意优先级正则
         * 用于快速检测任务是否包含优先级 emoji
         *
         * @example
         * "任务 ⏫" -> 匹配
         * "🔺 重要" -> 匹配
         */
        anyPriorityRegex: /[🔺⏫🔼🔽⏬]/,

        /**
         * 格式检测正则
         * 综合检测任务是否包含 Tasks 格式标记
         * 匹配任意日期字段、优先级 emoji 或周期任务标记
         * 用于快速判断任务是否使用 Tasks 格式
         *
         * @example
         * "- [ ] 任务 ⏫ 📅 2024-01-15" -> 匹配（Tasks 格式）
         * "- [ ] 任务 🔁 every day" -> 匹配（Tasks 格式）
         * "- [ ] 普通任务" -> 不匹配
         */
        formatDetectionRegex: /([➕🛫⏳📅❌✅])\s*\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?|[🔺⏫🔼🔽⏬]|🔁\s+every/,
    } as const;

    // ==================== Dataview 格式正则表达式 ====================

    /**
     * Dataview 格式正则表达式集合
     * 基于 Dataview 插件的 inline field 格式 [key:: value]
     * 文档：https://blacksmithgu.github.io/obsidian-dataview/
     */
    public static readonly Dataview = {
        /**
         * 优先级值常量
         * Dataview 格式使用文本值表示优先级
         */
        priorityValues: ['highest', 'high', 'medium', 'normal', 'low', 'lowest'] as const,

        /**
         * 日期字段名常量
         * Dataview 格式的字段名映射
         */
        dateFieldNames: {
            /** 创建日期字段名 */
            created: 'created',
            /** 开始日期字段名 */
            start: 'start',
            /** 计划日期字段名 */
            scheduled: 'scheduled',
            /** 截止日期字段名 */
            due: 'due',
            /** 取消日期字段名 */
            cancelled: 'cancelled',
            /** 完成日期字段名 */
            completion: 'completion',
        } as const,

        /**
         * 优先级字段正则
         * 匹配：[priority:: highest|high|medium|low|lowest]
         * 捕获组1为优先级文本值
         * 不区分大小写
         *
         * @example
         * "[priority:: high]" -> 匹配，捕获 "high"
         * "[priority::HIGHEST]" -> 匹配，捕获 "HIGHEST"
         */
        priorityRegex: /\[priority::\s*(highest|high|medium|low|lowest)\]/gi,

        /**
         * 创建日期正则
         * 匹配：[created:: YYYY-MM-DD]
         * 捕获组1为日期字符串
         *
         * @example
         * "[created:: 2024-01-15]" -> 匹配，捕获 "2024-01-15"
         * "[created::2024-01-15]" -> 匹配，捕获 "2024-01-15"
         */
        createdDateRegex: /\[created::\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\]/gi,

        /**
         * 开始日期正则
         * 匹配：[start:: YYYY-MM-DD]
         * 捕获组1为日期字符串
         *
         * @example
         * "[start:: 2024-01-15]" -> 匹配，捕获 "2024-01-15"
         */
        startDateRegex: /\[start::\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\]/gi,

        /**
         * 计划日期正则
         * 匹配：[scheduled:: YYYY-MM-DD]
         * 捕获组1为日期字符串
         *
         * @example
         * "[scheduled:: 2024-01-15]" -> 匹配，捕获 "2024-01-15"
         */
        scheduledDateRegex: /\[scheduled::\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\]/gi,

        /**
         * 截止日期正则
         * 匹配：[due:: YYYY-MM-DD]
         * 捕获组1为日期字符串
         *
         * @example
         * "[due:: 2024-01-15]" -> 匹配，捕获 "2024-01-15"
         */
        dueDateRegex: /\[due::\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\]/gi,

        /**
         * 取消日期正则
         * 匹配：[cancelled:: YYYY-MM-DD]
         * 捕获组1为日期字符串
         *
         * @example
         * "[cancelled:: 2024-01-15]" -> 匹配，捕获 "2024-01-15"
         */
        cancelledDateRegex: /\[cancelled::\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\]/gi,

        /**
         * 完成日期正则
         * 匹配：[completion:: YYYY-MM-DD]
         * 捕获组1为日期字符串
         *
         * @example
         * "[completion:: 2024-01-15]" -> 匹配，捕获 "2024-01-15"
         */
        completionDateRegex: /\[completion::\s*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\]/gi,

        /**
         * 周期任务字段正则
         * 匹配：[repeat:: every <规则>]
         * 捕获组1为规则字符串
         *
         * @example
         * "[repeat:: every day]" -> 匹配，捕获 "every day"
         * "[repeat::every week on Monday when done]" -> 匹配，捕获 "every week on Monday when done"
         */
        repeatRegex: /\[repeat::\s*(every\s+.+?)\]/gi,

        /**
         * 综合字段正则
         * 匹配任意 Dataview 字段
         * 捕获组1为字段名，捕获组2为字段值
         *
         * @example
         * "[priority:: high] [due:: 2024-01-15]" -> 可多次匹配
         */
        anyFieldRegex: /\[(priority|created|start|scheduled|due|cancelled|completion|repeat)::\s*([^\]]+)\]/gi,

        /**
         * 格式检测正则
         * 快速检测任务是否包含 Dataview 格式标记
         * 用于判断任务是否使用 Dataview 格式
         *
         * @example
         * "- [ ] 任务 [priority:: high] [due:: 2024-01-15]" -> 匹配（Dataview 格式）
         * "- [ ] 任务 [repeat:: every day]" -> 匹配（Dataview 格式）
         * "- [ ] 普通任务" -> 不匹配
         */
        formatDetectionRegex: /\[(priority|created|start|scheduled|due|cancelled|completion|repeat)::\s*[^\]]+\]/i,
    } as const;

    // ==================== 描述提取正则 ====================

    /**
     * 描述提取正则表达式集合
     * 用于从任务内容中提取纯文本描述，移除所有元数据标记
     */
    public static readonly DescriptionExtraction = {
        /**
         * 移除 Tasks 优先级 emoji
         * 匹配任意优先级 emoji 及其周围的空格
         *
         * @example
         * "任务 ⏫ 内容" -> "任务  内容"
         * "🔺重要任务" -> "重要任务"
         */
        removePriorityEmoji: /\s*(🔺|⏫|🔼|🔽|⏬)\s*/g,

        /**
         * 移除 Tasks 日期属性
         * 匹配日期 emoji + 空格 + 日期值 及其周围的空格
         *
         * @example
         * "任务 📅 2024-01-15 内容" -> "任务  内容"
         * "➕2024-01-15" -> ""
         */
        removeTasksDate: /\s*(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?\s*/g,

        /**
         * 移除 Dataview 字段
         * 匹配 [field:: value] 格式的字段及其周围的空格
         *
         * @example
         * "任务 [priority:: high] 内容" -> "任务  内容"
         * "[due:: 2024-01-15]" -> ""
         */
        removeDataviewField: /\s*\[(priority|created|start|scheduled|due|cancelled|completion|repeat)::[^\]]+\]\s*/gi,

        /**
         * 移除 Tasks 周期任务属性
         * 匹配 🔁 every <规则> 及其周围的空格
         *
         * @example
         * "任务 🔁 every day 内容" -> "任务  内容"
         * "🔁every week" -> ""
         */
        removeTasksRepeat: /\s*🔁\s+every\s+(?:(?!🔺|⏫|🔼|🔽|⏬|➕|🛫|⏳|📅|❌|✅|\[).)+?(?=\s*(?:🔺|⏫|🔼|🔽|⏬|➕|🛫|⏳|📅|❌|✅|\[|$))/gi,

        /**
         * 移除 Dataview 周期任务字段
         * 匹配 [repeat:: every <规则>] 及其周围的空格
         *
         * @example
         * "任务 [repeat:: every day] 内容" -> "任务  内容"
         * "[repeat:: every week]" -> ""
         */
        removeDataviewRepeat: /\s*\[repeat::\s+every\s+(?:(?!\]).)+?](?=\s*(?:\[|$))/gi,

        /**
         * 折叠多余空格
         * 将两个或更多连续空格替换为单个空格
         *
         * @example
         * "任务    内容" -> "任务 内容"
         */
        collapseWhitespace: /\s{2,}/g,

        /**
         * 移除标签
         * 匹配 #tag 格式的标签及其后的空格（用于从描述中移除）
         *
         * 注意：正则中包含 \s* 以匹配标签后的空格
         * 这与现有的 removePriorityEmoji、removeTasksDate 保持一致
         *
         * @example
         * "任务 #work #urgent" -> "任务  "
         * "#前端 开发任务" -> " 开发任务"
         * "完成任务#tag" -> "完成任务"
         */
        removeTags: /#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*/g,

        /**
         * 匹配标签（用于提取标签内容）
         * 与 removeTags 的区别：不包含 \s*，保留原始位置信息
         *
         * @example
         * "任务 #work #urgent" -> 可以提取出 ["work", "urgent"]
         */
        matchTags: /#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)/g,

        /**
         * 提取 %%content%% ticktick 内容（非贪婪，支持多个块）
         * 捕获组1为 ticktick 内容（不含 %% 分隔符）
         *
         * @example
         * "任务 %%重要备注%%" -> 匹配，捕获 "重要备注"
         * "任务 %%A%% 中 %%B%%" -> 可多次匹配，捕获 "A" 和 "B"
         */
        matchTicktick: /%%(.+?)%%/g,

        /**
         * 移除 %%content%% ticktick 块及其周围的空格
         * 与 removePriorityEmoji、removeTasksDate 等保持一致的移除模式
         *
         * @example
         * "任务 %%备注%% 内容" -> "任务  内容"
         * "%%备注%%" -> ""
         */
        removeTicktick: /\s*%%.+?%%\s*/g,
    } as const;

    // ==================== 复选框状态正则 ====================

    /**
     * 复选框状态常量和正则
     * 用于解析和判断任务的完成状态
     */
    public static readonly Checkbox = {
        /** 未完成状态字符：空格 */
        INCOMPLETE: ' ',

        /** 完成状态字符：小写 x */
        COMPLETED: 'x',

        /** 取消状态字符：斜杠 */
        CANCELLED: '/',

        /**
         * 未完成正则
         * 匹配 [ ] 格式
         *
         * @example
         * "[ ]" -> 匹配
         * "[x]" -> 不匹配
         */
        incompleteRegex: /^\[ \]$/,

        /**
         * 完成正则
         * 匹配 [x] 或 [X] 格式
         *
         * @example
         * "[x]" -> 匹配
         * "[X]" -> 匹配
         * "[ ]" -> 不匹配
         */
        completedRegex: /^\[[xX]\]$/,

        /**
         * 取消正则
         * 匹配 [/] 格式
         *
         * @example
         * "[/]" -> 匹配
         * "[ ]" -> 不匹配
         */
        cancelledRegex: /^\[\/\]$/,
    } as const;

    // ==================== 链接解析正则 ====================

    /**
     * 链接解析正则表达式集合
     * 用于从任务内容中识别和提取各种类型的链接
     * 支持任务卡片文本的富链接渲染
     */
    public static readonly Links = {
        /**
         * Obsidian 双向链接正则
         * 匹配：[[note]] 或 [[note|alias]]
         * 捕获组1为链接路径（note）
         * 捕获组2为可选的显示文本（alias）
         *
         * @example
         * "[[MyNote]]" -> 匹配，捕获组1: "MyNote"，捕获组2: undefined
         * "[[MyNote|我的笔记]]" -> 匹配，捕获组1: "MyNote"，捕获组2: "我的笔记"
         * "[[Folder/Note]]" -> 匹配，支持嵌套路径
         */
        obsidianLinkRegex: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,

        /**
         * Markdown 格式链接正则
         * 匹配：[text](url)
         * 捕获组1为显示文本（text）
         * 捕获组2为链接地址（url）
         *
         * @example
         * "[Google](https://google.com)" -> 匹配，捕获组1: "Google"，捕获组2: "https://google.com"
         * "[下载文件](https://example.com/file.pdf)" -> 匹配，捕获组1: "下载文件"，捕获组2: "https://example.com/file.pdf"
         */
        markdownLinkRegex: /\[([^\]]+)\]\(([^)]+)\)/g,

        /**
         * 纯URL链接正则
         * 匹配：http:// 或 https:// 开头的URL
         * 捕获组1为完整URL
         * 排除包含在引号或尖括号中的URL（避免在HTML标签中匹配）
         *
         * @example
         * "https://google.com" -> 匹配，捕获组1: "https://google.com"
         * "访问 http://example.com 查看" -> 匹配，捕获组1: "http://example.com"
         * "<a href=\"https://example.com\">" -> 不匹配（在引号中）
         */
        urlLinkRegex: /(https?:\/\/[^\s<>"\)]+)/g,

        /**
         * 综合链接检测正则
         * 快速检测文本中是否包含任意类型的链接
         * 用于判断是否需要进行富文本渲染
         *
         * @example
         * "访问 [[首页]] 或 https://example.com" -> 匹配（包含链接）
         * "普通文本内容" -> 不匹配
         */
        anyLinkRegex: /(\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)]+)\)|https?:\/\/[^\s<>"\)]+)/,
    } as const;
}
