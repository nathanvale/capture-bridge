---
title: Performance Testing CI/CD Integration Guide
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-28
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Performance Testing CI/CD Integration Guide

## Purpose

This guide defines the CI/CD infrastructure requirements and configuration for automated performance regression testing across the ADHD Brain monorepo. It ensures consistent performance baseline tracking, regression detection, and load testing execution in the continuous integration pipeline.

**Target Audience:** DevOps engineers, CI/CD maintainers, and developers working on performance-critical components.

This guide supports the **MPPP scope** (voice + email capture with direct-to-inbox export) and aligns with [Master PRD v2.3.0-MPPP](../master/prd-master.md) and [Roadmap v2.0.0-MPPP](../master/roadmap.md).

_Nerdy aside: Think of CI performance testing like a health checkup—run the same tests regularly to catch problems before they become critical._

## When to Use This Guide

Use this guide when:

- Setting up CI/CD performance testing infrastructure
- Configuring performance regression detection workflows
- Establishing performance baseline tracking
- Debugging CI performance test failures
- Adding new performance tests to the pipeline

This guide applies to all performance-critical features: Capture, Staging Ledger, Obsidian Bridge, and CLI.

## Prerequisites

**Required Knowledge:**

- GitHub Actions workflow configuration
- Docker containerization basics
- Performance testing concepts and terminology
- Understanding of statistical significance in performance measurements

**Required Infrastructure:**

- GitHub Actions runners with dedicated CPU/memory allocation
- Docker environment for consistent test execution
- SQLite database for test data isolation
- Temporary filesystem access for file operations

## Quick Reference

**TL;DR Performance CI Pipeline:**

```yaml
name: Performance Regression Tests
on: [push, pull_request]
jobs:
  performance:
    runs-on: ubuntu-latest-4-cores # Dedicated CPU allocation
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - run: npm run test:performance
      - run: npm run test:load
      - run: npm run performance:analyze
```

**Key Thresholds:**

- 🔴 **Regression Failure**: >50% slowdown from baseline
- 🟡 **Regression Warning**: >25% slowdown from baseline
- 🔵 **Regression Tracking**: >10% slowdown from baseline
- 📊 **Load Test Pass**: Sustained throughput within ±15% of baseline

## Infrastructure Requirements

### 1. CI Runner Specifications

**Minimum Requirements:**

- **CPU**: 4 cores dedicated (no shared runners)
- **Memory**: 8GB RAM minimum, 16GB recommended
- **Storage**: 50GB SSD with high IOPS for SQLite operations
- **Network**: Stable connection for dependency downloads
- **OS**: Ubuntu 22.04 LTS for consistency

**Rationale**: Performance tests require consistent hardware to produce reliable baselines. Shared runners introduce too much variance for meaningful regression detection.

### 2. Environment Configuration

```yaml
# .github/workflows/performance.yml
name: Performance Regression Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    types: [opened, synchronize, reopened]
  schedule:
    - cron: "0 6 * * 1-5" # Daily at 6 AM, weekdays only

env:
  NODE_VERSION: "20"
  FORCE_COLOR: 1
  CI: true
  PERFORMANCE_MODE: true

jobs:
  performance-regression:
    runs-on: ubuntu-latest-4-cores
    timeout-minutes: 30

    strategy:
      fail-fast: false
      matrix:
        test-suite:
          - capture
          - staging-ledger
          - obsidian-bridge
          - cli

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 2 # Need previous commit for baseline comparison

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci --no-audit --no-fund

      - name: Setup test environment
        run: |
          # Create isolated temp directories
          mkdir -p /tmp/capture-bridge-test-{capture,vault,staging}
          chmod 755 /tmp/capture-bridge-test-*

          # Set consistent timezone for timestamp tests
          export TZ=UTC

          # Disable swap to prevent memory test interference
          sudo swapoff -a

      - name: Warmup phase
        run: |
          # Run abbreviated test suite to warm up JIT and caches
          npm run test:${{ matrix.test-suite }}:warmup

      - name: Performance regression tests
        run: |
          npm run test:performance:${{ matrix.test-suite }}

      - name: Load testing
        run: |
          npm run test:load:${{ matrix.test-suite }}

      - name: Analyze results
        run: |
          npm run performance:analyze:${{ matrix.test-suite }}

      - name: Upload performance artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: performance-results-${{ matrix.test-suite }}
          path: |
            test-results/performance-${{ matrix.test-suite }}.json
            test-results/load-test-${{ matrix.test-suite }}.json
            test-results/regression-analysis-${{ matrix.test-suite }}.json
          retention-days: 30
```

