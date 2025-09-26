---
title: <Feature> Test Spec
status: draft
owner: Nathan
version: 0.1.0
---

# <Feature> — Test Specification

## 1) Objectives
- Prove durability, idempotency, atomicity

## 2) Coverage Strategy
- Unit (pure logic)
- Integration (pipeline)
- Contract (file ops / adapters)
- E2E (happy path + crash/recovery)

## 3) Critical Tests (TDD Required)
- Deterministic hashing
- Duplicate rejection
- Outbox replay idempotency
- Atomic temp/rename write
- Conflict sibling creation
- Crash + auto-recovery

## 4) Tooling
- Vitest, MSW/fs mocks, TestKit helpers

## 5) Non-Goals
- Visual polish snapshotting (optional)
