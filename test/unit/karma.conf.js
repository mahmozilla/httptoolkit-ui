const path = require('path');
const tmp = require('tmp');
tmp.setGracefulCleanup();

module.exports = function(config) {
    config.set({
        frameworks: ['mocha', 'chai'],
        files: [
            './**/*.spec.ts',
            './**/*.spec.tsx',
            { pattern: '../fixtures/*', included: false, served: true }
        ],
        proxies: {
            '/fixtures': '/absolute' + path.resolve('./test/fixtures')
        },
        mime: { 'text/x-typescript': ['ts', 'tsx'] },
        webpack: require('../../automation/webpack.unittest').default,
        webpackMiddleware: {
            stats: 'errors-only'
        },
        preprocessors: {
            './**/*.ts': ['webpack', 'sourcemap'],
            './**/*.tsx': ['webpack', 'sourcemap'],
            '../../src/**/*.ts': ['webpack', 'sourcemap'],
            '../../src/**/*.tsx': ['webpack', 'sourcemap'],
        },
        reporters: ['mocha'],
        mochaReporter: {
            showDiff: true
        },
        port: 9876,
        logLevel: config.LOG_INFO,

        browsers: ['ChromeHeadless'],

        autoWatch: false,
        singleRun: true,
        concurrency: Infinity
    });
};