### 3. Docker Environment (Optional)

For ultimate consistency, performance tests can run in containers:

```dockerfile
# docker/performance-runner.dockerfile
FROM node:20-slim

# Install system dependencies for consistent performance
RUN apt-get update && apt-get install -y \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set CPU governor for consistent performance
RUN echo 'performance' > /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor 2>/dev/null || true

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Run with consistent process priority
CMD ["nice", "-n", "-10", "npm", "run", "test:performance"]
```

## Performance Baselines

### 1. Feature-Specific Baselines

**Capture Performance Baselines:**

```typescript
export const CAPTURE_BASELINES = {
  voice_poll_p95: 100, // ms - Voice file polling operation
  email_poll_p95: 200, // ms - Email polling operation
  hash_computation_p95: 5, // ms - SHA-256 fingerprint calculation
  capture_insert_p95: 8, // ms - Database insert operation
  throughput_captures_per_sec: 10, // ops/sec - Sustained capture rate
}
```

**Staging Ledger Performance Baselines:**

```typescript
export const STAGING_BASELINES = {
  capture_insert_p95: 10, // ms - Insert capture record
  export_query_p95: 5, // ms - Query pending exports
  export_read_p95: 8, // ms - Read export content
  dedup_check_p95: 3, // ms - Content hash deduplication
  throughput_inserts_per_sec: 100, // ops/sec - Sustained insert rate
}
```

**Obsidian Bridge Performance Baselines:**

```typescript
export const OBSIDIAN_BASELINES = {
  atomic_write_p95: 50, // ms - Atomic file write operation
  collision_detect_p95: 2, // ms - Filename collision detection
  audit_trail_p95: 5, // ms - Audit log entry creation
  temp_cleanup_p95: 10, // ms - Temporary file cleanup
  throughput_exports_per_sec: 20, // ops/sec - Sustained export rate
}
```

**CLI Performance Baselines:**

```typescript
export const CLI_BASELINES = {
  command_startup_p95: 1000, // ms - CLI command initialization
  list_query_p95: 500, // ms - List captures query
  export_operation_p95: 3000, // ms - Single capture export
  batch_export_p95: 15000, // ms - Batch export (10 captures)
  throughput_commands_per_min: 20, // ops/min - CLI command throughput
}
```

### 2. Baseline Storage and Tracking

**Baseline files stored in repository:**

```
test-baselines/
├── capture-baselines.json
├── staging-ledger-baselines.json
├── obsidian-bridge-baselines.json
├── cli-baselines.json
└── combined-baselines.json
```

**Baseline JSON format:**

```json
{
  "version": "1.0.0",
  "updated_at": "2025-09-28T10:00:00Z",
  "git_commit": "abc123...",
  "measurements": {
    "voice_poll_p95": {
      "baseline_ms": 100,
      "samples": 1000,
      "std_dev": 8.5,
      "confidence_interval": [95, 105]
    }
  },
  "environment": {
    "node_version": "20.x",
    "platform": "linux",
    "cpu_cores": 4,
    "memory_gb": 8
  }
}
```

## Regression Detection Thresholds

### 1. Threshold Classification

**Failure Thresholds (CI Fails):**

- **P95 Latency**: >50% regression from baseline
- **Throughput**: <50% of baseline sustained rate
- **Memory**: >100% heap growth without GC recovery
- **Error Rate**: >5% operation failure rate

