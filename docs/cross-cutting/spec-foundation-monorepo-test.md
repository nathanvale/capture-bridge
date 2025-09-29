---
title: Foundation Monorepo Test Specification
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-28
spec_type: test
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
prd_reference: ./prd-foundation-monorepo.md
tech_reference: ./spec-foundation-monorepo-tech.md
---

# Foundation Monorepo — Test Specification

**Gold Standard:** `/Users/nathanvale/code/bun-changesets-template/`

**Scope Note:** This specification defines comprehensive test strategy for monorepo foundation. As the ROOT dependency, all tests are P0 critical and TDD-required.

---

## 1) Test Objectives

### 1.1 Primary Goals

**Prove Foundation Integrity (TDD Required):**

1. **Zero circular dependencies** - No package can transitively depend on itself
2. **Correct build order** - Turbo executes tasks in topological order
3. **Test isolation** - Parallel execution with zero conflicts
4. **Package boundary enforcement** - ESLint prevents forbidden imports
5. **Performance targets** - Build < 30s, test < 30s, setup < 5 min
6. **Doctor health checks** - All workspace validations pass

### 1.2 Risk Assessment

**Risk Class:** HIGH (ROOT dependency - blocks all features)

**Infrastructure vs Application Assessment:**
This is **infrastructure/tooling code** that enables application development rather than implementing business features. However, TDD is still **REQUIRED** because:

1. **Foundation Risk Exception:** As the ROOT dependency, foundation failures cascade to ALL application features
2. **High Cascading Impact:** Build system bugs affect every developer workflow
3. **Difficult to Fix Later:** Refactoring foundation requires updating all dependent features
4. **Proven ROI:** TDD catches architectural violations early in infrastructure code

**Failure Impact:**

- Circular dependencies cascade to all features
- Build order errors block development workflow
- Test flakiness destroys productivity
- Setup time > 5 min violates ADHD-friendly DX
- Package boundary violations accumulate technical debt

**TDD Decision:** REQUIRED for all foundation components per [TDD Applicability Guide](../guides/guide-tdd-applicability.md)

**Rationale:** While typically infrastructure testing focuses on integration over unit tests, monorepo foundation code requires TDD because it's the ROOT dependency with zero tolerance for failure.

### 1.3 Success Criteria

**Must Pass Before Feature Work Begins:**

- ✓ All dependency validation tests pass
- ✓ Build pipeline executes in correct order
- ✓ Tests run in parallel with zero conflicts
- ✓ Package count enforced (max 4 for MPPP)
- ✓ Setup completes in < 5 minutes
- ✓ Doctor command validates entire workspace

### 1.3 TDD Applicability Decision (Detailed)

**According to [TDD Applicability Guide](../guides/guide-tdd-applicability.md):**

**Risk Classification:**

- 🧠 Core cognition: N/A (no business logic)
- 🔁 Concurrency/async: YES (parallel builds, test execution)
- 💾 Storage/migrations: YES (build artifacts, cache management)
- 🔐 Security/PII: NO (no sensitive data handling)
- 🤖 AI adapters: NO (no AI integration at foundation level)

**TDD Scope by Component:**

| Component              | TDD Required?  | Test Type Focus    | Rationale                                |
| ---------------------- | -------------- | ------------------ | ---------------------------------------- |
| Dependency validation  | ✅ YES         | Unit + Integration | Circular deps cascade to all features    |
| Build pipeline         | ✅ YES         | Integration        | Build failures block all development     |
| Test isolation         | ✅ YES         | Integration        | Flaky tests destroy team productivity    |
| Package boundaries     | ✅ YES         | Unit + Contract    | Boundary violations enable circular deps |
| Config validation      | ✅ YES         | Unit               | Invalid configs cause subtle failures    |
| Performance monitoring | ⚠️ RECOMMENDED | Integration        | Slow builds impact ADHD-friendly DX      |
| CLI output formatting  | ❌ SKIP        | Visual (manual)    | Low risk, easily verified manually       |

**Coverage Strategy:**

- **P0 Components:** 90% coverage (dependency graph, build order, test isolation)
- **P1 Components:** 80% coverage (performance, config validation)
- **P2 Components:** Manual verification (visual formatting, docs)

**Trigger to Revisit TDD Scope:**

- Build time consistently > 2 minutes (add performance tests)
- Test flakiness > 1% failure rate (increase isolation testing)
- Package count approaches limit (add boundary enforcement tests)
- Multi-contributor workflow begins (add collaboration tests)

---

## 2) Traceability Matrix

### 2.1 PRD Requirements → Test Coverage

| PRD Requirement            | Test Category      | Test Files                    | Priority |
| -------------------------- | ------------------ | ----------------------------- | -------- |
| Zero circular dependencies | Unit + Integration | `dependency-graph.test.ts`    | P0       |
| Build < 30s                | Integration        | `build-performance.test.ts`   | P0       |
| Test < 30s                 | Integration        | `test-performance.test.ts`    | P0       |
| Setup < 5 min              | E2E                | `setup-workflow.test.ts`      | P0       |
| Package count = 4          | Unit               | `package-structure.test.ts`   | P0       |
| Test isolation             | Integration        | `parallel-execution.test.ts`  | P0       |
| TestKit integration        | Contract           | `testkit-integration.test.ts` | P0       |
| Doctor validation          | Integration        | `doctor-command.test.ts`      | P0       |

### 2.2 Tech Spec Guarantees → Test Coverage

| Tech Spec Guarantee   | Test Type       | Verification Method       | Priority |
| --------------------- | --------------- | ------------------------- | -------- |
| Turbo task ordering   | Integration     | Validate topological sort | P0       |
| Package boundaries    | Unit            | ESLint rule enforcement   | P0       |
| In-memory SQLite      | Contract        | TestKit lifecycle         | P0       |
| MSW auto-cleanup      | Contract        | TestKit lifecycle         | P0       |
| Build caching         | Integration     | Turbo cache hits          | P1       |
| Watch mode hot reload | Integration     | File change detection     | P1       |
| Prettier formatting   | Visual (manual) | Diff inspection           | P2       |

---

## 3) Coverage Strategy

### 3.1 Test Pyramid Distribution

```
      ┌─────────────┐
      │     E2E     │  ~5%  - Setup workflow, doctor command
      │   (Slow)    │
      └─────────────┘
     ┌───────────────┐
     │  Integration  │  ~30% - Build pipeline, test isolation, parallel execution
     │   (Medium)    │
     └───────────────┘
    ┌─────────────────┐
    │      Unit       │  ~50% - Dependency validation, boundary checks, hash functions
    │     (Fast)      │
    └─────────────────┘
   ┌───────────────────┐
   │     Contract      │  ~15% - TestKit, external tooling interfaces
   │    (Isolated)     │
   └───────────────────┘
```

### 3.2 Unit Tests (Pure Logic)

**Target:** 50% of test suite, < 5s execution

**Scope:**

- Dependency graph algorithms (topological sort, cycle detection)
- Package structure validation (count, naming conventions)
- Configuration parsing (tsconfig, turbo.json, eslint)
- Path resolution logic
- Version checking (Node, pnpm, Turbo)

**Out of Scope:**

- Actual builds (mocked in unit tests)
- File system operations (mocked)
- External process execution (mocked)

**Test Files:**

```
tools/test/
├── dependency-graph.test.ts          # Circular dependency detection
├── package-structure.test.ts         # Package count, naming, exports
├── build-graph.test.ts               # Topological sort correctness
├── config-validation.test.ts         # Config schema validation
└── version-checks.test.ts            # Node/pnpm/Turbo version logic
```

### 3.3 Integration Tests (Pipeline + DB)

**Target:** 30% of test suite, < 15s execution

**Scope:**

- Turbo task pipeline execution
- Build order validation (foundation → core/storage → capture → cli)
- Test isolation (Vitest projects)
- Parallel execution safety
- In-memory SQLite lifecycle
- MSW mock cleanup
- Build caching validation
- Watch mode hot reload

**Out of Scope:**

- Visual output formatting (manual verification)
- Performance benchmarking (separate suite)

**Test Files:**

```
tools/test/integration/
├── build-pipeline.test.ts            # Turbo task execution order
├── parallel-execution.test.ts        # Zero test conflicts
├── test-isolation.test.ts            # Vitest projects isolation
├── cache-validation.test.ts          # Turbo cache hit/miss
├── watch-mode.test.ts                # Hot reload behavior
└── sqlite-lifecycle.test.ts          # In-memory DB per test
```

