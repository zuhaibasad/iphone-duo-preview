#!/usr/bin/env bash
# SessionStart hook: injects the vault hand-off into the new session's context.
VAULT="${CLAUDE_PROJECT_DIR:-.}/vault"
[ -d "$VAULT" ] || exit 0

echo "=== Obsidian vault hand-off (from $VAULT) ==="
if [ -f "$VAULT/Handoff/CURRENT.md" ]; then
  cat "$VAULT/Handoff/CURRENT.md"
else
  echo "(no Handoff/CURRENT.md yet)"
fi

latest=$(ls -1 "$VAULT/Sessions"/*.md 2>/dev/null | sort | tail -n 1)
if [ -n "$latest" ]; then
  echo
  echo "=== Latest session log: $(basename "$latest") ==="
  cat "$latest"
fi

echo
echo "=== Other session logs (read on demand) ==="
ls -1 "$VAULT/Sessions" 2>/dev/null | sort -r | tail -n +2 | head -n 10
exit 0