**Warning Thresholds (CI Warns):**

- **P95 Latency**: >25% regression from baseline
- **Throughput**: <75% of baseline sustained rate
- **Memory**: >50% heap growth pattern
- **Error Rate**: >1% operation failure rate

**Tracking Thresholds (CI Notes):**

- **P95 Latency**: >10% regression from baseline
- **Throughput**: <90% of baseline sustained rate
- **Memory**: >25% heap growth trend
- **Error Rate**: >0.1% operation failure rate

### 2. Statistical Significance

**Minimum Requirements:**

- **Sample Size**: 1000 operations minimum for P95 calculations
- **Confidence Level**: 95% confidence intervals for baseline comparison
- **Warmup Period**: 100 operations discarded before measurement
- **Multiple Runs**: 3 independent runs, median result used

**Implementation Example:**

```typescript
export class RegressionDetector {
  detectRegression(
    current: number,
    baseline: number,
    threshold: number
  ): RegressionResult {
    const regression = ((current - baseline) / baseline) * 100

    if (regression > threshold * 0.5) {
      return { level: "FAILURE", regression, shouldFail: true }
    } else if (regression > threshold * 0.25) {
      return { level: "WARNING", regression, shouldFail: false }
    } else if (regression > threshold * 0.1) {
      return { level: "TRACKING", regression, shouldFail: false }
    }

    return { level: "PASS", regression, shouldFail: false }
  }
}
```

## Load Testing Configuration

### 1. Load Test Execution

**Sustained Load Configuration:**

```typescript
export const SUSTAINED_LOAD_CONFIG = {
  duration_minutes: 10,
  operations_total: 1000,
  concurrent_workers: 4,
  ramp_up_seconds: 30,
  cool_down_seconds: 30,
  failure_threshold_percent: 5,
}
```

**Burst Load Configuration:**

```typescript
export const BURST_LOAD_CONFIG = {
  duration_seconds: 10,
  operations_total: 100,
  concurrent_workers: 10,
  batch_size: 10,
  inter_batch_delay_ms: 100,
  failure_threshold_percent: 10,
}
```

**Resource Exhaustion Configuration:**

```typescript
export const RESOURCE_EXHAUSTION_CONFIG = {
  memory_limit_mb: 512,
  disk_limit_mb: 1024,
  operations_until_limit: 10000,
  graceful_degradation_expected: true,
  recovery_time_seconds: 60,
}
```

### 2. Load Test Infrastructure

**LoadTestHarness Base Class:**

```typescript
export class LoadTestHarness {
  constructor(
    private config: LoadTestConfig,
    private metrics: MetricsCollector
  ) {}

  async executeSustainedLoad(): Promise<LoadTestResult> {
    const workers = Array.from(
      { length: this.config.concurrent_workers },
      () => new LoadTestWorker(this.config)
    )

    const results = await Promise.all(workers.map((w) => w.execute()))
    return this.analyzeResults(results)
  }

  async executeBurstLoad(): Promise<LoadTestResult> {
    const startTime = Date.now()
    const operations: Promise<OperationResult>[] = []

    for (
      let batch = 0;
      batch < this.config.operations_total / this.config.batch_size;
      batch++
    ) {
      const batchOps = Array.from({ length: this.config.batch_size }, () =>
        this.executeOperation()
      )
      operations.push(...batchOps)

      if (batch < this.totalBatches - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.inter_batch_delay_ms)
        )
      }
    }

    const results = await Promise.all(operations)
    return this.analyzeResults(results)
  }
}
```

## CI/CD Workflow Integration

### 1. GitHub Actions Integration

**Package.json Scripts:**

