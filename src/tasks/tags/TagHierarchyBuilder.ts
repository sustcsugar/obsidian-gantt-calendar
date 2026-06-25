/**
 * 树形标签构建和查询工具
 * 负责从平面标签数组构建树，以及进行各种层级查询操作
 */

import { TagNode, TagMatchResult } from './TagHierarchy';

/**
 * 从平面标签数组构建树形结构
 *
 * @example
 * buildTagHierarchy(['work', 'project/frontend', 'project/backend', 'urgent'])
 * 返回:
 * [
 *   { name: 'work', fullPath: 'work', level: 0, children: [] },
 *   {
 *     name: 'project',
 *     fullPath: 'project',
 *     level: 0,
 *     children: [
 *       { name: 'frontend', fullPath: 'project/frontend', level: 1, children: [] },
 *       { name: 'backend', fullPath: 'project/backend', level: 1, children: [] }
 *     ]
 *   },
 *   { name: 'urgent', fullPath: 'urgent', level: 0, children: [] }
 * ]
 */
export function buildTagHierarchy(flatTags: string[]): TagNode[] {
    const roots: TagNode[] = [];
    const nodeMap = new Map<string, TagNode>();

    // 第一步：创建所有节点（包括中间节点）
    const allPaths = new Set<string>();
    for (const tag of flatTags) {
        const parts = tag.split('/');
        let path = '';
        for (const part of parts) {
            path = path ? `${path}/${part}` : part;
            allPaths.add(path);
        }
    }

    // 第二步：为所有路径创建节点
    const sortedPaths = Array.from(allPaths).sort((a, b) => {
        // 按路径长度和字母顺序排序，确保父节点在子节点之前创建
        if (a.split('/').length !== b.split('/').length) {
            return a.split('/').length - b.split('/').length;
        }
        return a.localeCompare(b);
    });

    for (const path of sortedPaths) {
        if (nodeMap.has(path)) {
            continue;
        }

        const parts = path.split('/');
        const name = parts[parts.length - 1];
        const level = parts.length - 1;
        const parentPath = level > 0 ? parts.slice(0, -1).join('/') : undefined;

        const node: TagNode = {
            name,
            fullPath: path,
            level,
            children: [],
            expanded: false, // 默认折叠
        };

        nodeMap.set(path, node);

        // 处理父子关系
        if (parentPath) {
            const parentNode = nodeMap.get(parentPath);
            if (parentNode) {
                node.parent = parentNode;
                parentNode.children.push(node);
            }
        } else {
            // 根节点
            roots.push(node);
        }
    }

    return roots;
}

/**
 * 将树形结构转换回平面标签数组
 *
 * @param roots 根节点数组
 * @param includeIntermediates 是否包含中间节点（如 project，即使用户没有直接标记）
 * @returns 平面标签数组
 *
 * @example
 * 如果 includeIntermediates = true，会返回所有路径
 * 如果 includeIntermediates = false，仅返回叶子节点（最底层）
 */
export function flattenTagHierarchy(
    roots: TagNode[],
    includeIntermediates: boolean = true
): string[] {
    const result: string[] = [];

    function traverse(node: TagNode) {
        if (includeIntermediates || node.children.length === 0) {
            // includeIntermediates = true 时包含所有节点
            // includeIntermediates = false 时只包含叶子节点
            result.push(node.fullPath);
        }
        for (const child of node.children) {
            traverse(child);
        }
    }

    for (const root of roots) {
        traverse(root);
    }

    return result;
}

/**
 * 获取标签的完整路径数组
 *
 * @example
 * getTagPath('project/frontend') -> ['project', 'frontend']
 * getTagPath('work') -> ['work']
 */
export function getTagPath(tag: string): string[] {
    return tag.split('/');
}

/**
 * 给定选中的标签，展开其所有子标签
 *
 * @param selectedTags 用户选中的标签列表
 * @param tree 完整的标签树（可选，如果不提供则内部构建）
 * @returns 展开后的标签列表（包含所有子标签）
 *
 * @example
 * expandTagHierarchy(['project', 'work'])
 * 如果 project 有子标签 project/frontend 和 project/backend
 * 返回 ['project', 'project/frontend', 'project/backend', 'work']
 */
export function expandTagHierarchy(
    selectedTags: string[],
    tree?: TagNode[]
): string[] {
    const expanded = new Set<string>();

    function addTagAndChildren(tag: string) {
        if (expanded.has(tag)) {
            return;
        }
        expanded.add(tag);

        // 递归添加所有子标签
        for (const selected of selectedTags) {
            if (selected.startsWith(tag + '/')) {
                addTagAndChildren(selected);
            }
        }
    }

    for (const tag of selectedTags) {
        addTagAndChildren(tag);
    }

    return Array.from(expanded);
}

