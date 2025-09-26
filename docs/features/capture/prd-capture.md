# PRD: Capture Channels
Problem: Fast, durable capture across voice, text, web, email with minimal decisions.

Goals:
- Global hotkeys feel instant
- Press-to-speak voice with reliable confirmation
- Web clip + source URL; email forward preserves attachments

Scope (MVP → v1):
- MVP: Voice + Quick Text; v1: Web + Email
Out (YAGNI): Mobile apps, cloud sync

Flows:
- Voice: hold-to-record → toast → shows in Inbox → auto-file if confident
- Text: cmd+shift+n → enter → staged instantly

Decisions:
- Local-only; immediate staging; one-way pipeline
