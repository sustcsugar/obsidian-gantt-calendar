/**
 * 树形标签数据结构定义
 * 支持多级标签层级：#parent/child/grandchild
 */

export interface TagNode {
    /** 标签名称（当前级别） */
    name: string;

    /** 完整路径 */
    fullPath: string;

    /** 层级深度 (0 = root, 1 = child, 2 = grandchild, etc.) */
    level: number;

    /** 子标签节点 */
    children: TagNode[];

    /** 父节点引用 */
    parent?: TagNode;

    /** 展开/折叠状态（UI交互用） */
    expanded?: boolean;

    /** 该标签及其子标签所属的任务计数 */
    taskCount?: number;
}

/**
 * 扁平化标签信息
 */
export interface FlatTag {
    /** 标签的完整路径 */
    path: string;

    /** 父标签路径（可选，用于继承） */
    parent?: string;

    /** 标签深度 */
    depth: number;

    /** 是否为叶子节点 */
    isLeaf: boolean;
}

/**
 * 标签过滤选项
 */
export interface TagFilterOptions {
    /** 选中的标签 */
    selectedTags: string[];

    /** 操作符：AND 表示全部匹配，OR 表示任意匹配 */
    operator: 'AND' | 'OR';

    /** 任务标签列表 */
    taskTags: string[];
}

/**
 * 标签匹配结果
 */
export interface TagMatchResult {
    /** 是否匹配 */
    matches: boolean;

    /** 匹配的标签列表 */
    matchedTags: string[];

    /** 匹配详情 */
    details: {
        exactMatches: string[];  // 完全匹配
        parentMatches: string[]; // 父标签匹配
    };
}