```json
{
  "scripts": {
    "test:performance": "concurrently \"npm:test:performance:*\"",
    "test:performance:capture": "vitest run --config vitest.performance.config.ts packages/capture/test/performance",
    "test:performance:staging": "vitest run --config vitest.performance.config.ts packages/staging-ledger/test/performance",
    "test:performance:obsidian": "vitest run --config vitest.performance.config.ts packages/obsidian-bridge/test/performance",
    "test:performance:cli": "vitest run --config vitest.performance.config.ts packages/cli/test/performance",

    "test:load": "concurrently \"npm:test:load:*\"",
    "test:load:capture": "vitest run --config vitest.load.config.ts packages/capture/test/load",
    "test:load:staging": "vitest run --config vitest.load.config.ts packages/staging-ledger/test/load",
    "test:load:obsidian": "vitest run --config vitest.load.config.ts packages/obsidian-bridge/test/load",
    "test:load:cli": "vitest run --config vitest.load.config.ts packages/cli/test/load",

    "performance:analyze": "node scripts/analyze-performance-results.js",
    "performance:baseline:update": "node scripts/update-baselines.js"
  }
}
```

**Vitest Performance Configuration:**

```typescript
// vitest.performance.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["**/*.performance.test.ts"],
    timeout: 60000,
    testTimeout: 60000,
    hookTimeout: 30000,
    maxConcurrency: 1, // Sequential execution for consistent results
    isolate: true,
    reporters: ["verbose", "json"],
    outputFile: "test-results/performance-results.json",
    environment: "node",
    globals: false,
    pool: "forks", // Isolated processes
    poolOptions: {
      forks: {
        singleFork: true, // Single process for consistency
      },
    },
  },
})
```

### 2. Result Analysis and Reporting

**Performance Analysis Script:**

```javascript
// scripts/analyze-performance-results.js
const fs = require("fs")
const path = require("path")

class PerformanceAnalyzer {
  analyzeResults() {
    const features = ["capture", "staging-ledger", "obsidian-bridge", "cli"]
    const analysis = {}

    for (const feature of features) {
      const resultsPath = `test-results/performance-${feature}.json`
      const baselinePath = `test-baselines/${feature}-baselines.json`

      if (fs.existsSync(resultsPath) && fs.existsSync(baselinePath)) {
        const results = JSON.parse(fs.readFileSync(resultsPath))
        const baselines = JSON.parse(fs.readFileSync(baselinePath))

        analysis[feature] = this.compareResults(results, baselines)
      }
    }

    this.generateReport(analysis)
    this.checkFailureThresholds(analysis)
  }

  compareResults(results, baselines) {
    const comparison = {}

    for (const [metric, baseline] of Object.entries(baselines.measurements)) {
      const current = results.measurements[metric]
      if (current) {
        const regression =
          ((current.value - baseline.baseline_ms) / baseline.baseline_ms) * 100
        comparison[metric] = {
          regression: regression,
          current: current.value,
          baseline: baseline.baseline_ms,
          status: this.classifyRegression(regression),
        }
      }
    }

    return comparison
  }

  classifyRegression(regression) {
    if (regression > 50) return "FAILURE"
    if (regression > 25) return "WARNING"
    if (regression > 10) return "TRACKING"
    return "PASS"
  }

  checkFailureThresholds(analysis) {
    const failures = []

    for (const [feature, metrics] of Object.entries(analysis)) {
      for (const [metric, result] of Object.entries(metrics)) {
        if (result.status === "FAILURE") {
          failures.push(
            `${feature}.${metric}: ${result.regression.toFixed(1)}% regression`
          )
        }
      }
    }

    if (failures.length > 0) {
      console.error("Performance regression failures detected:")
      failures.forEach((failure) => console.error(`  - ${failure}`))
      process.exit(1)
    }
  }
}

new PerformanceAnalyzer().analyzeResults()
```

### 3. Baseline Management

**Baseline Update Strategy:**

- **Automatic Updates**: Never (prevents drift)
- **Manual Updates**: After confirmed performance improvements
- **Review Process**: Architecture team approval required
- **Documentation**: All baseline changes require rationale

**Baseline Update Script:**

