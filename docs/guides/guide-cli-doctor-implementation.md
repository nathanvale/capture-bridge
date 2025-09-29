---
title: CLI Doctor Command Implementation Guide
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-27
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# CLI Doctor Command Implementation Guide

> **Guide Type:** Implementation reference for doctor command development
> **Audience:** Developers implementing health diagnostics
> **Scope:** Complete implementation guide for `adhd doctor` command

## Related Documentation

- [CLI Feature PRD](../features/cli/prd-cli.md) - Section 4 (Health Check Flow)
- [Master PRD](../master/prd-master.md) - Section 5.3 (Health Command)
- [Capture Feature PRD](../features/capture/prd-capture.md) - Section 10.3 (Crash Recovery)
- [Metrics Contract Tech Spec](../cross-cutting/spec-metrics-contract-tech.md) - §7.2 (Health Check Format)
- [Error Recovery Tech Spec](../guides/guide-error-recovery.md) - Error states to check
- [Health Command Usage Guide](./health-command.md) - End-user documentation

---

## 1. Scope & Interfaces

### 1.1 Purpose

The **CLI Doctor command** (`capture doctor` or `adhd doctor`) provides comprehensive infrastructure validation and operational health diagnostics for the ADHD Brain capture system. It serves as the **first debugging tool** for users and developers, detecting 95%+ of common operational issues before they cause data loss or capture failures.

**Primary Objectives:**

1. **Infrastructure Validation:** Verify all system dependencies are present and configured correctly
2. **Serviceability Diagnostics:** Report operational status and recent error history
3. **Operational Health:** Assess resource availability and system performance
4. **Actionable Guidance:** Provide clear recommendations for resolving detected issues

**Success Criteria:**

- Runtime < 500ms (p95)
- Detect 95%+ of common issues (missing dependencies, permissions, connectivity)
- Zero false positives (all reported errors are actionable)
- Exit codes stable across versions (contract for automation)

### 1.2 Public Interfaces

#### Command Interface

```bash
# Basic health check (human-readable output)
$ adhd doctor

# JSON output (machine-readable for automation)
$ adhd doctor --json

# Verbose output (include all diagnostic details)
$ adhd doctor --verbose

# Check specific component only
$ adhd doctor --component=voice
$ adhd doctor --component=email
$ adhd doctor --component=database
$ adhd doctor --component=vault
$ adhd doctor --component=metrics
```

#### Command Signature

```typescript
interface DoctorCommand {
  execute(options: DoctorOptions): Promise<DoctorResult>;
}

interface DoctorOptions {
  json: boolean;                      // Output JSON instead of human-readable
  verbose: boolean;                   // Include diagnostic details
  component?: ComponentFilter;        // Filter checks by component
}

type ComponentFilter =
  | 'voice'                           // Voice capture checks only
  | 'email'                           // Email capture checks only
  | 'database'                        // SQLite database checks only
  | 'vault'                           // Obsidian vault checks only
  | 'metrics';                        // Metrics collection checks only

interface DoctorResult {
  overallStatus: HealthStatus;
  components: ComponentHealth[];
  summary: HealthSummary;
  recommendations: Recommendation[];
  exitCode: ExitCode;
}

type HealthStatus = 'ok' | 'warn' | 'error';
type ExitCode = 0 | 1 | 2;          // 0=healthy, 1=warnings, 2=errors
```

### 1.3 Exit Codes (Contract)

**Exit Code Semantics:**

```typescript
enum DoctorExitCode {
  HEALTHY = 0,           // All checks passed
  WARNINGS = 1,          // Non-critical issues detected
  ERRORS = 2             // Critical issues requiring action
}
```

**Exit Code Determination Logic:**

```typescript
function determineExitCode(components: ComponentHealth[]): ExitCode {
  // Aggregate all check statuses across components
  const allChecks = components.flatMap(c => c.checks);

  // Any error status → exit code 2
  if (allChecks.some(check => check.status === 'error')) {
    return DoctorExitCode.ERRORS;
  }

  // Any warning status → exit code 1
  if (allChecks.some(check => check.status === 'warn')) {
    return DoctorExitCode.WARNINGS;
  }

  // All checks passed → exit code 0
  return DoctorExitCode.HEALTHY;
}
```

**Contract Stability:**

- Exit codes are **immutable** (breaking change requires major version bump)
- Automation scripts depend on stable exit codes
- Test coverage: 100% for exit code determination logic

### 1.4 Health Checks Performed

**Voice Component:**

1. **Voice folder accessibility** - Voice Memos folder exists and is readable
2. **Voice folder permissions** - Voice Memos folder has correct permissions
3. **icloudctl binary presence** - icloudctl executable available in PATH
4. **Whisper model availability** - Whisper medium model file present
5. **Voice last poll timestamp** - Voice polling operational (< 5 minutes ago)

