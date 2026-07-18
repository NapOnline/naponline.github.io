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
for f in javascripts/game/*.js; do
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

# 4. Playwright smoke test
echo "[4/4] Running browser smoke test..."
if ! npm --prefix dev/tests install > /dev/null 2>&1; then
  echo "✗ FAILED: Could not install npm dependencies"
  exit 1
fi

if ! node dev/tests/smoke.mjs; then
  echo ""
  echo "✗ FAILED: Browser smoke test failed"
  exit 1
fi
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  ✓ ALL TESTS PASSED"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Safe to commit and push."
echo ""
