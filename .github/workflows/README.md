# GitHub Workflows

This repository uses two minimal workflows for continuous integration and
version management:

## CI Workflow (`ci.yml`)

Validates code quality on every PR and push to main/develop branches.

**Triggers:**

- Pull requests
- Push to `main` or `develop`
- Manual dispatch

**Jobs:**

### Validate

- **PRs**: Only validates packages affected by changes (using Turborepo
  filtering)
- **Push/Manual**: Validates all packages
- Runs: `build`, `lint`, `typecheck`, `test`

### Coverage (main branch only)

- Generates and uploads coverage reports
- Informational only - does not block PRs

## Release Workflow (`release.yml`)

Automates package versioning using Changesets.

**Triggers:**

- Push to `main`
- Manual dispatch

**Jobs:**

### Release

- Creates version PR (when changesets exist)
- Updates package.json versions
- Updates CHANGELOG.md files
- **Does NOT publish to npm** (packages are private)

## Configuration

Both workflows use:

- Node.js 20.18.0
- pnpm 9.15.4
- Environment-aware memory limits (4GB)

## Setup Requirements

All packages in this monorepo are marked as `"private": true` and will not be
published to npm. Changesets are used purely for version management and
changelog generation.

## Usage

To create a changeset:

```bash
pnpm changeset
```

Select the packages to version and describe the changes. When the changeset is
merged to main, a version PR will be created automatically.
