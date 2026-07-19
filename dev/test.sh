#!/bin/bash
# Comprehensive pre-commit test suite
# Usage: dev/test.sh
#
# Runs (in order):
# 1. dev/serve.sh — ensure fresh jekyll serve is running
# 2. jekyll build --strict_front_matter — catch Liquid/config errors
# 3. node --check on all game JS files — catch syntax errors
# 4. Playwright smoke test — catch runtime errors (the real gate)
#
# Exit 0 only if all pass; exit 1 on any failure

set -e

REPO_PATH="/var/home/napalm/git/naponline.github.io"
CONTAINER="naponline-jekyll"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  PRE-COMMIT TEST SUITE"
echo "════════════════════════════════════════════════════════════════"
echo ""

# 1. Ensure server is running
echo "[1/4] Starting jekyll serve..."
if ! ./dev/serve.sh start; then
  echo ""
  echo "✗ FAILED: Could not start jekyll server"
  exit 1
fi
echo ""

# 2. jekyll build with strict front matter
echo "[2/4] Running jekyll build with strict front matter..."
if ! podman exec --user napalm -w "$REPO_PATH" "$CONTAINER" \
  bash -lc 'eval "$(rbenv init - bash)" && bundle exec jekyll build --strict_front_matter' > /tmp/jekyll-build.log 2>&1; then
  echo "✗ FAILED: jekyll build errored"
  tail -20 /tmp/jekyll-build.log | sed 's/^/  /'
  exit 1
fi
echo "✓ Jekyll build passed"
echo ""

# 3. Syntax check all game JS files
echo "[3/4] Checking syntax on all game JS files..."
failed=0
for f in javascripts/game/*.js javascripts/skyfire-squadron/*.js; do
  if ! node --check "$f" 2>&1; then
    echo "✗ Syntax error in $f"
    failed=1
  fi
done
if [ $failed -eq 1 ]; then
  echo "✗ FAILED: Syntax errors found"
  exit 1
fi
echo "✓ All game JS files have valid syntax"
echo ""

# 4. Browser test suite (smoke + mechanics + achievements + scoring + UI + persistence + playthrough)
echo "[4/4] Running comprehensive browser test suite..."
if ! npm --prefix dev/tests install > /dev/null 2>&1; then
  echo "✗ FAILED: Could not install npm dependencies"
  exit 1
fi
echo ""

# Collect results from all test files
test_files=(
  "dev/tests/smoke.mjs"
  "dev/tests/mechanics.mjs"
  "dev/tests/achievements.mjs"
  "dev/tests/scoring.mjs"
  "dev/tests/ui.mjs"
  "dev/tests/persistence.mjs"
  "dev/tests/playthrough.mjs"
  "dev/tests/skyfire-smoke.mjs"
  "dev/tests/skyfire-mechanics.mjs"
  "dev/tests/skyfire-ui.mjs"
  "dev/tests/skyfire-persistence.mjs"
)

failed_tests=()
passed_count=0

for test_file in "${test_files[@]}"; do
  test_name=$(basename "$test_file" .mjs)
  echo "  → Running $test_name..."
  if node "$test_file" 2>&1; then
    passed_count=$((passed_count + 1))
  else
    failed_tests+=("$test_name")
  fi
  echo ""
done

echo "════════════════════════════════════════════════════════════════"

if [ ${#failed_tests[@]} -eq 0 ]; then
  echo "  ✓ ALL TESTS PASSED (${#test_files[@]} suites)"
  echo "════════════════════════════════════════════════════════════════"
  echo ""

  # Write the freshness marker consumed by .claude/hooks/check-test-freshness.sh
  # — the pre-commit hook compares this hash against the current gated-path
  # state to know whether a passing run still covers the pending commit.
  source dev/gate-paths.sh
  { git ls-files -- "${GATE_PATHS[@]}"; \
    git ls-files --others --exclude-standard -- "${GATE_PATHS[@]}"; } \
    2>/dev/null | sort -u | xargs -r sha256sum | sha256sum | awk '{print $1}' > .claude/.test-passed
  echo "  Test-freshness marker written (.claude/.test-passed)."
  echo "  Safe to commit and push."
  echo ""
  exit 0
else
  echo "  ✗ ${#failed_tests[@]} TEST SUITE(S) FAILED:"
  for test in "${failed_tests[@]}"; do
    echo "    - $test"
  done
  echo "════════════════════════════════════════════════════════════════"
  echo ""
  exit 1
fi
