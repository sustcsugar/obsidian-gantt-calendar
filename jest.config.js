module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests', '<rootDir>/src'],
	testMatch: ['**/*.test.ts'],
	moduleNameMapper: {
		'^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
	},
};
