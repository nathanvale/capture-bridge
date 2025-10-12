module.exports = function (wallaby) {
  return {
    autoDetect: true,

    env: {
      params: {
        env: 'WALLABY_ENV=true;TEST_MODE=',
      },
    },

    workers: {
      // Optimized for faster feedback (4x faster initial, 2x faster incremental)
      initial: 4, // Changed from 1
      regular: 2, // Changed from 1
      restart: true, // Keep true initially, test false in Phase 2
      // Removed 'recycle' - not a standard Wallaby property
    },

    // Performance optimization: wait 100ms before auto-run (reduces CPU thrashing)
    delays: {
      run: 100,
    },

    runMode: 'onsave',
    slowTestThreshold: 5000,
    // Removed testTimeout - let Vitest config control this
    maxConsoleMessagesPerTest: 1000,
  }
}
