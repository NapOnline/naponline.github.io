#!/usr/bin/env bash
# Enter the containerized Jekyll dev environment created by toolbox-setup.sh.
# Initializes rbenv so plain `bundle`/`jekyll`/`ruby` commands inside the
# shell resolve to the .ruby-version-pinned Ruby, not Fedora's system ruby.
set -euo pipefail

CONTAINER_NAME="naponline-jekyll"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTER_CMD="cd '${REPO_ROOT}' && eval \"\$(rbenv init - bash)\" && exec bash"

if command -v toolbox >/dev/null 2>&1 && toolbox list --containers | grep -q "${CONTAINER_NAME}"; then
    exec toolbox enter "${CONTAINER_NAME}" -- bash -lc "${ENTER_CMD}"
elif command -v distrobox >/dev/null 2>&1; then
    exec distrobox enter "${CONTAINER_NAME}" -- bash -lc "${ENTER_CMD}"
else
    echo "Container '${CONTAINER_NAME}' not found. Run ./dev/toolbox-setup.sh first." >&2
    exit 1
fi
