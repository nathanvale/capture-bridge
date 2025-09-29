---
title: <Feature> Test Spec
status: draft
owner: Nathan
version: 0.1.0
date: <date>
spec_type: test
---

# <Feature> — Test Specification

## 1) Objectives

- Prove durability, idempotency, atomicity

## 2) Traceability

- Map each test objective to PRD requirement or Tech Spec guarantee

## 3) Coverage Strategy

- Unit (pure logic)
- Integration (pipeline)
- Contract (file ops / adapters)
- E2E (happy path + crash/recovery)

## 4) Critical Tests (TDD Required)

- Deterministic hashing
- Duplicate rejection
- Outbox replay idempotency
- Atomic temp/rename write
- Conflict sibling creation
- Crash + auto-recovery

## 5) Tooling

- Vitest, MSW/fs mocks, TestKit helpers

## 6) TestKit Helpers

- Which helper modules to use (e.g., fs, macOS, CLI)
- Custom assertions or verifications provided by TestKit
- How to extend with new mocks/helpers when gaps are found

## 7) Non-Goals

- Visual polish snapshotting (optional)
