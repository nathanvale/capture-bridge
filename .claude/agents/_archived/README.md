# Archived Agents

This directory contains deprecated agent configurations that have been superseded by newer implementations.

## implementation-orchestrator.md.v2.0.0-deprecated

**Deprecated**: 2025-10-08
**Replaced by**: task-manager.md v4.0.0

**Reason**: Claude Code platform limitation prevents nested agent delegation (GitHub issue #4182). When agents are spawned as sub-agents, they lose access to the Task tool at runtime, even if their configuration declares it.

**Solution**: Merged implementation-orchestrator functionality into task-manager to create a unified orchestrator that handles:
- VTM query + git validation (formerly implementation-orchestrator)
- Context loading + AC classification (original task-manager)
- Direct delegation to code-implementer (no nesting needed)

**Architecture Change**:
```
# Old (broken):
/pm start → implementation-orchestrator → task-manager → code-implementer
                 (query VTM)            (route work)     (implement)

# New (working):
/pm start → task-manager → code-implementer
             (query VTM + route work)  (implement)
```

**Files Updated**:
- `.claude/agents/task-manager.md` - Now includes Phase 0 (VTM query + git validation)
- `.claude/commands/pm.md` - Updated `/pm start` to invoke task-manager directly
- `CLAUDE.md` - Documented platform limitation

**For Historical Reference**: This file documents the original two-tier orchestration design that was architecturally sound but incompatible with Claude Code's runtime agent model.