**Email Component:**

6. **Gmail OAuth2 credentials** - credentials.json exists
7. **Gmail OAuth2 token** - token.json exists and not expired
8. **Email last poll timestamp** - Email polling operational (< 5 minutes ago)

**Database Component:**

9. **SQLite database accessible** - Database file exists and is readable
10. **SQLite schema valid** - Expected tables present
11. **SQLite integrity** - PRAGMA integrity_check passes
12. **SQLite WAL size** - WAL file within normal range (< 10MB)

**Vault Component:**

13. **Vault path exists** - Obsidian vault directory exists
14. **Vault path writable** - Vault inbox/ folder writable
15. **Vault disk space** - Sufficient disk space (> 1GB available)

**Metrics Component:**

16. **Metrics enabled status** - CAPTURE_METRICS environment variable
17. **Metrics directory writable** - .metrics directory writable (if enabled)
18. **Metrics disk space** - Metrics directory size within limits (< 1GB)

### 1.5 JSON Output Schema

```typescript
interface DoctorOutput {
  version: string;                    // Schema version (e.g., "1.0.0")
  timestamp: string;                  // ISO 8601 UTC
  status: HealthStatus;               // Overall status
  components: ComponentHealth[];
  summary: HealthSummary;
  recommendations: Recommendation[];
  exitCode: ExitCode;
}

interface ComponentHealth {
  name: string;                       // Component name
  status: HealthStatus;               // Aggregated component status
  checks: Check[];                    // Individual check results
  duration_ms: number;                // Component check duration
}

interface Check {
  name: string;                       // Check identifier
  status: HealthStatus;               // Check status
  message: string;                    // Human-readable result
  details?: Record<string, unknown>;  // Optional structured data (verbose mode)
}

interface HealthSummary {
  total_checks: number;
  passed: number;
  warnings: number;
  errors: number;
  duration_ms: number;
}

interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  component: string;
  issue: string;
  action: string;                     // Clear remediation step
  documentation_url?: string;         // Link to guide (optional)
}
```

**JSON Schema Versioning:**

- Schema version included in output (`version` field)
- Backward compatibility required for minor/patch versions
- Breaking changes require major version bump
- Contract tests validate schema compliance

---

## 2. Data & Storage

### 2.1 Check Registry

**Check Definition Schema:**

```typescript
interface HealthCheckDefinition {
  id: string;                         // Unique check identifier
  name: string;                       // Human-readable name
  component: string;                  // Component category
  description: string;                // Check description
  run: (context: CheckContext) => Promise<CheckResult>;
  getRecommendation?: (result: CheckResult) => string;
}

interface CheckContext {
  config: Config;
  logger: Logger;
  verbose: boolean;
}

interface CheckResult {
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
}
```

**Canonical Check Registry:**