### 3.4 Contract Tests (Adapters)

**Target:** 15% of test suite, < 5s execution

**Scope:**

- @orchestr8/testkit integration points
- Package export surfaces (public APIs)
- CLI command interfaces
- Configuration schema contracts
- External tooling interfaces (pnpm, Turbo, Vitest)

**Out of Scope:**

- Implementation details of external tools
- Visual formatting of CLI output

**Test Files:**

```
tools/test/contract/
├── testkit-integration.test.ts       # @orchestr8/testkit availability
├── package-exports.test.ts           # Public API surface validation
├── cli-commands.test.ts              # Command interface contracts
└── tooling-interfaces.test.ts        # pnpm/Turbo/Vitest contracts
```

### 3.5 E2E Tests (Happy Path + Recovery)

**Target:** 5% of test suite, < 10s execution

**Scope:**

- Fresh setup workflow (clone → install → build → test)
- Doctor command full validation
- Development workflow (watch → test → lint)
- Error recovery scenarios

**Out of Scope:**

- Network failure simulation (low priority for local-first tool)
- Multi-user collaboration (single-user MPPP)

**Test Files:**

```
tools/test/e2e/
├── setup-workflow.test.ts            # Fresh clone to first test
├── doctor-command.test.ts            # Full health check validation
├── dev-workflow.test.ts              # Watch mode + testing + linting
└── error-recovery.test.ts            # Build failures, cleanup
```

---

## 4) Critical Tests (TDD Required)

### 4.1 Circular Dependency Detection (P0)

**File:** `tools/test/dependency-graph.test.ts`

**Risk:** HIGH - Circular dependencies cascade to all features

**TDD Approach:**

1. Write test for valid dependency graph (foundation → core/storage → capture)
2. Write test for circular dependency detection (core → storage → core)
3. Implement dependency graph algorithm (topological sort)
4. Verify zero circular dependencies with madge + dependency-cruiser

**Test Cases:**

```typescript
describe("Dependency Graph", () => {
  test("detects zero circular dependencies in valid graph", () => {
    const graph = buildDependencyGraph([
      "foundation",
      "core",
      "storage",
      "capture",
    ])
    expect(detectCircularDeps(graph)).toHaveLength(0)
  })

  test("detects circular dependency: core ← storage ← core", () => {
    const graph = {
      core: ["foundation", "storage"],
      storage: ["foundation", "core"], // ❌ circular
    }
    const cycles = detectCircularDeps(graph)
    expect(cycles).toContainEqual(["core", "storage", "core"])
  })

  test("prevents foundation from depending on anything", () => {
    const graph = {
      foundation: ["core"], // ❌ foundation must have 0 deps
    }
    expect(() => validatePackageRules(graph)).toThrow(
      "foundation cannot depend on other packages"
    )
  })

  test("validates topological sort order", () => {
    const graph = buildDependencyGraph([
      "foundation",
      "core",
      "storage",
      "capture",
    ])
    const order = topologicalSort(graph)
    expect(order.indexOf("foundation")).toBeLessThan(order.indexOf("core"))
    expect(order.indexOf("core")).toBeLessThan(order.indexOf("capture"))
  })

  test("integrates with madge for real workspace validation", async () => {
    const madgeResult = await runMadgeAnalysis("./packages")
    expect(madgeResult.circular).toHaveLength(0)
  })

  test("integrates with dependency-cruiser for boundary enforcement", async () => {
    const cruiserResult = await runDependencyCruiser("./packages")
    expect(cruiserResult.violations).toHaveLength(0)
  })
})
```

**Tools:**

- `madge` - Circular dependency detection
- `dependency-cruiser` - Boundary rule enforcement
- Custom topological sort implementation

**Success Metrics:**

- Zero circular dependencies detected
- All packages build in correct order
- Test execution time < 2s

### 4.2 Build Order Validation (P0)

**File:** `tools/test/integration/build-pipeline.test.ts`

**Risk:** HIGH - Incorrect build order blocks development

**TDD Approach:**

1. Write test for correct build order (foundation first, CLI last)
2. Write test for Turbo task graph validation
3. Implement build pipeline orchestration
4. Verify builds execute in topological order

**Test Cases:**

```typescript
describe("Build Pipeline", () => {
  test("builds foundation before all other packages", async () => {
    const buildLog = await runTurboBuild()
    const foundationBuildTime = extractBuildTime(
      buildLog,
      "@adhd-brain/foundation"
    )
    const coreBuildTime = extractBuildTime(buildLog, "@adhd-brain/core")

    expect(foundationBuildTime.end).toBeLessThanOrEqual(coreBuildTime.start)
  })

  test("builds core and storage in parallel", async () => {
    const buildLog = await runTurboBuild()
    const coreStart = extractBuildTime(buildLog, "@adhd-brain/core").start
    const storageStart = extractBuildTime(buildLog, "@adhd-brain/storage").start

    // Parallel builds should start within 100ms of each other
    expect(Math.abs(coreStart - storageStart)).toBeLessThan(100)
  })

  test("builds capture after core and storage complete", async () => {
    const buildLog = await runTurboBuild()
    const coreEnd = extractBuildTime(buildLog, "@adhd-brain/core").end
    const storageEnd = extractBuildTime(buildLog, "@adhd-brain/storage").end
    const captureStart = extractBuildTime(buildLog, "@adhd-brain/capture").start

    expect(Math.max(coreEnd, storageEnd)).toBeLessThanOrEqual(captureStart)
  })

  test("completes full build in < 30s", async () => {
    const start = Date.now()
    await runTurboBuild()
    const duration = Date.now() - start

    expect(duration).toBeLessThan(30_000)
  })

  test("validates turbo.json task graph dependencies", () => {
    const config = loadTurboConfig()
    expect(config.tasks.build.dependsOn).toContain("^build")
    expect(config.tasks.test.dependsOn).toContain("^build")
  })

  test("detects build cache hits on second run", async () => {
    await runTurboBuild() // First run (cold cache)
    const secondRun = await runTurboBuild() // Second run (warm cache)

    expect(secondRun.cacheHits).toBeGreaterThan(0)
    expect(secondRun.duration).toBeLessThan(5_000) // < 5s with cache
  })
})
```

**Tools:**

- Turbo CLI execution
- Build log parsing
- Performance timing

**Success Metrics:**

- Correct topological build order
- Parallel execution where possible
- Full build < 30s
- Incremental build < 5s (cached)

### 4.3 Test Isolation Verification (P0)

**File:** `tools/test/integration/parallel-execution.test.ts`

**Risk:** HIGH - Test flakiness destroys productivity

**TDD Approach:**

1. Write test for parallel execution without conflicts
2. Write test for in-memory SQLite isolation
3. Write test for MSW mock cleanup
4. Implement Vitest projects configuration
5. Verify zero test conflicts in 10 parallel runs

**Test Cases:**

```typescript
describe("Test Isolation", () => {
  test("runs all package tests in parallel without conflicts", async () => {
    const results = await Promise.all([
      runPackageTests("@adhd-brain/foundation"),
      runPackageTests("@adhd-brain/core"),
      runPackageTests("@adhd-brain/storage"),
      runPackageTests("@adhd-brain/capture"),
    ])

    results.forEach((result) => {
      expect(result.success).toBe(true)
      expect(result.flakes).toBe(0)
    })
  })

  test("creates isolated in-memory SQLite per test context", async () => {
    const { createMemoryUrl } = await import("@orchestr8/testkit/sqlite")

    const db1 = new Database(createMemoryUrl())
    const db2 = new Database(createMemoryUrl())

    db1.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)")
    db1.exec("INSERT INTO test (id) VALUES (1)")

    // db2 should not see db1's data
    const result = db2.prepare("SELECT * FROM test").all()
    expect(() => result).toThrow("no such table: test")
  })

  test("resets MSW handlers after each test", async () => {
    const { setupMSW, http, HttpResponse } = await import(
      "@orchestr8/testkit/msw"
    )

    setupMSW([
      http.get("http://test.local/api", () =>
        HttpResponse.json({ data: "test1" })
      ),
    ])

    const response1 = await fetch("http://test.local/api")
    const data1 = await response1.json()
    expect(data1.data).toBe("test1")

    // After test, MSW should reset
    // Next test starts with clean handlers
  })

  test("runs tests 10 times in parallel with zero failures", async () => {
    const runs = Array.from({ length: 10 }, (_, i) => runTestSuite(`run-${i}`))

    const results = await Promise.all(runs)
    const failures = results.filter((r) => !r.success)

    expect(failures).toHaveLength(0)
  })

  test("completes all tests in < 30s", async () => {
    const start = Date.now()
    await runTestSuite()
    const duration = Date.now() - start

    expect(duration).toBeLessThan(30_000)
  })

  test("validates Vitest projects configuration", () => {
    const config = loadVitestConfig()
    const projects = config.test?.projects || []

    expect(projects.length).toBeGreaterThan(0)
    expect(config.test?.globals).toBe(true)
    expect(config.test?.environment).toBe("node")
  })
})
```

