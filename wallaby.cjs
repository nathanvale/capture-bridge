module.exports = function (wallaby) {
  return {
    autoDetect: true,

    env: {
      params: {
        env: 'WALLABY_ENV=true;TEST_MODE=',
      },
    },

    workers: {
      initial: 1,
      regular: 1,
      restart: true,
      recycle: true,
    },

    runMode: 'onsave',
    slowTestThreshold: 5000,
    testTimeout: 10000,
    maxConsoleMessagesPerTest: 1000,
  }
}