```typescript
const HEALTH_CHECKS: HealthCheckDefinition[] = [
  // Voice Component
  {
    id: 'voice_folder_exists',
    name: 'Voice Folder Exists',
    component: 'voice',
    description: 'Voice Memos folder exists and is accessible',
    run: checkVoiceFolderExists,
    getRecommendation: (result) =>
      'Check Full Disk Access permissions in System Settings > Privacy & Security'
  },
  {
    id: 'voice_folder_readable',
    name: 'Voice Folder Readable',
    component: 'voice',
    description: 'Voice Memos folder has read permissions',
    run: checkVoiceFolderReadable,
    getRecommendation: (result) =>
      'Grant Full Disk Access to Terminal/iTerm in System Settings'
  },
  {
    id: 'icloudctl_available',
    name: 'icloudctl Available',
    component: 'voice',
    description: 'icloudctl binary present and executable',
    run: checkIcloudctlAvailable,
    getRecommendation: (result) =>
      'Install icloudctl: see docs/guides/voice-capture-setup.md'
  },
  {
    id: 'whisper_model_available',
    name: 'Whisper Model Available',
    component: 'voice',
    description: 'Whisper medium model file present',
    run: checkWhisperModelAvailable,
    getRecommendation: (result) =>
      'Download Whisper medium model: adhd capture voice setup'
  },
  {
    id: 'voice_last_poll',
    name: 'Voice Polling Status',
    component: 'voice',
    description: 'Voice polling operational (last poll < 5 minutes)',
    run: checkVoiceLastPoll,
    getRecommendation: (result) =>
      'Check voice polling worker: adhd capture voice status'
  },

  // Email Component
  {
    id: 'gmail_credentials_present',
    name: 'Gmail Credentials Present',
    component: 'email',
    description: 'Gmail API credentials.json exists',
    run: checkGmailCredentialsPresent,
    getRecommendation: (result) =>
      'Download credentials.json from Google Cloud Console'
  },
  {
    id: 'gmail_token_valid',
    name: 'Gmail Token Valid',
    component: 'email',
    description: 'Gmail API token.json exists and not expired',
    run: checkGmailTokenValid,
    getRecommendation: (result) =>
      'Run Gmail OAuth2 flow: adhd capture email init'
  },
  {
    id: 'email_last_poll',
    name: 'Email Polling Status',
    component: 'email',
    description: 'Email polling operational (last poll < 5 minutes)',
    run: checkEmailLastPoll,
    getRecommendation: (result) =>
      'Check email polling worker: adhd capture email status'
  },

  // Database Component
  {
    id: 'database_accessible',
    name: 'Database Accessible',
    component: 'database',
    description: 'SQLite database file exists and is readable',
    run: checkDatabaseAccessible,
    getRecommendation: (result) =>
      'Initialize database: adhd db init'
  },
  {
    id: 'database_schema_valid',
    name: 'Database Schema Valid',
    component: 'database',
    description: 'Database schema matches expected version',
    run: checkDatabaseSchemaValid,
    getRecommendation: (result) =>
      'Run database migrations: adhd db migrate'
  },
  {
    id: 'database_integrity',
    name: 'Database Integrity',
    component: 'database',
    description: 'PRAGMA integrity_check passes',
    run: checkDatabaseIntegrity,
    getRecommendation: (result) =>
      'Restore from backup: adhd db restore --latest'
  },
  {
    id: 'database_wal_size',
    name: 'Database WAL Size',
    component: 'database',
    description: 'WAL file size within normal range',
    run: checkDatabaseWalSize,
    getRecommendation: (result) =>
      'Run checkpoint manually: adhd db checkpoint'
  },

  // Vault Component
  {
    id: 'vault_path_exists',
    name: 'Vault Path Exists',
    component: 'vault',
    description: 'Obsidian vault directory exists',
    run: checkVaultPathExists,
    getRecommendation: (result) =>
      'Create vault directory: mkdir -p "${VAULT_PATH}"'
  },
  {
    id: 'vault_writable',
    name: 'Vault Writable',
    component: 'vault',
    description: 'Vault inbox/ folder writable',
    run: checkVaultWritable,
    getRecommendation: (result) =>
      'Fix permissions: chmod u+w "${VAULT_PATH}/inbox"'
  },
  {
    id: 'vault_disk_space',
    name: 'Vault Disk Space',
    component: 'vault',
    description: 'Sufficient disk space available',
    run: checkVaultDiskSpace,
    getRecommendation: (result) =>
      'Free up disk space: at least 1GB required'
  },

  // Metrics Component
  {
    id: 'metrics_enabled',
    name: 'Metrics Enabled',
    component: 'metrics',
    description: 'Metrics collection status',
    run: checkMetricsEnabled,
    getRecommendation: (result) =>
      'Enable metrics: export CAPTURE_METRICS=1'
  },
  {
    id: 'metrics_directory_writable',
    name: 'Metrics Directory Writable',
    component: 'metrics',
    description: 'Metrics directory writable (if enabled)',
    run: checkMetricsDirectoryWritable,
    getRecommendation: (result) =>
      'Create metrics directory: mkdir -p .metrics'
  },
  {
    id: 'metrics_disk_space',
    name: 'Metrics Disk Space',
    component: 'metrics',
    description: 'Metrics directory size within limits',
    run: checkMetricsDiskSpace,
    getRecommendation: (result) =>
      'Clean up old metrics: adhd metrics cleanup --older-than=30d'
  }
];
```

### 2.2 Check Implementation Patterns

#### File System Check Pattern