**Tools:**

- Vitest with projects configuration
- @orchestr8/testkit (SQLite, MSW)
- Parallel execution harness

**Success Metrics:**

- Zero test conflicts in 10 parallel runs
- Test suite < 30s
- Each package isolated
- No shared state between tests

### 4.4 Package Boundary Enforcement (P0)

**File:** `tools/test/package-structure.test.ts`

**Risk:** HIGH - Boundary violations enable circular dependencies

**TDD Approach:**

1. Write test for valid package imports (foundation ← core)
2. Write test for forbidden imports (core → storage)
3. Implement ESLint boundary rules
4. Verify all packages respect boundaries

**Test Cases:**

```typescript
describe("Package Boundaries", () => {
  test("foundation has zero dependencies", () => {
    const pkg = loadPackageJson("@adhd-brain/foundation")
    expect(Object.keys(pkg.dependencies || {})).toHaveLength(0)
  })

  test("core only depends on foundation", () => {
    const pkg = loadPackageJson("@adhd-brain/core")
    const deps = Object.keys(pkg.dependencies || {})
    const internalDeps = deps.filter((d) => d.startsWith("@adhd-brain/"))

    expect(internalDeps).toEqual(["@adhd-brain/foundation"])
  })

  test("storage only depends on foundation", () => {
    const pkg = loadPackageJson("@adhd-brain/storage")
    const deps = Object.keys(pkg.dependencies || {})
    const internalDeps = deps.filter((d) => d.startsWith("@adhd-brain/"))

    expect(internalDeps).toEqual(["@adhd-brain/foundation"])
  })

  test("capture depends on foundation + core + storage", () => {
    const pkg = loadPackageJson("@adhd-brain/capture")
    const deps = Object.keys(pkg.dependencies || {})
    const internalDeps = deps.filter((d) => d.startsWith("@adhd-brain/"))

    expect(internalDeps).toContain("@adhd-brain/foundation")
    expect(internalDeps).toContain("@adhd-brain/core")
    expect(internalDeps).toContain("@adhd-brain/storage")
  })

  test("prevents core from importing storage (FORBIDDEN)", async () => {
    const lintResult = await runESLint("packages/@adhd-brain/core")
    const violations = lintResult.results
      .flatMap((r) => r.messages)
      .filter((m) => m.message.includes("storage"))

    expect(violations).toHaveLength(0)
  })

  test("package count enforced (max 4 for MPPP)", () => {
    const packages = glob.sync("packages/@adhd-brain/*")
    expect(packages.length).toBeLessThanOrEqual(4)
  })

  test("validates package naming convention", () => {
    const packages = glob.sync("packages/@adhd-brain/*")
    packages.forEach((pkg) => {
      const name = path.basename(pkg)
      expect(name).toMatch(/^[a-z-]+$/) // kebab-case only
    })
  })

  test("validates package export structure", () => {
    const pkgs = ["foundation", "core", "storage", "capture"]
    pkgs.forEach((name) => {
      const pkg = loadPackageJson(`@adhd-brain/${name}`)
      expect(pkg.exports).toHaveProperty(".")
      expect(pkg.exports["."].import).toMatch(/\.js$/)
      expect(pkg.exports["."].types).toMatch(/\.d\.ts$/)
    })
  })
  test("prevents circular dependencies between packages", async () => {
    // Run dependency graph analysis
    const graph = await analyzeDependencyGraph()

    // Detect cycles
    const cycles = graph.detectCycles()

    // Fail on any circular imports
    expect(cycles).toEqual([])

    // If cycles found, provide clear error
    if (cycles.length > 0) {
      const cycleDescription = cycles
        .map((cycle) => cycle.join(" → "))
        .join("\n")
      throw new Error(`Circular dependencies detected:\n${cycleDescription}`)
    }
  })

  test("enforces public API exports via index.ts", async () => {
    const packages = ["foundation", "core", "storage", "capture"]

    for (const pkg of packages) {
      // Get all exports from package
      const exports = await getPackageExports(`@adhd-brain/${pkg}`)

      // Verify all exports come from index.ts
      exports.forEach((exp) => {
        expect(exp.source).toBe(`packages/${pkg}/src/index.ts`)
      })

      // Verify internal modules are not exported
      const internalImports = await findImportsToInternalModules(
        `@adhd-brain/${pkg}`
      )
      expect(internalImports).toEqual([])
    }
  })

  test("validates import boundaries between features", async () => {
    const featurePackages = ["core", "storage", "capture"]

    for (const pkg of featurePackages) {
      // Analyze imports in package
      const imports = await analyzeImports(`packages/${pkg}`)

      // Feature packages should NOT import from other features
      const crossFeatureImports = imports.filter(
        (imp) =>
          imp.startsWith("@adhd-brain/") &&
          !imp.startsWith("@adhd-brain/foundation") &&
          !imp.startsWith("@adhd-brain/testkit") &&
          !imp.startsWith(`@adhd-brain/${pkg}`)
      )

      expect(crossFeatureImports).toEqual([])
    }

    // Only @adhd-brain/foundation is allowed as shared dependency
    const foundationImports = await analyzeImports("packages/foundation")
    const externalImports = foundationImports.filter((imp) =>
      imp.startsWith("@adhd-brain/")
    )
    expect(externalImports).toEqual([]) // Foundation imports nothing from adhd-brain
  })

  test("prevents dependency version drift", async () => {
    const packages = ["foundation", "core", "storage", "capture"]

    // Collect all dependencies across packages
    const dependencyVersions = new Map<string, Set<string>>()

    for (const pkg of packages) {
      const packageJson = await readPackageJson(`packages/${pkg}`)

      for (const [dep, version] of Object.entries(
        packageJson.dependencies || {}
      )) {
        if (!dependencyVersions.has(dep)) {
          dependencyVersions.set(dep, new Set())
        }
        dependencyVersions.get(dep)!.add(version as string)
      }
    }

    // Find dependencies with multiple versions
    const driftingDeps = Array.from(dependencyVersions.entries()).filter(
      ([_, versions]) => versions.size > 1
    )

    // Fail on any version drift
    expect(driftingDeps).toEqual([])

    if (driftingDeps.length > 0) {
      const driftDescription = driftingDeps
        .map(([dep, versions]) => `${dep}: ${Array.from(versions).join(", ")}`)
        .join("\n")
      throw new Error(`Dependency version drift detected:\n${driftDescription}`)
    }
  })

  test("validates workspace dependency protocols", async () => {
    const packages = ["core", "storage", "capture"]

    for (const pkg of packages) {
      const packageJson = await readPackageJson(`packages/${pkg}`)
      const deps = packageJson.dependencies || {}

      // All internal dependencies must use workspace: protocol
      Object.keys(deps).forEach((depName) => {
        if (depName.startsWith("@adhd-brain/")) {
          expect(deps[depName]).toMatch(/^workspace:/)
        }
      })
    }
  })

  test("prevents deep import bypassing package boundaries", async () => {
    const packages = ["core", "storage", "capture"]

    for (const pkg of packages) {
      const sourceFiles = await glob(`packages/${pkg}/src/**/*.ts`)

      for (const file of sourceFiles) {
        const content = await fs.readFile(file, "utf-8")

        // Look for deep imports (bypassing index.ts)
        const deepImportPattern = /@adhd-brain\/[^/]+\/(?!src\/index)[^'"]+/g
        const deepImports = content.match(deepImportPattern) || []

        if (deepImports.length > 0) {
          throw new Error(
            `Deep imports detected in ${file}: ${deepImports.join(", ")}`
          )
        }
      }
    }
  })

  test("validates TypeScript path mapping consistency", async () => {
    const tsConfig = await readJSON("tsconfig.json")
    const paths = tsConfig.compilerOptions?.paths || {}

    const expectedPaths = {
      "@adhd-brain/foundation": ["./packages/foundation/src/index.ts"],
      "@adhd-brain/core": ["./packages/core/src/index.ts"],
      "@adhd-brain/storage": ["./packages/storage/src/index.ts"],
      "@adhd-brain/capture": ["./packages/capture/src/index.ts"],
    }

    Object.entries(expectedPaths).forEach(([alias, expectedPath]) => {
      expect(paths[alias]).toEqual(expectedPath)
    })
  })

  test("validates build order respects dependency graph", async () => {
    const turboConfig = await readJSON("turbo.json")
    const buildTask = turboConfig.tasks?.build

    expect(buildTask).toBeDefined()
    expect(buildTask.dependsOn).toContain("^build")

    // Run actual build and validate order
    const buildLog = await execAsync("pnpm build --dry-run")
    const buildOrder = extractBuildOrder(buildLog.stdout)

    // Foundation must be first
    expect(buildOrder.indexOf("foundation")).toBe(0)

    // Core and storage can be parallel (after foundation)
    const foundationIndex = buildOrder.indexOf("foundation")
    const coreIndex = buildOrder.indexOf("core")
    const storageIndex = buildOrder.indexOf("storage")

    expect(coreIndex).toBeGreaterThan(foundationIndex)
    expect(storageIndex).toBeGreaterThan(foundationIndex)

    // Capture must be after core and storage
    const captureIndex = buildOrder.indexOf("capture")
    expect(captureIndex).toBeGreaterThan(coreIndex)
    expect(captureIndex).toBeGreaterThan(storageIndex)
  })
})
```

