---
date: 2026-10-23
tags: [session]
---
# 2026-10-23 — Vault setup

## Done
- Created Obsidian vault (`vault/`) with Home, Handoff/CURRENT, Sessions, Notes, Templates.
- Added SessionStart hook that prints [[CURRENT]] and the latest session log into new sessions.
- Added `/handoff` slash command and `CLAUDE.md` rules.

## Decisions
- Vault lives inside the project folder so it travels with the project.
- `CURRENT.md` is overwritten each hand-off; history lives in `Sessions/`.