```typescript
async function checkVaultPathExists(context: CheckContext): Promise<CheckResult> {
  const { config, verbose } = context;
  const vaultPath = config.vault.root;

  try {
    const stats = await fs.stat(vaultPath);

    if (!stats.isDirectory()) {
      return {
        status: 'error',
        message: `Vault path exists but is not a directory: ${vaultPath}`,
        details: verbose ? { path: vaultPath, type: 'file' } : undefined
      };
    }

    return {
      status: 'ok',
      message: `Vault path exists: ${vaultPath}`,
      details: verbose ? { path: vaultPath } : undefined
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Vault path does not exist: ${vaultPath}`,
      details: verbose ? {
        path: vaultPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      } : undefined
    };
  }
}
```

#### Database Query Pattern

```typescript
async function checkDatabaseSchemaValid(context: CheckContext): Promise<CheckResult> {
  const { config, verbose } = context;
  const dbPath = config.database.path;

  try {
    const db = await openDatabase(dbPath);

    // Query for expected tables
    const tables = await db.all(`
      SELECT name FROM sqlite_master WHERE type='table'
      ORDER BY name
    `);

    const expectedTables = ['captures', 'exports_audit', 'errors_log', 'sync_state'];
    const actualTables = tables.map((t: { name: string }) => t.name);
    const missingTables = expectedTables.filter(t => !actualTables.includes(t));

    await db.close();

    if (missingTables.length > 0) {
      return {
        status: 'error',
        message: `Missing required tables: ${missingTables.join(', ')}`,
        details: verbose ? {
          expected: expectedTables,
          actual: actualTables,
          missing: missingTables
        } : undefined
      };
    }

    return {
      status: 'ok',
      message: 'Database schema valid',
      details: verbose ? { tables: actualTables } : undefined
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Database schema check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: verbose ? { dbPath, error: String(error) } : undefined
    };
  }
}
```

#### Resource Availability Pattern

```typescript
async function checkVaultDiskSpace(context: CheckContext): Promise<CheckResult> {
  const { config, verbose } = context;
  const vaultPath = config.vault.root;

  try {
    const diskUsage = await getDiskSpace(vaultPath);
    const availableGB = diskUsage.available / (1024 ** 3);
    const minRequiredGB = 1;

    if (availableGB < minRequiredGB) {
      return {
        status: 'warn',
        message: `Low disk space: ${availableGB.toFixed(2)} GB available (${minRequiredGB} GB recommended)`,
        details: verbose ? {
          available_gb: availableGB,
          required_gb: minRequiredGB,
          total_gb: diskUsage.total / (1024 ** 3)
        } : undefined
      };
    }

    return {
      status: 'ok',
      message: `Disk space sufficient: ${availableGB.toFixed(2)} GB available`,
      details: verbose ? {
        available_gb: availableGB,
        total_gb: diskUsage.total / (1024 ** 3)
      } : undefined
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to check disk space: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: verbose ? { path: vaultPath } : undefined
    };
  }
}
```

---

## 3. Control Flow

### 3.1 Command Execution Flow

```
1. Parse CLI arguments (--json, --verbose, --component)
2. Load configuration (validate paths, read credentials)
3. Initialize health check context
4. Filter checks by --component if specified
5. Run all checks in parallel (Promise.allSettled)
   a. Execute each check with timeout (5s per check)
   b. Collect results (ok/warn/error)
6. Aggregate results by component
7. Generate recommendations based on failures
8. Format output (JSON or human-readable)
9. Determine exit code (0/1/2)
10. Log execution time (verify < 500ms target)
```

### 3.2 Parallel Check Execution

**Rationale:** Checks are independent and I/O-bound. Parallel execution reduces total runtime.

```typescript
async function executeHealthChecks(
  checks: HealthCheckDefinition[],
  context: CheckContext
): Promise<ComponentHealth[]> {
  const startTime = performance.now();

  // Group checks by component
  const checksByComponent = groupBy(checks, 'component');

  // Execute all checks in parallel with timeout
  const componentResults = await Promise.all(
    Object.entries(checksByComponent).map(async ([component, componentChecks]) => {
      const componentStartTime = performance.now();

      const checkResults = await Promise.allSettled(
        componentChecks.map(check =>
          withTimeout(check.run(context), 5000, {
            status: 'error',
            message: `Check timed out after 5 seconds: ${check.name}`
          })
        )
      );

      const checks = checkResults.map((result, index) => ({
        name: componentChecks[index].id,
        ...(result.status === 'fulfilled' ? result.value : {
          status: 'error' as HealthStatus,
          message: result.reason?.message || 'Check failed'
        })
      }));

      const componentStatus = aggregateStatus(checks);
      const duration_ms = performance.now() - componentStartTime;

      return {
        name: component,
        status: componentStatus,
        checks,
        duration_ms
      };
    })
  );

  return componentResults;
}

function aggregateStatus(checks: Check[]): HealthStatus {
  if (checks.some(c => c.status === 'error')) return 'error';
  if (checks.some(c => c.status === 'warn')) return 'warn';
  return 'ok';
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}
```

### 3.3 Recommendation Generation

```typescript
interface RecommendationRule {
  checkId: string;
  condition: (check: Check) => boolean;
  priority: 'critical' | 'high' | 'medium' | 'low';
  issue: string;
  action: string;
  documentation_url?: string;
}