**Tools:**

- ESLint with boundary rules
- Package.json validation
- Glob for package discovery
- Madge for circular dependency detection
- Dependency-cruiser for boundary enforcement
- TypeScript path mapping validation

**Success Metrics:**

- Zero boundary violations
- Zero circular dependencies
- Package count ≤ 4
- All packages have valid exports
- ESLint rules enforced
- Build order respects dependency graph

### 4.5 Performance Targets (P0)

**File:** `tools/test/integration/build-performance.test.ts`

**Risk:** MEDIUM - Slow feedback loop breaks ADHD-friendly DX

**TDD Approach:**

1. Write test for build < 30s
2. Write test for test suite < 30s
3. Write test for setup < 5 min
4. Implement performance monitoring
5. Verify all targets met

**Test Cases:**

```typescript
describe("Performance Targets", () => {
  test("full build completes in < 30s", async () => {
    const start = Date.now()
    await execAsync("pnpm build")
    const duration = Date.now() - start

    expect(duration).toBeLessThan(30_000)
  })

  test("test suite completes in < 30s", async () => {
    const start = Date.now()
    await execAsync("pnpm test")
    const duration = Date.now() - start

    expect(duration).toBeLessThan(30_000)
  })

  test("fresh setup completes in < 5 min", async () => {
    const tempDir = await createTempDirectory()
    const start = Date.now()

    await execAsync("git clone . " + tempDir.path)
    await execAsync("pnpm install", { cwd: tempDir.path })
    await execAsync("pnpm build", { cwd: tempDir.path })

    const duration = Date.now() - start
    expect(duration).toBeLessThan(5 * 60 * 1000)

    await tempDir.cleanup()
  })

  test("CLI startup in < 1s", async () => {
    await execAsync("pnpm build") // Ensure CLI built

    const start = Date.now()
    await execAsync("pnpm adhd --version")
    const duration = Date.now() - start

    expect(duration).toBeLessThan(1_000)
  })

  test("incremental build with cache in < 5s", async () => {
    await execAsync("pnpm build") // First build (cold cache)

    const start = Date.now()
    await execAsync("pnpm build") // Second build (warm cache)
    const duration = Date.now() - start

    expect(duration).toBeLessThan(5_000)
  })

  test("hot reload in dev mode < 1s", async () => {
    const devProcess = spawn("pnpm dev", { shell: true })
    await waitForDevReady(devProcess)

    const testFile = "packages/core/src/test.ts"
    const start = Date.now()
    await fs.writeFile(testFile, 'export const test = "updated"')
    await waitForReload(devProcess)
    const duration = Date.now() - start

    expect(duration).toBeLessThan(1_000)
    devProcess.kill()
  })
})
```

**Tools:**

- Process execution timing
- Temp directory for setup tests
- Performance profiling

**Success Metrics:**

- Build < 30s
- Test < 30s
- Setup < 5 min
- CLI startup < 1s
- Hot reload < 1s

### 4.6 Doctor Command Validation (P0)

**File:** `tools/test/e2e/doctor-command.test.ts`

**Risk:** MEDIUM - Invalid workspace state blocks development

**TDD Approach:**

1. Write test for successful doctor run (all checks pass)
2. Write test for detecting missing dependencies
3. Write test for detecting invalid configuration
4. Implement doctor command logic
5. Verify all validations work

**Test Cases:**

```typescript
describe("Doctor Command", () => {
  test("reports all checks passing in healthy workspace", async () => {
    const result = await execAsync("pnpm doctor")

    expect(result.stdout).toContain("✓ Node")
    expect(result.stdout).toContain("✓ pnpm")
    expect(result.stdout).toContain("✓ Turbo")
    expect(result.stdout).toContain("✓ Package Structure")
    expect(result.stdout).toContain("✓ Configuration")
    expect(result.stdout).toContain("✓ Test Infrastructure")
    expect(result.stdout).toContain("All checks passed!")
    expect(result.exitCode).toBe(0)
  })

  test("detects Node version < 20.0.0", async () => {
    vi.spyOn(process.versions, "node").mockReturnValue("18.0.0")

    const result = await execAsync("pnpm doctor")
    expect(result.stderr).toContain(
      "Node version 18.0.0 is below minimum 20.0.0"
    )
    expect(result.exitCode).toBe(1)
  })

  test("detects incorrect pnpm version", async () => {
    vi.spyOn(execSync, "default").mockReturnValue("8.0.0")

    const result = await execAsync("pnpm doctor")
    expect(result.stderr).toContain(
      "pnpm version 8.0.0 does not match required 9.15.4"
    )
    expect(result.exitCode).toBe(1)
  })

  test("detects package count > 4", async () => {
    await createPackage("packages/@adhd-brain/extra")

    const result = await execAsync("pnpm doctor")
    expect(result.stderr).toContain("Package count 5 exceeds maximum 4")
    expect(result.exitCode).toBe(1)

    await removePackage("packages/@adhd-brain/extra")
  })

  test("detects circular dependencies", async () => {
    // Temporarily inject circular dep
    const corePkg = await readPackageJson("@adhd-brain/core")
    corePkg.dependencies["@adhd-brain/storage"] = "workspace:*"
    await writePackageJson("@adhd-brain/core", corePkg)

    const result = await execAsync("pnpm doctor")
    expect(result.stderr).toContain("Circular dependencies detected")
    expect(result.exitCode).toBe(1)

    // Restore
    delete corePkg.dependencies["@adhd-brain/storage"]
    await writePackageJson("@adhd-brain/core", corePkg)
  })

  test("detects invalid TypeScript config", async () => {
    const tsconfig = await readJSON("tsconfig.json")
    delete tsconfig.compilerOptions.strict
    await writeJSON("tsconfig.json", tsconfig)

    const result = await execAsync("pnpm doctor")
    expect(result.stderr).toContain(
      "tsconfig.json missing required strict mode"
    )
    expect(result.exitCode).toBe(1)

    // Restore
    tsconfig.compilerOptions.strict = true
    await writeJSON("tsconfig.json", tsconfig)
  })

  test("detects missing @orchestr8/testkit", async () => {
    await execAsync("pnpm remove @orchestr8/testkit")

    const result = await execAsync("pnpm doctor")
    expect(result.stderr).toContain("@orchestr8/testkit not found")
    expect(result.exitCode).toBe(1)

    // Restore
    await execAsync("pnpm add -D @orchestr8/testkit")
  })

  test("validates build performance metrics", async () => {
    const result = await execAsync("pnpm doctor")
    const buildTime = extractMetric(result.stdout, "Build time")
    const testTime = extractMetric(result.stdout, "Test time")

    expect(buildTime).toBeLessThan(30_000)
    expect(testTime).toBeLessThan(30_000)
  })
})
```

**Tools:**

- CLI execution
- Package.json manipulation
- Config file validation

