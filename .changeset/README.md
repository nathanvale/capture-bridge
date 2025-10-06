# Changesets

**Flow**

1. `pnpm changeset` → create a changeset (pick patch/minor/major).
2. Push → the Release workflow opens/updates a **Version Packages** PR.
3. Merge that PR → versions + changelogs update automatically.

**Notes**

- All packages in this monorepo are **private** and will NOT be published to
  npm.
- Changesets are used for version management and changelog generation only.
- Tags are created in git for tracking releases.
- Use conventional commits for better changelog formatting.
