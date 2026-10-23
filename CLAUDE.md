# Project memory: Obsidian vault

This project keeps its working memory in the Obsidian vault at `vault/`.

- At session start, a hook prints `vault/Handoff/CURRENT.md` and the latest `vault/Sessions/` log into context. Treat that as where the previous session left off and continue from its "Next steps" unless the user says otherwise. Read older logs in `vault/Sessions/` or notes in `vault/Notes/` only when needed.
- Before ending a substantial piece of work, or when the user says "handoff"/"wrap up", run the `/handoff` steps (see `.claude/commands/handoff.md`).
- Use Obsidian conventions: `[[wikilinks]]`, YAML frontmatter, one topic per note. Never delete session logs; `CURRENT.md` is the only file that gets overwritten.
