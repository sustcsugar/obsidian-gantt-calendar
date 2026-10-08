module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests', '<rootDir>/src'],
	testMatch: ['**/*.test.ts'],
	// ts 优先：源码 main.ts 与构建产物 main.js 同名，默认 js 优先会让
	// import '../main' 命中 bundle 而非源码，导致测试跑在打包代码上
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
	moduleNameMapper: {
		'^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
	},
};