```javascript
// scripts/update-baselines.js
const fs = require("fs")
const { execSync } = require("child_process")

class BaselineUpdater {
  updateBaselines(feature, metrics) {
    const baselinePath = `test-baselines/${feature}-baselines.json`
    const current = JSON.parse(fs.readFileSync(baselinePath))

    current.updated_at = new Date().toISOString()
    current.git_commit = execSync("git rev-parse HEAD").toString().trim()

    for (const [metric, value] of Object.entries(metrics)) {
      if (current.measurements[metric]) {
        current.measurements[metric].baseline_ms = value
        console.log(`Updated ${feature}.${metric}: ${value}ms`)
      }
    }

    fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2))
  }
}
```

## Troubleshooting

### Common CI Performance Issues

**Problem: Inconsistent test results between runs**

_Symptoms:_ Same code produces different P95 measurements
_Causes:_ Shared CI runners, variable system load, insufficient warmup
_Solutions:_

- Use dedicated CI runners with guaranteed CPU allocation
- Increase warmup period to 200 operations
- Run multiple iterations and use median result
- Check for background processes affecting timing

**Problem: Memory leak false positives**

_Symptoms:_ Memory tests fail despite no actual leaks
_Causes:_ Node.js garbage collection timing, test isolation issues
_Solutions:_

- Force garbage collection between test iterations: `global.gc?.()`
- Increase memory measurement delay to allow GC cycles
- Use `--expose-gc` flag in test runner
- Verify heap snapshots show actual object retention

**Problem: Load tests timing out in CI**

_Symptoms:_ Load tests exceed 30-minute timeout
_Causes:_ Insufficient CI resources, database contention, network delays
_Solutions:_

- Scale down load test parameters for CI environment
- Use in-memory SQLite instead of file-based
- Implement test circuit breakers for early failure detection
- Parallelize load tests by feature instead of running sequentially

### Debug Information Collection

**Enable Debug Logging:**

```bash
# Enable detailed timing and resource usage
export DEBUG=capture-bridge:performance,capture-bridge:load-test
export NODE_ENV=test
export PERFORMANCE_DEBUG=true

# Run with resource monitoring
npm run test:performance:capture -- --reporter=verbose
```

**Resource Monitoring:**

```typescript
// Add to test setup
beforeEach(() => {
  if (process.env.PERFORMANCE_DEBUG) {
    console.log("Memory usage:", process.memoryUsage())
    console.log("CPU usage:", process.cpuUsage())
  }
})
```

## Related Documentation

### Foundation

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Overall project vision and scope
- [TDD Applicability Guide](./guide-tdd-applicability.md) - When to apply performance testing
- [TestKit Usage Guide](./guide-testkit-usage.md) - Testing infrastructure patterns

### Feature Test Specifications

- [Capture Test Specification](../features/capture/spec-capture-test.md) - Performance requirements for capture pipeline
- [Staging Ledger Test Specification](../features/staging-ledger/spec-staging-test.md) - Database performance requirements
- [Obsidian Bridge Test Specification](../features/obsidian-bridge/spec-obsidian-test.md) - File operation performance requirements
- [CLI Test Specification](../features/cli/spec-cli-test.md) - Command-line performance requirements

## Maintenance Notes

### When to Update This Guide

**Review Triggers:**

- CI infrastructure changes (runner specs, Docker images)
- Performance baseline drift requiring investigation
- New feature additions requiring performance testing
- CI pipeline timeout issues or reliability problems
- Major Node.js or dependency version updates

**Change Process:**

1. Propose changes via PR with performance impact analysis
2. Test changes on isolated CI runners first
3. Architecture team review for baseline modifications
4. Update all affected feature test specs within 15 days
5. Document performance impact in change log

### Version History

- v1.0.0 (2025-09-28): Initial CI/CD performance testing infrastructure guide

### Known Limitations

- Load testing limited to single-node scenarios (no distributed testing)
- Performance baselines specific to GitHub Actions runner hardware
- Manual baseline update process (no automated drift detection)
- Limited to Node.js/Vitest testing infrastructure

---

_Remember: Performance testing in CI should be fast enough to provide quick feedback but thorough enough to catch real regressions. The goal is confidence in production performance, not academic precision._
