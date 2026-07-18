# Shared path list gating the pre-commit test-freshness check.
# Sourced by dev/test.sh (writes the marker) and
# .claude/hooks/check-test-freshness.sh (checks the marker) — keep this the
# single source of truth so the two can never drift apart.
#
# Matches exactly what dev/test.sh actually exercises today (jekyll build +
# game JS syntax + the Playwright suites) — _data/ and stylesheets/ are
# deliberately excluded since nothing in the suite currently checks them.
GATE_PATHS=(javascripts dev _layouts _includes _config.yml Gemfile .ruby-version)
