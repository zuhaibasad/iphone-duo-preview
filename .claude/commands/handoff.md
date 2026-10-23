---
description: Write the session hand-off into the Obsidian vault so the next session can pick up
argument-hint: [optional topic slug]
---
Write a hand-off for the next Claude session into the Obsidian vault at `vault/`.

1. Create `vault/Sessions/<today YYYY-MM-DD>-<topic>.md` from `vault/Templates/Session-template.md` (topic: $ARGUMENTS, or a short kebab-case slug you choose). If that file exists, append to it. Record what was done, decisions with their reasons, and gotchas. Be concrete: file paths, commands, IDs, error messages.
2. Overwrite `vault/Handoff/CURRENT.md` following `vault/Templates/Handoff-template.md`: goal, current state, ordered next steps, open questions, key files. Link the session log with `[[...]]`. Write it so a fresh session with no memory of this conversation can continue immediately.
3. Add the session to "Recent sessions" in `vault/Home.md` (newest first).
4. Move durable knowledge (decisions, reference facts, how-tos that outlive this task) into `vault/Notes/` as separate notes and link them from the session log.

Reply with one line naming the files written.