const RECOMMENDATION_RULES: RecommendationRule[] = [
  {
    checkId: 'vault_path_exists',
    condition: (check) => check.status === 'error',
    priority: 'critical',
    issue: 'Obsidian vault path does not exist',
    action: 'Create vault directory: mkdir -p "${VAULT_PATH}"',
    documentation_url: 'https://docs.adhd-brain.dev/setup/vault-configuration'
  },
  {
    checkId: 'gmail_token_valid',
    condition: (check) => check.status === 'error',
    priority: 'high',
    issue: 'Gmail API token expired or invalid',
    action: 'Run Gmail OAuth2 flow: adhd capture email init',
    documentation_url: 'https://docs.adhd-brain.dev/setup/gmail-oauth'
  },
  {
    checkId: 'database_integrity',
    condition: (check) => check.status === 'error',
    priority: 'critical',
    issue: 'SQLite database integrity check failed',
    action: 'Restore from backup: adhd db restore --latest',
    documentation_url: 'https://docs.adhd-brain.dev/troubleshooting/database-recovery'
  },
  {
    checkId: 'icloudctl_available',
    condition: (check) => check.status === 'error',
    priority: 'critical',
    issue: 'icloudctl binary not found',
    action: 'Install icloudctl: see docs/guides/voice-capture-setup.md',
    documentation_url: 'https://docs.adhd-brain.dev/setup/voice-capture-prerequisites'
  },
  {
    checkId: 'vault_disk_space',
    condition: (check) => check.status === 'warn',
    priority: 'medium',
    issue: 'Low disk space on vault volume',
    action: 'Free up disk space: at least 1GB recommended'
  }
];

function generateRecommendations(components: ComponentHealth[]): Recommendation[] {
  const allChecks = components.flatMap(c =>
    c.checks.map(check => ({ component: c.name, ...check }))
  );

  const failedChecks = allChecks.filter(check =>
    check.status === 'warn' || check.status === 'error'
  );

  const recommendations = failedChecks
    .map(check => {
      const rule = RECOMMENDATION_RULES.find(r =>
        r.checkId === check.name && r.condition(check)
      );

      if (!rule) return null;

      return {
        priority: rule.priority,
        component: check.component,
        issue: rule.issue,
        action: rule.action,
        documentation_url: rule.documentation_url
      };
    })
    .filter((rec): rec is Recommendation => rec !== null)
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  return recommendations;
}
```

### 3.4 Output Formatting

#### Human-Readable Format

```typescript
function formatHumanReadable(output: DoctorOutput): string {
  const lines: string[] = [];

  // Header
  lines.push(chalk.bold('ADHD Brain Health Check'));
  lines.push(chalk.gray(`Timestamp: ${output.timestamp}`));
  lines.push('');

  // Overall status
  const statusIcon = output.status === 'ok' ? '✓' :
                     output.status === 'warn' ? '⚠' : '✗';
  const statusColor = output.status === 'ok' ? chalk.green :
                      output.status === 'warn' ? chalk.yellow : chalk.red;
  lines.push(statusColor(`${statusIcon} Overall Status: ${output.status.toUpperCase()}`));
  lines.push('');

  // Component results
  for (const component of output.components) {
    const componentIcon = component.status === 'ok' ? '✓' :
                          component.status === 'warn' ? '⚠' : '✗';
    const componentColor = component.status === 'ok' ? chalk.green :
                           component.status === 'warn' ? chalk.yellow : chalk.red;

    lines.push(componentColor(`${componentIcon} ${component.name.toUpperCase()}`));

    for (const check of component.checks) {
      const checkIcon = check.status === 'ok' ? '  ✓' :
                        check.status === 'warn' ? '  ⚠' : '  ✗';
      const checkColor = check.status === 'ok' ? chalk.green :
                         check.status === 'warn' ? chalk.yellow : chalk.red;
      lines.push(checkColor(`${checkIcon} ${check.message}`));
    }

    lines.push('');
  }

  // Recommendations
  if (output.recommendations.length > 0) {
    lines.push(chalk.bold('RECOMMENDATIONS:'));
    lines.push('');

    for (const rec of output.recommendations) {
      const priorityColor = rec.priority === 'critical' ? chalk.red :
                            rec.priority === 'high' ? chalk.yellow :
                            rec.priority === 'medium' ? chalk.blue : chalk.gray;

      lines.push(priorityColor(`[${rec.priority.toUpperCase()}] ${rec.component}: ${rec.issue}`));
      lines.push(chalk.white(`  → ${rec.action}`));

      if (rec.documentation_url) {
        lines.push(chalk.gray(`  📖 ${rec.documentation_url}`));
      }

      lines.push('');
    }
  }

  // Summary
  lines.push(chalk.gray(`Total checks: ${output.summary.total_checks}`));
  lines.push(chalk.green(`Passed: ${output.summary.passed}`));
  if (output.summary.warnings > 0) {
    lines.push(chalk.yellow(`Warnings: ${output.summary.warnings}`));
  }
  if (output.summary.errors > 0) {
    lines.push(chalk.red(`Errors: ${output.summary.errors}`));
  }
  lines.push(chalk.gray(`Duration: ${output.summary.duration_ms}ms`));

  return lines.join('\n');
}
```

#### JSON Format

```typescript
function formatJSON(output: DoctorOutput): string {
  return JSON.stringify(output, null, 2);
}
```

---

## 4. TDD Applicability Decision

### 4.1 Risk Classification

**Risk Level:** MEDIUM (elevated for health diagnostics correctness)

**Rationale:**

- **Contract Stability Critical:** Exit codes and JSON schema are automation contracts
- **False Positives Dangerous:** Incorrect health reports create user distrust
- **Diagnostic Accuracy:** Health checks must reliably detect actual issues
- **Error Handling:** Check failures must not crash doctor command itself

**Not High Risk Because:**

- Health checks are read-only (no data mutations)
- Failure of doctor command doesn't break capture pipeline
- Manual inspection always available as fallback

### 4.2 TDD Decision: Required (Targeted Scope)

**Why:**

- **Exit code stability:** Automation scripts depend on predictable exit codes
- **JSON schema stability:** Machine consumers depend on output structure
- **Check correctness:** Each health check must detect issues reliably
- **Error isolation:** Check failures must not cascade

**Scope Under TDD:**

#### Unit Tests (Required)

- Check result aggregation (component status from check statuses)
- Exit code determination logic (status → exit code mapping)
- Recommendation generation (failed checks → actionable guidance)
- Output formatting (JSON schema validation)
- Timeout handling (checks exceeding 5s limit)

#### Integration Tests (Required)

- End-to-end doctor command execution (with fixture config)
- Component filtering (--component flag)
- JSON output mode (--json flag)
- Verbose mode (--verbose flag)
- Exit code verification (healthy/warning/error scenarios)

#### Contract Tests (Required)

- JSON schema stability (backward compatibility)
- Exit code contract (stable across versions)
- Configuration contract (doctor reads expected config shape)
- Check registry completeness (all components covered)

### 4.3 Test Coverage Requirements

| Component | Coverage Target | Priority |
|-----------|-----------------|----------|
| Check result aggregation | 100% | P0 |
| Exit code determination | 100% | P0 |
| JSON schema validation | 100% | P0 |
| Individual health checks | 90% | P0 |
| Recommendation generation | 85% | P1 |
| Output formatting | 80% | P1 |

### 4.4 Test Fixtures

**Standard Test Configurations:**

```typescript
// Fixture: Healthy system
export const FIXTURE_HEALTHY_CONFIG = {
  voice: {
    folder: '/tmp/test-voice-memos',
    icloudctl_path: '/usr/local/bin/icloudctl',
    whisper_model_path: '/tmp/models/medium.pt'
  },
  email: {
    credentials_path: '/tmp/credentials.json',
    token_path: '/tmp/token.json'
  },
  database: {
    path: '/tmp/test.db'
  },
  vault: {
    root: '/tmp/test-vault',
    inbox_folder: 'inbox'
  },
  metrics: {
    enabled: true,
    directory: '/tmp/.metrics'
  }
};