/**
 * 判断任务标签是否与筛选条件匹配
 *
 * @param taskTags 任务所拥有的标签列表
 * @param filterTags 筛选条件中选中的标签
 * @param operator AND 表示任务需要包含所有筛选标签，OR 表示包含任意一个即可
 * @returns 匹配结果
 *
 * @example
 * matchesTagFilter(
 *   ['project/frontend', 'urgent'],
 *   ['project'],
 *   'OR'
 * ) -> { matches: true, matchedTags: ['project/frontend'], ... }
 */
export function matchesTagFilter(
    taskTags: string[],
    filterTags: string[],
    operator: 'AND' | 'OR' = 'OR'
): TagMatchResult {
    const matchedTags: string[] = [];
    const exactMatches: string[] = [];
    const parentMatches: string[] = [];

    for (const filterTag of filterTags) {
        for (const taskTag of taskTags) {
            if (taskTag === filterTag) {
                // 完全匹配
                if (!exactMatches.includes(taskTag)) {
                    exactMatches.push(taskTag);
                    matchedTags.push(taskTag);
                }
            } else if (taskTag.startsWith(filterTag + '/')) {
                // 子标签匹配（filterTag 是 taskTag 的父标签）
                if (!parentMatches.includes(taskTag)) {
                    parentMatches.push(taskTag);
                    matchedTags.push(taskTag);
                }
            }
        }
    }

    let matches = false;
    if (operator === 'OR') {
        // 任意匹配即可
        matches = matchedTags.length > 0;
    } else {
        // AND 操作：需要所有筛选条件都有匹配
        matches = filterTags.every((filterTag) =>
            matchedTags.some((tag) => tag === filterTag || tag.startsWith(filterTag + '/'))
        );
    }

    return {
        matches,
        matchedTags,
        details: {
            exactMatches,
            parentMatches,
        },
    };
}

/**
 * 在树中查找指定路径的节点
 *
 * @param roots 根节点数组
 * @param path 要查找的路径
 * @returns 找到的节点，或 undefined
 */
export function findNodeByPath(roots: TagNode[], path: string): TagNode | undefined {
    for (const root of roots) {
        if (root.fullPath === path) {
            return root;
        }
        const found = findNodeInSubtree(root, path);
        if (found) {
            return found;
        }
    }
    return undefined;
}

/**
 * 在子树中查找节点
 */
function findNodeInSubtree(node: TagNode, path: string): TagNode | undefined {
    for (const child of node.children) {
        if (child.fullPath === path) {
            return child;
        }
        const found = findNodeInSubtree(child, path);
        if (found) {
            return found;
        }
    }
    return undefined;
}

/**
 * 获取树中指定节点的所有祖先路径
 *
 * @example
 * getAncestorPaths('project/frontend/api')
 * -> ['project', 'project/frontend']
 */
export function getAncestorPaths(fullPath: string): string[] {
    const parts = fullPath.split('/');
    const ancestors: string[] = [];

    for (let i = 1; i < parts.length; i++) {
        ancestors.push(parts.slice(0, i).join('/'));
    }

    return ancestors;
}

/**
 * 获取智能显示文本
 * 如果标签在同级中有兄弟节点，则仅显示叶子名称
 * 否则显示完整路径
 *
 * @example
 * getSmartTagDisplay('project/frontend', 'project')
 * 其中 'project' 的兄弟还有 'project/backend'
 * -> 返回 'frontend'
 *
 * getSmartTagDisplay('work', 'work')
 * 其中 'work' 是唯一的根节点
 * -> 返回 'work'
 */
export function getSmartTagDisplay(fullPath: string, allTags: string[]): string {
    const parts = fullPath.split('/');
    const leafName = parts[parts.length - 1];

    if (parts.length === 1) {
        // 单级标签，直接返回
        return fullPath;
    }

    // 多级标签，检查同级是否还有其他标签
    const parentPath = parts.slice(0, -1).join('/');
    const siblingCount = allTags.filter((tag) => {
        const tagParts = tag.split('/');
        if (tagParts.length === parts.length) {
            // 同深度
            const tagParent = tagParts.slice(0, -1).join('/');
            return tagParent === parentPath;
        }
        return false;
    }).length;

    // 如果同级有多个标签（包括自己），则仅显示叶子名称
    if (siblingCount > 1) {
        return leafName;
    }

    // 唯一的同级标签或者无同级，显示完整路径
    return fullPath;
}
