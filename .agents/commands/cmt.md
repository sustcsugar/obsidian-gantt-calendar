---
description: 提交当前代码并生成规范化的 commit 信息
allowed-tools: Bash, Read, Grep, Glob
---

请提交当前代码, 根据当前的代码变动情况, 生成不带作者信息和 AI 生成标记的 commit 信息.

请遵循以下要求:
1. 不带作者信息, 不带任何工具/AI 生成标记
2. 概括性的总结代码变动情况
3. 请忽略 example/ 路径下的文件变动
4. commit 需要前缀
   - feat: - 新功能
   - fix: - 修复bug
   - refactor: - 重构
   - docs: - 文档更新
   - style: - 代码格式调整
   - test: - 测试相关
   - chore: - 杂务/配置变更
5. 生成的信息要有概括性, 不需要太复杂, 只含有梗概信息

$ARGUMENTS