**Success Metrics:**

- All health checks pass in valid workspace
- Invalid states correctly detected
- Error messages actionable
- Exit codes correct

---

## 5) TestKit Standardization Tests

### 5.1 TestKit Integration Validation

**Objective:** Ensure @orchestr8/testkit provides reliable, standardized testing infrastructure across all packages.

**Critical TestKit Components to Validate:**

**Memory SQLite Lifecycle:**

```typescript
// tools/test/testkit/sqlite-lifecycle.test.ts
describe("TestKit SQLite Integration", () => {
  test("creates isolated in-memory databases per test", async () => {
    const { createMemoryUrl, applyTestPragmas } = await import(
      "@orchestr8/testkit/sqlite"
    )

    const db1 = new Database(createMemoryUrl())
    const db2 = new Database(createMemoryUrl())

    applyTestPragmas(db1)
    applyTestPragmas(db2)

    // Insert data into db1
    db1.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)")
    db1.exec("INSERT INTO test (id) VALUES (1)")

    // Verify db2 is completely isolated
    expect(() => db2.exec("SELECT * FROM test")).toThrow("no such table: test")

    db1.close()
    db2.close()
  })

  test("applies performance pragmas correctly", () => {
    const { createMemoryUrl, applyTestPragmas } = await import(
      "@orchestr8/testkit/sqlite"
    )
    const db = new Database(createMemoryUrl())

    applyTestPragmas(db)

    const pragmas = db.prepare("PRAGMA journal_mode").get()
    expect(pragmas.journal_mode).toBe("MEMORY")

    const syncMode = db.prepare("PRAGMA synchronous").get()
    expect(syncMode.synchronous).toBe(0) // OFF for tests

    db.close()
  })
})
```

**MSW Mock Lifecycle:**

```typescript
// tools/test/testkit/msw-lifecycle.test.ts
describe("TestKit MSW Integration", () => {
  test("provides clean MSW setup and teardown", async () => {
    const { setupMSW, http, HttpResponse } = await import(
      "@orchestr8/testkit/msw"
    )

    const handlers = [
      http.get("http://test.local/api", () =>
        HttpResponse.json({ data: "test-response" })
      ),
    ]

    setupMSW(handlers)

    const response = await fetch("http://test.local/api")
    const data = await response.json()

    expect(data.data).toBe("test-response")

    // MSW should auto-cleanup after test
    // Next test starts with clean handlers
  })

  test("handles parallel test execution without conflicts", async () => {
    const { setupMSW, http, HttpResponse } = await import(
      "@orchestr8/testkit/msw"
    )

    // Run multiple tests in parallel
    const tests = Array.from({ length: 5 }, async (_, i) => {
      setupMSW([
        http.get(`http://test${i}.local/api`, () =>
          HttpResponse.json({ test: i })
        ),
      ])

      const response = await fetch(`http://test${i}.local/api`)
      const data = await response.json()
      return data.test
    })

    const results = await Promise.all(tests)
    expect(results).toEqual([0, 1, 2, 3, 4])
  })
})
```

**Vitest Config Integration:**

```typescript
// tools/test/testkit/vitest-config.test.ts
describe("TestKit Vitest Configuration", () => {
  test("createBaseVitestConfig provides required options", async () => {
    const { createBaseVitestConfig } = await import(
      "@orchestr8/testkit/vitest-config"
    )

    const config = createBaseVitestConfig({
      test: {
        environment: "node",
        globals: true,
      },
    })

    expect(config.test?.environment).toBe("node")
    expect(config.test?.globals).toBe(true)
    expect(config.test?.testTimeout).toBeGreaterThan(0)
    expect(config.test?.hookTimeout).toBeGreaterThan(0)
  })

  test("supports projects configuration for monorepo", async () => {
    const { createBaseVitestConfig } = await import(
      "@orchestr8/testkit/vitest-config"
    )

    const config = createBaseVitestConfig({
      test: {
        projects: [
          {
            test: {
              name: "foundation",
              include: ["packages/@adhd-brain/foundation/**/*.test.ts"],
            },
          },
        ],
      },
    })

    expect(config.test?.projects).toHaveLength(1)
    expect(config.test?.projects?.[0]?.test?.name).toBe("foundation")
  })
})
```

### 5.2 TestKit Gap Analysis

**Current TestKit Coverage Assessment:**

- ✅ In-memory SQLite: Complete
- ✅ MSW HTTP mocking: Complete
- ✅ Vitest configuration: Complete
- ⚠️ CLI command mocking: Basic (may need enhancement)
- ⚠️ File system operations: Basic (may need enhancement)
- ❌ Build tool integration: Missing (Turbo/pnpm mocking)

**Suggested TestKit Enhancements:**

```typescript
// Potential new TestKit helpers to request
interface DesiredTestKitHelpers {
  // Build tool mocking
  mockTurboExecution(commands: string[], results: BuildResult[]): void
  mockPnpmCommands(commands: string[], outputs: string[]): void

  // File system with cleanup
  createTempWorkspace(structure: WorkspaceStructure): TempWorkspace

  // Process execution with deterministic results
  mockProcessExecution(command: string, result: ProcessResult): void
}
```

**When to Create Custom Helpers vs Request TestKit Enhancement:**

- **Use TestKit:** For cross-cutting concerns (DB, HTTP, file system)
- **Request Enhancement:** When 3+ packages need the same mock pattern
- **Custom Helper:** For monorepo-specific needs (package boundary validation)

---

## 6) Monorepo-Specific Test Patterns

### 6.1 Package Boundary Validation Patterns

**Dependency Graph Testing:**

```typescript
// tools/test/patterns/dependency-validation.test.ts
import {
  buildPackageDependencyGraph,
  detectCircularDependencies,
} from "../utils/dependency-graph"