// Fixture: Missing vault path
export const FIXTURE_MISSING_VAULT = {
  ...FIXTURE_HEALTHY_CONFIG,
  vault: {
    root: '/nonexistent/vault',
    inbox_folder: 'inbox'
  }
};

// Fixture: Expired Gmail token
export const FIXTURE_EXPIRED_TOKEN = {
  ...FIXTURE_HEALTHY_CONFIG,
  email: {
    credentials_path: '/tmp/credentials.json',
    token_path: '/tmp/expired-token.json'
  }
};
```

### 4.5 YAGNI Deferrals

**Not Testing Now:**

- Auto-repair functionality (--fix flag deferred to Phase 2+)
- Performance regression tests (check execution time optimization)
- Stress testing (1000+ concurrent doctor invocations)

**Trigger to Revisit:**

| Condition | Action |
|-----------|--------|
| Add --fix flag for auto-repair | Add mutation tests for repair operations |
| Check execution time > 500ms | Add performance regression tests |
| Multiple users report slowness | Profile and optimize slow checks |

---

## 5. Dependencies & Contracts

### 5.1 Upstream Dependencies

**Foundation Package:**

- Configuration loader (vault path, database path, thresholds)
- Logger (structured logging for diagnostics)
- File system utilities (path validation, disk space, permissions)

**SQLite Client:**

- Database connection (read-only queries)
- Schema introspection (table listing, PRAGMA integrity_check)

**Environment Variables:**

- `CAPTURE_METRICS` (metrics collection status)
- `VAULT_PATH` (Obsidian vault root)
- `DATABASE_PATH` (SQLite database location)

### 5.2 Downstream Consumers

**Users (Manual Invocation):**

- Troubleshooting capture issues
- Verifying system setup after installation
- Debugging configuration problems

**Automation Scripts:**

- CI/CD health checks (exit code validation)
- Monitoring systems (JSON output parsing)
- Pre-deployment validation (ensure system healthy)

### 5.3 External Contracts

**Exit Code Contract:**

```typescript
// Exit codes are stable across all versions
// Breaking change requires major version bump
export const EXIT_CODE_CONTRACT = {
  HEALTHY: 0,      // All checks passed
  WARNINGS: 1,     // Non-critical issues
  ERRORS: 2        // Critical issues
} as const;
```

**JSON Schema Contract:**

- Version field included in output (`version` field)
- Additive changes only (no field removals)
- Type stability (no type changes for existing fields)
- Backward compatibility tests in CI

---

## 6. Risks & Mitigations

### 6.1 High-Priority Risks

| Risk | Impact | Probability | Mitigation | Status |
|------|--------|-------------|------------|--------|
| False positive health reports | User distrust | Medium | Comprehensive integration tests | Required |
| Check timeout cascades | Slow doctor execution | Low | Per-check timeout (5s) + parallel execution | Required |
| Exit code instability | Broken automation | Low | Exit code contract tests | Required |
| JSON schema breaking changes | Consumer failures | Low | Schema versioning + backward compatibility tests | Required |

### 6.2 Medium-Priority Risks

| Risk | Impact | Probability | Mitigation | Status |
|------|--------|-------------|------------|--------|
| Check execution > 500ms | Perceived slowness | Medium | Parallel execution + profiling | Monitor |
| Missing check coverage | Undetected issues | Medium | Systematic check registry review | Monitor |
| Verbose output too noisy | User confusion | Low | Structured details field (opt-in) | Monitor |

### 6.3 Deferred Risks

| Risk | Defer Reason | Revisit Trigger |
|------|--------------|-----------------|
| Auto-repair failures | No --fix flag in MPPP | --fix flag implementation |
| Concurrent doctor invocations | Single user assumption | Multi-user deployment |

---

## 7. Rollout & Telemetry (Meta-Metrics)

### 7.1 Usage Metrics (Optional)

**If metrics enabled (CAPTURE_METRICS=1):**

```typescript
'health.check.duration_ms' = {
  type: 'duration',
  description: 'Health check execution time',
  tags: { component: string },
  unit: 'milliseconds'
};

