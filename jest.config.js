module.exports = {
    moduleFileExtensions: ['js', 'ts'],
    transform: {
        '^.+\\.(js|jsx|ts|tsx)$': [
            'ts-jest',
            {
                'ts-jest': {
                    tsconfig: '<rootDir>/test/tsconfig.json'
                }
            }
        ]
    },
    testMatch: ['<rootDir>/test/**/*.test.ts'],
    testEnvironment: 'node',
    setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/test/testSetup.ts'],
    preset: 'ts-jest'
};
