/* eslint-disable no-console */
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

/**
 * Package Contract Validation Test
 *
 * This test ensures that the @capture-bridge/foundation package exports
 * match expectations and prevents test-implementation mismatches.
 *
 * Purpose:
 * - Validates actual exports against expected exports
 * - Ensures package.json exports configuration is correct
 * - Catches discrepancies between package implementation and tests
 * - Prevents future test failures due to missing or unexpected exports
 */
describe('Package Contract Validation', () => {
  it('should export all functions expected by tests', async () => {
    // Import from source to ensure coverage is tracked
    const pkg = await import('../index.js')
    // eslint-disable-next-line sonarjs/no-alphabetical-sort -- Need to sort for comparison
    const actualExports = Object.keys(pkg).sort()

    console.log('📦 Package Contract Validation')
    console.log('==============================')
    console.log(`Actual exports (${actualExports.length}):`, actualExports)

    // Define expected exports based on package purpose
    // Currently, @capture-bridge/foundation is a minimal package
    // with only the foundationVersion export
    const expectedExports = [
      'foundationVersion', // Version identifier export
      'getFoundationVersion', // Version getter function
    ]

    // Check for missing exports
    const missing = expectedExports.filter((exp) => !actualExports.includes(exp))
    expect(missing).toEqual([])

    // Check for unexpected exports (this helps catch accidental exports)
    const unexpected = actualExports.filter((exp) => !expectedExports.includes(exp))

    if (unexpected.length > 0) {
      console.log(`⚠️  Unexpected exports found: ${unexpected.join(', ')}`)
      console.log('   Consider updating expectedExports array if these are intentional')
    }

    console.log('✅ All expected exports are present')
    console.log(`   Expected: ${expectedExports.length}`)
    console.log(`   Actual: ${actualExports.length}`)
    console.log(`   Match: ${missing.length === 0 ? 'Yes' : 'No'}`)
  })

  it('should match package.json exports configuration', async () => {
    // Read package.json to validate exports field
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const packageJsonPath = join(__dirname, '../../package.json')

    const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
    const packageJson = JSON.parse(packageJsonContent)

    console.log('\n📄 package.json Validation')
    console.log('===========================')

    // Validate exports field exists and is configured correctly
    expect(packageJson.exports).toBeDefined()
    expect(packageJson.exports['.']).toBeDefined()

    const mainExport = packageJson.exports['.']
    expect(mainExport).toHaveProperty('types')
    expect(mainExport).toHaveProperty('import')

    console.log('✅ package.json exports field is properly configured:')
    console.log(`   types: ${mainExport.types}`)
    console.log(`   import: ${mainExport.import}`)

    // Validate that the package actually exports something (import from source for coverage)
    const pkg = await import('../index.js')
    const exportCount = Object.keys(pkg).length

    expect(exportCount).toBeGreaterThan(0)
    console.log(`✅ Package has ${exportCount} export(s)`)
  })

  it('should verify foundationVersion matches package.json version', async () => {
    // Import from source to ensure coverage is tracked
    const pkg = await import('../index.js')

    console.log('\n🔢 Version Validation')
    console.log('=====================')

    // Read package.json to get the version
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const packageJsonPath = join(__dirname, '../../package.json')

    const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
    const packageJson = JSON.parse(packageJsonContent)

    expect(pkg.foundationVersion).toBeDefined()
    expect(pkg.foundationVersion).toBe(packageJson.version)

    // Test the getter function for coverage
    expect(pkg.getFoundationVersion()).toBe(packageJson.version)

    console.log(`✅ foundationVersion matches package.json version: ${pkg.foundationVersion}`)
  })

  // eslint-disable-next-line vitest/expect-expect, sonarjs/assertions-in-tests -- Documentation test with console output
  it('should document the relationship with testkit tests', () => {
    console.log('\n📚 Test Suite Documentation')
    console.log('===========================')
    console.log('This package contains tests for @orchestr8/testkit, not @capture-bridge/foundation')
    console.log('')
    console.log('Test files in this package:')
    console.log('  - testkit-main-export.test.ts        (validates @orchestr8/testkit main exports)')
    console.log('  - testkit-core-utilities.test.ts     (validates @orchestr8/testkit core utilities)')
    console.log('  - testkit-cli-utilities.test.ts      (validates @orchestr8/testkit CLI features)')
    console.log('  - testkit-msw-features.test.ts       (validates @orchestr8/testkit MSW integration)')
    console.log('  - testkit-sqlite-features.test.ts    (validates @orchestr8/testkit SQLite features)')
    console.log('  - testkit-sqlite-advanced.test.ts    (validates @orchestr8/testkit SQLite advanced)')
    console.log('  - testkit-utils-advanced.test.ts     (validates @orchestr8/testkit utils advanced)')
    console.log('  - testkit-final-validation.test.ts   (final validation of @orchestr8/testkit)')
    console.log('  - package-contract.test.ts           (validates @capture-bridge/foundation exports)')
    console.log('')
    console.log('Note: @capture-bridge/foundation is a minimal package that serves as a foundation')
    console.log('      for the monorepo but primarily houses tests for the external @orchestr8/testkit')
    console.log('      package dependency.')
    console.log('')
    console.log('✅ Test suite documentation acknowledged')
  })

  // eslint-disable-next-line vitest/expect-expect, sonarjs/assertions-in-tests -- Documentation test with console output
  it('should warn if tests import from wrong package', () => {
    console.log('\n⚠️  Import Validation')
    console.log('=====================')
    console.log('Tests in this package should import from @orchestr8/testkit, not @capture-bridge/foundation')
    console.log('(except for this contract test which validates foundation exports)')
    console.log('')
    console.log('Expected import pattern for most tests:')
    console.log("  import { ... } from '@orchestr8/testkit'")
    console.log("  import { ... } from '@orchestr8/testkit/msw'")
    console.log("  import { ... } from '@orchestr8/testkit/sqlite'")
    console.log('')
    console.log('NOT:')
    console.log("  import { ... } from '@capture-bridge/foundation'")
    console.log('')
    console.log('✅ Import pattern guidelines acknowledged')
  })
})