'health.check.result' = {
  type: 'counter',
  description: 'Health check outcome',
  tags: {
    component: string,
    status: 'ok' | 'warn' | 'error'
  },
  unit: 'count'
};

'health.command.invocation_total' = {
  type: 'counter',
  description: 'Total doctor command invocations',
  tags: { json_mode: boolean, verbose: boolean },
  unit: 'count'
};

'health.command.duration_ms' = {
  type: 'duration',
  description: 'Total doctor command execution time',
  tags: { exit_code: number },
  unit: 'milliseconds'
};
```

### 7.2 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Total execution time | < 500ms (p95) | Command start → output complete |
| Individual check time | < 100ms (p95) | Single check execution |
| Check timeout limit | 5000ms (hard) | Per-check timeout enforcement |

---

## 8. Implementation Checklist

### 8.1 Phase 1: Core Health Checks (Week 1-2)

- [ ] Doctor command CLI interface (argument parsing)
- [ ] Check registry and execution engine
- [ ] Voice component checks (folder, icloudctl, Whisper model)
- [ ] Email component checks (credentials, token)
- [ ] Database component checks (accessibility, schema, integrity)
- [ ] Vault component checks (path, permissions, disk space)
- [ ] Metrics component checks (enabled, directory, disk space)
- [ ] Result aggregation and status determination
- [ ] Exit code determination logic
- [ ] Unit tests (check aggregation, exit codes)

### 8.2 Phase 1: Output Formatting (Week 2)

- [ ] JSON output mode (--json flag)
- [ ] Human-readable output (colored, formatted)
- [ ] Verbose mode (--verbose flag)
- [ ] Recommendation generation
- [ ] Component filtering (--component flag)
- [ ] JSON schema validation tests

### 8.3 Phase 2: Integration & Hardening (Week 3)

- [ ] Integration tests (end-to-end doctor execution)
- [ ] Contract tests (exit codes, JSON schema)
- [ ] Error handling (check failures, timeouts)
- [ ] Performance validation (< 500ms target)
- [ ] Documentation (usage guide, troubleshooting)
- [ ] Beta testing (personal dogfooding)

---

## 9. Open Questions

### 9.1 Implementation Decisions Needed

1. **Check timeout handling:** Should timed-out checks return 'error' or 'warn'?
   - **Recommendation:** 'error' (timeout indicates system issue)

2. **Recommendation priority algorithm:** Should we auto-prioritize based on component criticality?
   - **Recommendation:** Yes (vault/database = critical, metrics = low)

3. **Verbose mode behavior:** Include all check details or only failures?
   - **Recommendation:** All details (verbose = comprehensive)

4. **Auto-repair scope:** Should --fix flag attempt all repairs or only safe ones?
   - **Defer:** Phase 2+ (start with read-only diagnostics)

### 9.2 Future Enhancements (YAGNI)

| Feature | Defer Reason | Revisit Trigger |
|---------|--------------|-----------------|
| Auto-repair (--fix) | Read-only diagnostics sufficient | User requests automated fixes |
| Check history tracking | No trending requirement yet | Monitoring dashboard request |
| Remote health reporting | Local-only design | Multi-node deployment |
| Custom check plugins | No extensibility need | 3+ external integration requests |

---

## 10. Related Documentation

### PRDs (Product Requirements)

| Document | Relationship |
|----------|--------------|
| [CLI Feature PRD](./prd-cli.md) | Section 4 - User Flows (Health Check) |
| [Master PRD v2.3.0-MPPP](../../master/prd-master.md) | Section 5.3 Health Command |
| [Capture Feature PRD](../capture/prd-capture.md) | Section 10.3 Crash Recovery |

### Technical Specifications

| Document | Relationship |
|----------|--------------|
| [Metrics Contract Tech Spec](../../cross-cutting/spec-metrics-contract-tech.md) | Section 7.2 Health Check Integration |
| [Error Recovery Tech Spec](../../guides/guide-error-recovery.md) | Error states to check |

### Guides (How-To)

| Document | Relationship |
|----------|--------------|
| [TDD Applicability Guide](./guide-tdd-applicability.md) | Testing strategy framework |
| [Health Command Guide](./guide-health-command.md) | Usage patterns and troubleshooting |
| [Test Strategy Guide](./guide-test-strategy.md) | Overall testing approach |
| [Phase 1 Testing Patterns](./guide-phase1-testing-patterns.md) | Implementation patterns |
| [TestKit Usage Guide](./guide-testkit-usage.md) | Test utilities |

---

## 11. Document Version

**Version:** 1.0.0
**Status:** Draft - Ready for Review
**Last Updated:** 2025-09-27

### Alignment Verification

- [x] Aligned with CLI PRD v1.0.0 (Section 4 - Health Check Flow)
- [x] Aligned with Master PRD v2.3.0-MPPP (Section 5.3)
- [x] Aligned with Capture PRD v3.1.0 (Section 10.3)
- [x] JSON output format matches Metrics Contract §7.2
- [x] Error states aligned with Error Recovery spec
- [x] Performance target < 500ms specified
- [x] Exit codes defined as stable contract
- [x] TDD decision documented (MEDIUM risk, required)
- [x] Check registry comprehensive (18 checks across 5 components)
- [x] Recommendation generation actionable

### Changelog

**v1.0.0 (2025-09-27):**

- Initial comprehensive tech spec
- Command interface and exit codes defined
- JSON output schema with contract tests
- Check registry with 18 health checks
- Parallel check execution for performance
- Recommendation generation with actionable guidance
- TDD applicability decision (MEDIUM risk, required)
- Integration with metrics contract (§7.2)
- Performance target < 500ms (p95)
- Minimal foundation dependencies only

---

## 12. Sign-off Checklist

- [x] Purpose clearly defined (infrastructure validation + diagnostics)
- [x] Command interface documented (CLI args, exit codes)
- [x] JSON schema defined with contract tests
- [x] Check registry comprehensive (all components covered)
- [x] Parallel execution for performance (< 500ms target)
- [x] Recommendation generation actionable
- [x] TDD decision documented (MEDIUM risk, required)
- [x] Test fixtures prevent brittleness
- [x] Exit code contract stable (automation-safe)
- [x] Output formatting (JSON + human-readable)
- [x] Error isolation (check failures don't cascade)
- [x] Implementation checklist provided
- [x] Open questions tracked
- [x] Related specs referenced

---

### Next Steps

1. **Review with stakeholders** (Week 1)
   - Validate check registry completeness
   - Confirm exit code contract
   - Approve JSON schema

2. **Begin implementation** (Week 1-2)
   - Implement check registry and execution engine
   - Add infrastructure health checks
   - Write unit tests for aggregation logic

3. **Integration testing** (Week 2-3)
   - End-to-end doctor command execution
   - Contract tests for exit codes and JSON schema
   - Performance validation (< 500ms target)

4. **Beta testing** (Week 3)
   - Personal dogfooding with real system
   - Verify all checks detect actual issues
   - Refine recommendation guidance

### Success

This spec delivers a **comprehensive health diagnostics tool** that detects 95%+ of common issues, provides actionable recommendations, and maintains stable contracts for automation. The doctor command is the first line of defense against operational issues, ensuring users can quickly diagnose and resolve problems. Ship it! 🚀

---

## 13. Nerdy Joke

The doctor command is like having a hypochondriac friend for your capture system—it worries about everything so you don't have to, and it's usually faster than your ADHD brain at noticing something's wrong. Plus, unlike WebMD, it won't tell you your system is dying when you just forgot to enable metrics. 🩺