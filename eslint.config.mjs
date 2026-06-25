import obsidian from "eslint-plugin-obsidianmd";

// 本地复现 Obsidian 社区插件提交时官方 Review Bot 跑的校验
// (obsidianmd/eslint-plugin 的 recommended 规则集)。
// 该规则集自带 eslint:recommended、typescript-eslint parser 与规则、
// 以及 security / import / json 等全部提交校验规则。
//
// 两点关键背景(踩坑后确认):
// 1) recommended 在无 files 限制的全局块里启用了类型相关规则
//    (如 no-plugin-as-component / no-deprecated),要求每个被 lint 的文件
//    都具备 TS 类型信息——否则在 package.json / .js / .mjs 等非 TS 文件上崩溃。
//    因此只 lint .ts 源码(忽略所有非 TS 文件),并对 .ts 提供 projectService。
// 2) 这也是 recommended 强制 peer typescript-eslint 的原因,等价于 Bot 侧的
//    typed-linting 设置。
export default [
	{
		// 只 lint TypeScript 源码;忽略构建产物、example vault 副本、
		// 根级配置/脚本、文档,以及任何非 .ts 文件(避免全局类型规则在无类型
		// 信息的文件上崩溃)
		ignores: [
			"node_modules/",
			"example/",
			"docs/",
			"main.js",
			"**/*.mjs",
			"**/*.cjs",
			"**/*.js",
			"**/*.json",
		],
	},
	...obsidian.configs.recommended,
	{
		// 类型信息:供 recommended 里的类型相关规则(no-deprecated 等)在 .ts 上使用
		languageOptions: {
			parserOptions: {
				projectService: {
					defaultProject: "tsconfig.test.json",
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// 测试文件:添加 Jest 全局变量
		files: ["tests/**/*.ts", "src/**/__tests__/**/*.ts"],
		languageOptions: {
			globals: {
				describe: "readonly",
				it: "readonly",
				expect: "readonly",
				beforeEach: "readonly",
				afterEach: "readonly",
				beforeAll: "readonly",
				afterAll: "readonly",
				jest: "readonly",
				test: "readonly",
				fit: "readonly",
				xit: "readonly",
				xdescribe: "readonly",
			},
		},
	},
	{
		// 禁用 no-explicit-any 的自动修复(any→unknown 会破坏构建)
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
];