describe("Monorepo Dependency Patterns", () => {
  test("validates foundation package has zero internal dependencies", () => {
    const graph = buildPackageDependencyGraph()
    const foundationDeps = graph.get("@adhd-brain/foundation") || []
    const internalDeps = foundationDeps.filter((dep) =>
      dep.startsWith("@adhd-brain/")
    )

    expect(internalDeps).toHaveLength(0)
  })

  test("validates linear dependency chain (no diamonds)", () => {
    const graph = buildPackageDependencyGraph()

    // Core and Storage should NOT depend on each other
    const coreDeps = graph.get("@adhd-brain/core") || []
    const storageDeps = graph.get("@adhd-brain/storage") || []

    expect(coreDeps).not.toContain("@adhd-brain/storage")
    expect(storageDeps).not.toContain("@adhd-brain/core")
  })

  test("validates capture package properly aggregates dependencies", () => {
    const graph = buildPackageDependencyGraph()
    const captureDeps = graph.get("@adhd-brain/capture") || []

    expect(captureDeps).toContain("@adhd-brain/foundation")
    expect(captureDeps).toContain("@adhd-brain/core")
    expect(captureDeps).toContain("@adhd-brain/storage")
  })

  test("detects transitive circular dependencies", () => {
    // Test with synthetic circular dependency
    const syntheticGraph = new Map([
      ["@adhd-brain/core", ["@adhd-brain/foundation", "@adhd-brain/storage"]],
      ["@adhd-brain/storage", ["@adhd-brain/foundation", "@adhd-brain/core"]],
    ])

    const cycles = detectCircularDependencies(syntheticGraph)
    expect(cycles).toContainEqual([
      "@adhd-brain/core",
      "@adhd-brain/storage",
      "@adhd-brain/core",
    ])
  })
})
```

**Package Export Validation:**

```typescript
// tools/test/patterns/export-validation.test.ts
describe('Package Export Patterns', () => {
  test('validates consistent export structure across packages', () => {
    const packages = ['foundation', 'core', 'storage', 'capture']

    packages.forEach(pkg => {
      const packageJson = loadPackageJson(`@adhd-brain/${pkg}`)

      expect(packageJson.exports).toHaveProperty('.')
      expect(packageJson.exports['.']).toHaveProperty('import')
      expect(packageJson.exports['.']).toHaveProperty('types')

      // Validate paths point to dist/ folder
      expect(packageJson.exports['.'].import).toMatch(/^\./dist\/.*\.js$/)
      expect(packageJson.exports['.'].types).toMatch(/^\./dist\/.*\.d\.ts$/)
    })
  })

  test('validates build outputs exist for all packages', async () => {
    await execAsync('pnpm build') // Ensure built

    const packages = ['foundation', 'core', 'storage', 'capture']

    packages.forEach(pkg => {
      const distPath = `packages/@adhd-brain/${pkg}/dist`

      expect(fs.existsSync(`${distPath}/index.js`)).toBe(true)
      expect(fs.existsSync(`${distPath}/index.d.ts`)).toBe(true)
      expect(fs.existsSync(`${distPath}/index.js.map`)).toBe(true)
    })
  })

  test('validates type-only imports work correctly', () => {
    // Test that type imports don't create runtime dependencies
    const typeOnlyImport = `
      import type { CaptureItem } from '@adhd-brain/foundation'

      export function processCaptureTypes(item: CaptureItem): void {
        // This should compile but not create runtime dependency
      }
    `

    expect(() => {
      ts.transpile(typeOnlyImport, {
        moduleResolution: ts.ModuleResolutionKind.Node16,
        module: ts.ModuleKind.Node16
      })
    }).not.toThrow()
  })
})
```

### 6.2 Workspace Configuration Testing

**PNPM Workspace Validation:**

```typescript
// tools/test/patterns/workspace-config.test.ts
describe("Workspace Configuration", () => {
  test("validates pnpm-workspace.yaml discovers all packages", () => {
    const workspaceConfig = loadYAML("pnpm-workspace.yaml")
    const discoveredPackages = glob.sync(workspaceConfig.packages)

    const expectedPackages = [
      "packages/@adhd-brain/foundation",
      "packages/@adhd-brain/core",
      "packages/@adhd-brain/storage",
      "packages/@adhd-brain/capture",
    ]

    expectedPackages.forEach((pkg) => {
      expect(
        discoveredPackages.some((discovered) =>
          discovered.includes(pkg.split("/").pop())
        )
      ).toBe(true)
    })
  })

  test("validates workspace dependencies use workspace: protocol", () => {
    const packages = ["core", "storage", "capture"]

    packages.forEach((pkg) => {
      const packageJson = loadPackageJson(`@adhd-brain/${pkg}`)
      const deps = packageJson.dependencies || {}

      Object.keys(deps).forEach((depName) => {
        if (depName.startsWith("@adhd-brain/")) {
          expect(deps[depName]).toMatch(/^workspace:/)
        }
      })
    })
  })

  test("validates package manager lockfile integrity", () => {
    expect(fs.existsSync("pnpm-lock.yaml")).toBe(true)

    // Validate lockfile is not corrupted
    const lockfile = fs.readFileSync("pnpm-lock.yaml", "utf-8")
    expect(() => YAML.parse(lockfile)).not.toThrow()
  })
})
```

---

## 7) CI/CD Integration Tests

### 7.1 GitHub Actions Validation

**CI Pipeline Testing:**

```typescript
// tools/test/ci/github-actions.test.ts
describe("CI/CD Integration", () => {
  test("validates CI workflow configuration", () => {
    const workflow = loadYAML(".github/workflows/ci.yml")

    expect(workflow.on).toContain("pull_request")
    expect(workflow.jobs.test.steps).toContainEqual(
      expect.objectContaining({
        name: "Run tests",
        run: expect.stringContaining("pnpm test"),
      })
    )
  })

  test("validates required checks are configured", () => {
    const workflow = loadYAML(".github/workflows/ci.yml")
    const steps = workflow.jobs.test.steps

    const requiredSteps = [
      "pnpm install",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
      "pnpm doctor",
    ]

    requiredSteps.forEach((step) => {
      expect(steps.some((s) => s.run?.includes(step))).toBe(true)
    })
  })

  test("validates performance thresholds in CI", async () => {
    // Simulate CI environment
    process.env.CI = "true"

    const start = Date.now()
    await execAsync("pnpm test --run") // No watch mode in CI
    const testDuration = Date.now() - start

    expect(testDuration).toBeLessThan(60_000) // CI target: < 60s

    delete process.env.CI
  })
})
```

**Dependency Security Testing:**

```typescript
// tools/test/ci/security-validation.test.ts
describe("Dependency Security", () => {
  test("validates no high-severity vulnerabilities", async () => {
    const auditResult = await execAsync("pnpm audit --audit-level high")
    expect(auditResult.exitCode).toBe(0)
  })

  test("validates license compatibility", async () => {
    const licensesResult = await execAsync("pnpm licenses list --json")
    const licenses = JSON.parse(licensesResult.stdout)

    const problematicLicenses = ["GPL-3.0", "AGPL-3.0", "LGPL-3.0"]

    licenses.forEach(({ license }) => {
      expect(problematicLicenses).not.toContain(license)
    })
  })

  test("validates reproducible builds", async () => {
    // Clean and rebuild
    await execAsync("pnpm clean")
    await execAsync("pnpm build")

    const hash1 = await calculateBuildHash()

    // Clean and rebuild again
    await execAsync("pnpm clean")
    await execAsync("pnpm build")

    const hash2 = await calculateBuildHash()

    expect(hash1).toBe(hash2) // Builds should be deterministic
  })
})
```

---

## 8) Success Criteria

### 8.1 Measurable Outcomes

**Foundation Readiness Gates:**

| Criteria                   | Target                       | Measurement                  | Priority |
| -------------------------- | ---------------------------- | ---------------------------- | -------- |
| Zero circular dependencies | 0 violations                 | `madge --circular packages/` | P0       |
| Build performance          | < 30s                        | `time pnpm build`            | P0       |
| Test performance           | < 30s                        | `time pnpm test`             | P0       |
| Setup performance          | < 5 min                      | Fresh clone → first test     | P0       |
| Test isolation             | 0 conflicts                  | 10 parallel runs, 0 failures | P0       |
| Package count enforcement  | ≤ 4 packages                 | Doctor command validation    | P0       |
| Coverage thresholds        | Foundation: 90%, Others: 80% | Vitest coverage report       | P1       |
| Doctor health checks       | All pass                     | `pnpm doctor` exit code 0    | P1       |
| CLI startup time           | < 1s                         | `time adhd --version`        | P1       |
| Hot reload speed           | < 1s                         | File change → rebuild        | P1       |

**Quality Gates (Must Pass Before Feature Development):**

```bash
#!/bin/bash
# tools/scripts/validate-foundation.sh

set -e

echo "🔍 Validating Foundation Monorepo..."

# P0 Critical Checks
echo "📦 Checking package boundaries..."
pnpm madge --circular packages/ --no-color

echo "⚡ Checking build performance..."
time pnpm build

echo "🧪 Checking test performance..."
time pnpm test

echo "🔧 Running health checks..."
pnpm doctor

echo "📊 Validating coverage thresholds..."
pnpm test --coverage --reporter=json | jq '.coverageMap' | grep -q '"pct":[89][0-9]'

