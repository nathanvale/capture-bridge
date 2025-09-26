# PRD: Staging Ledger
Problem: Thoughts are lost on crashes; duplicates cause anxiety; inbox scanning is slow.

Goals:
- 0% capture loss, fast inbox, duplicate prevention

Scope:
- Minimal tables (~5), audit forever (tiny), dedup via content hash (text + attachments)

Decisions:
- One writer to vault; automatic conflict siblings; no full-text search
