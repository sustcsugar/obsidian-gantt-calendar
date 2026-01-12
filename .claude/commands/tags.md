请为 commit $2 添加 tag $1, 如果 $2 为空, 则为当前最新的 commit 添加 tag

请遵循以下要求:
1. 使用 !`git tag` 获取当前所有的tag列表
2. 对比最新的已存在的tag,与指定的commit之间的代码, 概括性的总结代码变动情况,代码变动的分类如下:
  - feat: - 新功能
  - fix: - 修复bug
  - refactor: - 重构
  - docs: - 文档更新
  - style: - 代码格式调整
  - test: - 测试相关
  - chore: - 杂务/配置变更
3. 检查插件的版本信息`manifest.json`与`package.json`后,并与$1进行比较,分为如下两种情况:
    1. 插件版本已经更新到最新,与待添加的tag版本保持一致, 则直接添加tag.
    2. 插件版本信息未更新,请修改插件版本到待添加的tag版本, 生成一个新的commit, 在新的commit上添加tag, commit请不要带作者信息
4. 为新生成的tag添加上述总结的描述信息
