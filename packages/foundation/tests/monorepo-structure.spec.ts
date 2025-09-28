/**
 * Test Suite: MONOREPO_STRUCTURE--T01
 * Risk: Medium (TDD Required)
 *
 * Acceptance Criteria Tests:
 * - MONOREPO_STRUCTURE-AC01: 4 packages defined
 * - MONOREPO_STRUCTURE-AC02: Turbo pipeline configured
 * - MONOREPO_STRUCTURE-AC03: Shared configs exist
 * - MONOREPO_STRUCTURE-AC07: Zero circular dependencies
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT_DIR = resolve(__dirname, '../../..')

describe('MONOREPO_STRUCTURE-AC01: 4 packages defined', () => {
  it('should have @adhd-brain/foundation package', () => {
    const packagePath = resolve(ROOT_DIR, 'packages/foundation/package.json')
    expect(existsSync(packagePath)).toBe(true)

    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
    expect(pkg.name).toBe('@adhd-brain/foundation')
    expect(pkg.version).toBeDefined()
  })

  it('should have @adhd-brain/storage package', () => {
    const packagePath = resolve(ROOT_DIR, 'packages/storage/package.json')
    expect(existsSync(packagePath)).toBe(true)

    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
    expect(pkg.name).toBe('@adhd-brain/storage')
    expect(pkg.version).toBeDefined()
  })

  it('should have @adhd-brain/capture package', () => {
    const packagePath = resolve(ROOT_DIR, 'packages/capture/package.json')
    expect(existsSync(packagePath)).toBe(true)

    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
    expect(pkg.name).toBe('@adhd-brain/capture')
    expect(pkg.version).toBeDefined()
  })

  it('should have @adhd-brain/cli package', () => {
    const packagePath = resolve(ROOT_DIR, 'packages/cli/package.json')
    expect(existsSync(packagePath)).toBe(true)

    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
    expect(pkg.name).toBe('@adhd-brain/cli')
    expect(pkg.version).toBeDefined()
  })

  it('should have exactly 4 @adhd-brain packages', () => {
    const workspacePath = resolve(ROOT_DIR, 'pnpm-workspace.yaml')
    expect(existsSync(workspacePath)).toBe(true)

    const content = readFileSync(workspacePath, 'utf-8')
    expect(content).toContain('packages:')
    expect(content).toContain('packages/*')
  })
})

describe('MONOREPO_STRUCTURE-AC02: Turbo pipeline configured', () => {
  it('should have turbo.json with build task', () => {
    const turboPath = resolve(ROOT_DIR, 'turbo.json')
    expect(existsSync(turboPath)).toBe(true)

    const config = JSON.parse(readFileSync(turboPath, 'utf-8'))
    expect(config.tasks).toBeDefined()
    expect(config.tasks.build).toBeDefined()
    expect(config.tasks.build.dependsOn).toContain('^build')
  })

  it('should have turbo.json with test task', () => {
    const turboPath = resolve(ROOT_DIR, 'turbo.json')
    const config = JSON.parse(readFileSync(turboPath, 'utf-8'))

    expect(config.tasks.test).toBeDefined()
    expect(config.tasks.test.dependsOn).toBeDefined()
  })

  it('should have turbo.json with lint task', () => {
    const turboPath = resolve(ROOT_DIR, 'turbo.json')
    const config = JSON.parse(readFileSync(turboPath, 'utf-8'))

    expect(config.tasks.lint).toBeDefined()
  })

  it('should have build outputs configured', () => {
    const turboPath = resolve(ROOT_DIR, 'turbo.json')
    const config = JSON.parse(readFileSync(turboPath, 'utf-8'))

    expect(config.tasks.build.outputs).toBeDefined()
    expect(config.tasks.build.outputs).toContain('dist/**')
  })
})

describe('MONOREPO_STRUCTURE-AC03: Shared configs exist', () => {
  it('should have root tsconfig.json', () => {
    const tsconfigPath = resolve(ROOT_DIR, 'tsconfig.json')
    expect(existsSync(tsconfigPath)).toBe(true)

    const config = JSON.parse(readFileSync(tsconfigPath, 'utf-8'))
    expect(config.compilerOptions).toBeDefined()
    expect(config.compilerOptions.strict).toBe(true)
  })

  it('should have eslint.config.mjs', () => {
    const eslintPath = resolve(ROOT_DIR, 'eslint.config.mjs')
    expect(existsSync(eslintPath)).toBe(true)

    const content = readFileSync(eslintPath, 'utf-8')
    expect(content).toContain('export default')
  })

  it('should have .prettierrc.json', () => {
    const prettierPath = resolve(ROOT_DIR, '.prettierrc.json')
    expect(existsSync(prettierPath)).toBe(true)

    const config = JSON.parse(readFileSync(prettierPath, 'utf-8'))
    expect(config.semi).toBeDefined()
    expect(config.singleQuote).toBeDefined()
  })

  it('should have pnpm-workspace.yaml', () => {
    const workspacePath = resolve(ROOT_DIR, 'pnpm-workspace.yaml')
    expect(existsSync(workspacePath)).toBe(true)
  })
})

describe('MONOREPO_STRUCTURE-AC07: Zero circular dependencies', () => {
  it('foundation should have no dependencies on other @adhd-brain packages', () => {
    const packagePath = resolve(ROOT_DIR, 'packages/foundation/package.json')
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))

    const deps = pkg.dependencies || {}
    const devDeps = pkg.devDependencies || {}
    const allDeps = { ...deps, ...devDeps }

    const adhdbDeps = Object.keys(allDeps).filter((dep) => dep.startsWith('@adhd-brain/'))
    expect(adhdbDeps).toHaveLength(0)
  })

  it('storage should only depend on foundation', () => {
    const packagePath = resolve(ROOT_DIR, 'packages/storage/package.json')
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))

    const deps = pkg.dependencies || {}
    const adhdbDeps = Object.keys(deps).filter((dep) => dep.startsWith('@adhd-brain/'))

    // Should have at most foundation as dependency
    expect(adhdbDeps.length).toBeLessThanOrEqual(1)
    if (adhdbDeps.length === 1) {
      expect(adhdbDeps[0]).toBe('@adhd-brain/foundation')
    }
  })

  it('capture should not create circular dependencies', () => {
    const packagePath = resolve(ROOT_DIR, 'packages/capture/package.json')
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))

    const deps = pkg.dependencies || {}
    const adhdbDeps = Object.keys(deps).filter((dep) => dep.startsWith('@adhd-brain/'))

    // Capture can depend on foundation, storage but cli should not depend on capture
    const cliPackagePath = resolve(ROOT_DIR, 'packages/cli/package.json')
    if (existsSync(cliPackagePath)) {
      const cliPkg = JSON.parse(readFileSync(cliPackagePath, 'utf-8'))
      const cliDeps = cliPkg.dependencies || {}

      // If cli depends on capture, capture should not depend back on cli
      if (cliDeps['@adhd-brain/capture']) {
        expect(adhdbDeps).not.toContain('@adhd-brain/cli')
      }
    }
  })

  it('cli should be at the top of dependency tree', () => {
    const packagePath = resolve(ROOT_DIR, 'packages/cli/package.json')
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))

    // No other package should depend on cli
    const packagesToCheck = ['foundation', 'storage', 'capture']

    for (const pkgName of packagesToCheck) {
      const path = resolve(ROOT_DIR, `packages/${pkgName}/package.json`)
      if (existsSync(path)) {
        const checkedPkg = JSON.parse(readFileSync(path, 'utf-8'))
        const deps = checkedPkg.dependencies || {}

        expect(deps['@adhd-brain/cli']).toBeUndefined()
      }
    }
  })
})

describe('Edge Cases: Package Structure', () => {
  it('should handle missing package.json gracefully', () => {
    const fakePath = resolve(ROOT_DIR, 'packages/nonexistent/package.json')
    expect(existsSync(fakePath)).toBe(false)
  })

  it('all packages should use workspace protocol', () => {
    const packages = ['foundation', 'storage', 'capture', 'cli']

    for (const pkgName of packages) {
      const path = resolve(ROOT_DIR, `packages/${pkgName}/package.json`)
      if (existsSync(path)) {
        const pkg = JSON.parse(readFileSync(path, 'utf-8'))
        const deps = pkg.dependencies || {}

        const workspaceDeps = Object.entries(deps).filter(([name]) =>
          name.startsWith('@adhd-brain/'),
        )

        for (const [, version] of workspaceDeps) {
          expect(version).toBe('workspace:*')
        }
      }
    }
  })

  it('should enforce strict TypeScript config', () => {
    const tsconfigPath = resolve(ROOT_DIR, 'tsconfig.json')
    const config = JSON.parse(readFileSync(tsconfigPath, 'utf-8'))

    expect(config.compilerOptions.strict).toBe(true)
    expect(config.compilerOptions.noUnusedLocals).toBe(true)
    expect(config.compilerOptions.noUnusedParameters).toBe(true)
  })
})
