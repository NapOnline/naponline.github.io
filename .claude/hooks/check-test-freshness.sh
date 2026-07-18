#!/bin/bash
# PreToolUse hook: mechanically enforces "dev/test.sh must pass before any
# commit touching gated paths" (see CLAUDE.md's Pre-commit testing section).
#
# Reads the hook's JSON payload on stdin, and only acts on Bash calls whose
# command actually looks like `git commit` (the .claude/settings.json `if`
# matcher already filters for this — this regex is defense-in-depth in case
# that matcher under/over-matches, e.g. a bare `git commit` with no args).
#
# Exit 0 = allow. Exit 2 = block; stderr is fed back to Claude as the reason
# (not a raw terminal error), so it can react (e.g. go run dev/test.sh)
# rather than just failing opaquely.

set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

# shellcheck disable=SC1091
source dev/gate-paths.sh

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)

# Not a git-commit-shaped command — nothing to do.
[[ "$command" =~ git[[:space:]]+commit ]] || exit 0

# Deliberate, explicit bypass.
[[ -f .claude/skip-test-gate ]] && exit 0

# Commit doesn't touch any gated path — nothing to enforce.
staged=$(git diff --cached --name-only -- "${GATE_PATHS[@]}" 2>/dev/null || true)
[[ -n "$staged" ]] || exit 0

MARKER=".claude/.test-passed"
if [[ ! -f "$MARKER" ]]; then
  echo "BLOCKED: this commit touches gated paths (${GATE_PATHS[*]}) but no dev/test.sh success marker exists. Run dev/test.sh (~1-3 min), then retry. Deliberate bypass: touch .claude/skip-test-gate" >&2
  exit 2
fi

current_hash=$( { git ls-files -- "${GATE_PATHS[@]}"; \
                   git ls-files --others --exclude-standard -- "${GATE_PATHS[@]}"; } \
                 2>/dev/null | sort -u | xargs -r sha256sum | sha256sum | awk '{print $1}' )
marker_hash=$(cat "$MARKER" 2>/dev/null || true)

if [[ "$current_hash" != "$marker_hash" ]]; then
  echo "BLOCKED: dev/test.sh's success marker is stale — gated files changed since the last passing run. Re-run dev/test.sh, then retry. Deliberate bypass: touch .claude/skip-test-gate" >&2
  exit 2
fi

exit 0