echo "✅ Foundation validation complete!"
```

### 8.2 Continuous Monitoring

**Performance Regression Detection:**

```typescript
// tools/test/monitoring/performance-regression.test.ts
describe("Performance Regression Detection", () => {
  test("tracks build time trends", async () => {
    const buildMetrics = await loadBuildMetrics() // From previous runs

    const start = Date.now()
    await execAsync("pnpm build")
    const currentBuildTime = Date.now() - start

    const averageBuildTime =
      buildMetrics.reduce((a, b) => a + b, 0) / buildMetrics.length
    const regressionThreshold = averageBuildTime * 1.5 // 50% slower than average

    if (currentBuildTime > regressionThreshold) {
      console.warn(
        `Build time regression detected: ${currentBuildTime}ms > ${regressionThreshold}ms`
      )
    }

    expect(currentBuildTime).toBeLessThan(30_000) // Hard limit

    await saveBuildMetric(currentBuildTime)
  })

  test("tracks test suite growth", async () => {
    const testMetrics = await execAsync("pnpm test --reporter=json")
    const results = JSON.parse(testMetrics.stdout)

    expect(results.numTotalTests).toBeGreaterThan(0)
    expect(results.success).toBe(true)

    // Alert if test suite becomes too large
    if (results.numTotalTests > 200) {
      console.warn("Test suite growing large, consider optimization")
    }
  })
})
```

---

## 9) Tooling & TestKit Integration

**Vitest Configuration:**

```typescript
// vitest.config.ts (root)
import { defineConfig } from "vitest/config"
import { createBaseVitestConfig } from "@orchestr8/testkit/vitest-config"

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: "adhd-brain-foundation",
      environment: "node",
      globals: true,
      coverage: {
        enabled: process.env.CI === "true",
        provider: "v8",
        reporter: ["text", "html", "json"],
        thresholds: {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
      projects: [
        {
          test: {
            name: "foundation",
            include: ["packages/@adhd-brain/foundation/**/*.test.ts"],
          },
        },
        {
          test: {
            name: "core",
            include: ["packages/@adhd-brain/core/**/*.test.ts"],
          },
        },
        {
          test: {
            name: "storage",
            include: ["packages/@adhd-brain/storage/**/*.test.ts"],
          },
        },
        {
          test: {
            name: "capture",
            include: ["packages/@adhd-brain/capture/**/*.test.ts"],
          },
        },
      ],
    },
  })
)
```

**Dependency Validation Tools:**

```json
{
  "devDependencies": {
    "madge": "^7.0.0",
    "dependency-cruiser": "^16.0.0",
    "eslint-plugin-import": "^2.29.1"
  }
}
```

**Madge Configuration:**

```json
{
  "detectiveOptions": {
    "ts": {
      "skipTypeImports": false
    }
  },
  "excludeRegExp": ["node_modules", "dist", ".test.ts"],
  "fileExtensions": ["ts", "tsx"],
  "webpack": false
}
```

**Dependency Cruiser Configuration:**

```javascript
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "foundation-has-no-deps",
      severity: "error",
      from: { path: "packages/@adhd-brain/foundation" },
      to: {
        path: "packages/@adhd-brain/",
        pathNot: "^packages/@adhd-brain/foundation",
      },
    },
    {
      name: "core-no-storage",
      severity: "error",
      from: { path: "packages/@adhd-brain/core" },
      to: { path: "packages/@adhd-brain/storage" },
    },
  ],
}
```

### 5.2 TestKit Helpers

**Memory SQLite for Storage Tests:**

```typescript
import { createMemoryUrl, applyTestPragmas } from "@orchestr8/testkit/sqlite"
import Database from "better-sqlite3"

describe("Storage Tests", () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(createMemoryUrl())
    applyTestPragmas(db)
  })

  afterEach(() => {
    db.close()
  })

  test("creates isolated database per test", () => {
    db.exec("CREATE TABLE test (id INTEGER)")
    const result = db
      .prepare('SELECT * FROM sqlite_master WHERE type="table"')
      .all()
    expect(result).toHaveLength(1)
  })
})
```

**MSW for API Mocks (Future Gmail Integration):**

```typescript
import { setupMSW, http, createSuccessResponse } from "@orchestr8/testkit/msw"

describe("Gmail API Tests", () => {
  setupMSW([
    http.post("https://oauth2.googleapis.com/token", () =>
      createSuccessResponse({ access_token: "mock-token", expires_in: 3600 })
    ),
    http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", () =>
      createSuccessResponse({ messages: [] })
    ),
  ])

  test("mocks Gmail API responses", async () => {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    )
    expect(response.ok).toBe(true)
  })
})
```

**CLI Command Mocking:**

```typescript
import { quickMocks } from "@orchestr8/testkit/cli"
import { execSync } from "child_process"

describe("CLI Integration", () => {
  beforeEach(() => {
    quickMocks.success("pnpm --version", "9.15.4")
    quickMocks.success("node --version", "v20.0.0")
    quickMocks.success("turbo --version", "v2.5.6")
  })

  test("validates tooling versions", () => {
    const pnpmVersion = execSync("pnpm --version", { encoding: "utf-8" }).trim()
    expect(pnpmVersion).toBe("9.15.4")
  })
})
```

**Time Control for Performance Tests:**

```typescript
import { useFakeTimers, advanceTimersByTime } from "@orchestr8/testkit/env"

describe("Performance Tests", () => {
  useFakeTimers()

  test("measures build duration", () => {
    const start = Date.now()
    advanceTimersByTime(25_000) // Simulate 25s build
    const duration = Date.now() - start

    expect(duration).toBe(25_000)
    expect(duration).toBeLessThan(30_000) // Target: < 30s
  })
})
```

**Temp Directory for Setup Tests:**

```typescript
import { createTempDirectory } from "@orchestr8/testkit/fs"

describe("Setup Workflow", () => {
  test("validates fresh setup in temp directory", async () => {
    const temp = await createTempDirectory({ prefix: "setup-test-" })

    // Simulate git clone
    await execAsync(`git clone . ${temp.path}`)

    // Run setup
    await execAsync("pnpm install", { cwd: temp.path })
    await execAsync("pnpm build", { cwd: temp.path })

    // Verify outputs
    const packages = ["foundation", "core", "storage", "capture"]
    for (const pkg of packages) {
      await temp.assertFileExists(`packages/@adhd-brain/${pkg}/dist/index.js`)
      await temp.assertFileExists(`packages/@adhd-brain/${pkg}/dist/index.d.ts`)
    }

    await temp.cleanup()
  })
})
```

### 5.3 Custom Test Utilities

**Build Log Parser:**

```typescript
export function extractBuildTime(log: string, packageName: string) {
  const regex = new RegExp(`${packageName}.*built in (\\d+\\.\\d+)s`)
  const match = log.match(regex)
  return match ? parseFloat(match[1]) * 1000 : null
}

export function extractCacheHits(log: string) {
  const hits = log.match(/cache:(\d+) hit/)?.[1]
  const misses = log.match(/cache:(\d+) miss/)?.[1]
  return { hits: parseInt(hits || "0"), misses: parseInt(misses || "0") }
}
```

**Package JSON Loader:**

```typescript
export function loadPackageJson(packageName: string) {
  const pkgPath = path.join(
    process.cwd(),
    "packages",
    packageName.replace("@adhd-brain/", ""),
    "package.json"
  )
  return JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
}

export function writePackageJson(packageName: string, data: object) {
  const pkgPath = path.join(
    process.cwd(),
    "packages",
    packageName.replace("@adhd-brain/", ""),
    "package.json"
  )
  fs.writeFileSync(pkgPath, JSON.stringify(data, null, 2))
}
```

**Config Validators:**

```typescript
export function validateTurboConfig() {
  const config = JSON.parse(fs.readFileSync("turbo.json", "utf-8"))

  assert(
    config.tasks.build.dependsOn.includes("^build"),
    "build task missing ^build dependency"
  )
  assert(
    config.tasks.test.dependsOn.includes("^build"),
    "test task missing ^build dependency"
  )
  assert(
    config.remoteCache.signature === false,
    "remote cache must be disabled for privacy"
  )

  return config
}

export function validateVitestConfig() {
  const config = loadVitestConfig()

  assert(config.test?.globals === true, "Vitest globals must be enabled")
  assert(config.test?.environment === "node", "Vitest environment must be node")
  assert(
    config.test?.coverage?.thresholds?.statements >= 80,
    "Coverage threshold too low"
  )

  return config
}
```

---

## 10) Non-Goals (YAGNI Deferrals)

### 6.1 Out of Scope for MPPP

**Visual Testing (P2 Priority):**

- ❌ Snapshot testing of CLI output formatting
- ❌ Color/styling verification in terminal
- ❌ Logo/branding display tests
- **Rationale:** Visual polish not critical for MPPP, manual verification sufficient
- **Trigger to Revisit:** Multi-user adoption requires polished UX

**Performance Benchmarking (Phase 2+):**

- ❌ Continuous performance regression testing
- ❌ Build time trend analysis
- ❌ Memory profiling and optimization
- **Rationale:** Basic performance targets sufficient for MPPP (build < 30s, test < 30s)
- **Trigger to Revisit:** Performance degrades below targets (>2x baseline)

**Advanced Monitoring (Phase 3+):**

- ❌ Real-time build metrics dashboard
- ❌ Test suite execution trend analysis
- ❌ Package size tracking over time
- **Rationale:** Local-first MPPP doesn't require telemetry infrastructure
- **Trigger to Revisit:** Multi-contributor workflow needs observability

**E2E Network Failure Simulation (Low Priority):**

- ❌ Network interruption during pnpm install
- ❌ Registry unavailability scenarios
- ❌ Offline development workflow
- **Rationale:** Local-first tool with stable dependencies, low risk
- **Trigger to Revisit:** Frequent offline work patterns emerge

**Multi-Platform Testing (Out of Scope):**

- ❌ Windows compatibility tests
- ❌ Linux distribution testing
- ❌ Docker container validation
- **Rationale:** MPPP is macOS-only (local-first development)
- **Trigger to Revisit:** Cross-platform distribution requested

### 6.2 Explicit YAGNI Boundaries

**What We're NOT Testing:**

- Changesets workflow (no versioning in MPPP)
- Remote Turbo cache behavior (disabled for privacy)
- Storybook components (no UI library in MPPP)
- Playwright E2E flows (CLI-only app)
- Docker deployment (macOS local app)
- CI/CD pipeline validation (beyond basic GitHub Actions)

**Deferred to Phase 3+:**

- Advanced caching strategies (Turbo cache sufficient)
- Distributed build orchestration (single-user doesn't need it)
- Monorepo plugin architecture (no extensibility in MPPP)
- Custom lint rule development (ESLint plugins sufficient)

---

## 11) Test Execution Strategy

### 7.1 Local Development Workflow

**Pre-Commit Hook (fast feedback):**

```bash
#!/bin/sh
# .husky/pre-commit

# Fast checks only (< 10s total)
pnpm lint --fix
pnpm typecheck
pnpm test:unit  # Unit tests only, no integration

# Stage changes
git add -u
```

**Pre-Push Hook (comprehensive validation):**

```bash
#!/bin/sh
# .husky/pre-push

# Full validation (< 60s total)
pnpm lint
pnpm typecheck
pnpm test           # All tests including integration
pnpm build          # Ensure buildable
pnpm doctor         # Health check
```

**Watch Mode (development):**

```bash
# Terminal 1: Watch mode for code changes
pnpm dev

# Terminal 2: Watch mode for tests
pnpm test:watch

# Terminal 3: Type checking
pnpm typecheck --watch
```

### 7.2 CI Pipeline (GitHub Actions)

**Pull Request Validation:**

```yaml
name: CI
on: [pull_request]

jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run lint
        run: pnpm lint

      - name: Run typecheck
        run: pnpm typecheck

      - name: Run tests
        run: pnpm test --coverage

      - name: Run build
        run: pnpm build

      - name: Run doctor
        run: pnpm doctor

      - name: Validate circular dependencies
        run: pnpm madge --circular packages/

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

**Nightly Performance Validation:**

```yaml
name: Nightly Performance
on:
  schedule:
    - cron: "0 0 * * *"

jobs:
  performance:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4

      - name: Fresh setup performance test
        run: |
          time pnpm install
          time pnpm build
          time pnpm test

      - name: Validate performance targets
        run: pnpm test:performance

      - name: Report results
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'Performance regression detected',
              body: 'Nightly performance tests failed. See workflow logs.'
            })
```

### 7.3 Test Execution Modes

**Mode 1: Fast Feedback (< 10s)**

```bash
# Unit tests only
pnpm test:unit

# Specific package
pnpm test --filter=@adhd-brain/foundation
```

**Mode 2: Comprehensive (< 60s)**

```bash
# All tests with coverage
pnpm test --coverage

# All tests in CI mode
CI=true pnpm test
```

**Mode 3: Integration Only (< 30s)**

```bash
# Integration tests only
pnpm test:integration

# E2E tests only
pnpm test:e2e
```

**Mode 4: Continuous (watch mode)**

```bash
# Watch all packages
pnpm test:watch

# Watch specific package
pnpm test:watch --filter=@adhd-brain/core
```

---

## 12) Coverage Metrics & Reporting

### 8.1 Coverage Thresholds

**Per-Package Thresholds:**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        // Foundation (highest risk - shared types)
        "packages/@adhd-brain/foundation/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        // Core (high risk - business logic)
        "packages/@adhd-brain/core/**": {
          statements: 85,
          branches: 80,
          functions: 85,
          lines: 85,
        },
        // Storage (high risk - data integrity)
        "packages/@adhd-brain/storage/**": {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
        // Capture (medium risk - orchestration)
        "packages/@adhd-brain/capture/**": {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
})
```

### 8.2 Reporting Formats

**CI Report (JSON + Text):**

```bash
pnpm test --coverage --reporter=json --reporter=text
```

**Local Report (HTML):**

```bash
pnpm test --coverage --reporter=html
open coverage/index.html
```

**Coverage Badge (README):**

```markdown
[![Coverage](https://codecov.io/gh/nathanvale/adhd-brain/branch/main/graph/badge.svg)](https://codecov.io/gh/nathanvale/adhd-brain)
```

### 8.3 Uncovered Code Analysis

**Identify Critical Gaps:**

```bash
# Show uncovered lines in high-risk files
pnpm test --coverage --reporter=text | grep -A 5 "foundation\|core\|storage"
```

**Coverage Diff (PR Context):**

```bash
# Compare coverage before/after PR
npx coverage-diff compare main HEAD
```

---

## 13) Maintenance & Updates

### 9.1 Test Maintenance Schedule

**Weekly (Automated):**

- Run full test suite in CI
- Validate performance targets
- Check dependency security alerts

**Monthly (Manual Review):**

- Review flaky test reports
- Update test timeouts if needed
- Audit coverage gaps in new code

**Quarterly (Refactoring):**

- Refactor brittle tests
- Update test utilities
- Review YAGNI boundaries

### 9.2 Test Debt Tracking

**Technical Debt Categories:**

1. **P0 Critical:** Broken tests blocking development
2. **P1 High:** Missing tests for high-risk code
3. **P2 Medium:** Flaky tests needing stabilization
4. **P3 Low:** Coverage gaps in low-risk code

**Tracking Process:**

- Create GitHub issues for test debt
- Tag with `test-debt` label
- Link to failing CI runs or coverage reports
- Schedule debt paydown in Sprint planning

### 9.3 Version Compatibility Testing

**Node.js Versions:**

```yaml
# .github/workflows/compatibility.yml
strategy:
  matrix:
    node: [20, 21, 22]
```

**Tooling Updates:**

- Monitor pnpm release notes
- Test Turbo upgrades in feature branch
- Validate Vitest updates with full suite
- Document breaking changes in ADRs

---

## 14) Related Documentation

### Foundation Documents

- [Master PRD v2.3.0-MPPP](/Users/nathanvale/code/adhd-brain/docs/master/prd-master.md) - Overall system requirements
- [Roadmap v2.0.0-MPPP](/Users/nathanvale/code/adhd-brain/docs/master/roadmap.md) - Dependency-ordered delivery plan

### Feature Specifications

- [Foundation Monorepo PRD](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/prd-foundation-monorepo.md) - Product requirements
- [Foundation Monorepo Tech Spec](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-foundation-monorepo-tech.md) - Technical contracts

### Testing Guides

- [TDD Applicability Guide](/Users/nathanvale/code/adhd-brain/docs/guides/guide-tdd-applicability.md) - When to apply TDD
- [TestKit Usage Guide](/Users/nathanvale/code/adhd-brain/docs/guides/guide-testkit-usage.md) - Testing patterns
- [Test Strategy Guide](/Users/nathanvale/code/adhd-brain/docs/guides/guide-test-strategy.md) - Overall testing approach
- [Phase 1 Testing Patterns](/Users/nathanvale/code/adhd-brain/docs/guides/guide-phase1-testing-patterns.md) - MPPP-specific patterns

### Gold Standard Repository

**Location:** `/Users/nathanvale/code/bun-changesets-template/`

**Reference Files:**

- `vitest.config.ts` - Multi-project test configuration
- `package.json` - Test scripts and coverage setup
- `.husky/pre-commit` - Git hook examples
- `.github/workflows/ci.yml` - CI pipeline patterns

---

## 15) Nerdy Joke Corner

This test suite is like a well-organized ADHD brain's filing system—comprehensive but not overwhelming, fast enough to maintain focus (< 30s), and with enough redundancy to catch the sneaky circular dependencies that try to form when you're distracted by a shiny new feature. The doctor command is basically your monorepo's therapist, gently reminding you when your package structure is getting a bit too codependent. And if you're wondering why we're so obsessed with test isolation, it's because shared state in tests is the software engineering equivalent of leaving your keys in the fridge—you know it happened, but you have no idea how or why. 🔄

---

**Next Steps:**

1. **Week 2:** Implement critical dependency validation tests (P0)
2. **Week 2:** Add build pipeline integration tests
3. **Week 2:** Validate test isolation with parallel execution
4. **Week 3:** Implement doctor command with all health checks
5. **Week 3:** Achieve 90% coverage on foundation package

**Remember:** Foundation tests are the most critical tests in the entire project. All features depend on a solid, validated foundation. Write these tests FIRST before any implementation. 🎯
