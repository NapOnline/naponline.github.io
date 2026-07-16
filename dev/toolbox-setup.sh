#!/usr/bin/env bash
# One-time (idempotent) setup of the containerized Jekyll dev environment.
# Uses toolbox if present (native on Fedora Atomic/Silverblue/Kinoite), falling
# back to distrobox otherwise. Both are thin wrappers around Podman and both
# bind-mount $HOME automatically, so the repo is visible inside the container
# at the same path with no manual volume config.
set -euo pipefail

CONTAINER_NAME="naponline-jekyll"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINERFILE="${REPO_ROOT}/dev/Containerfile"
IMAGE_NAME="naponline-jekyll:latest"

if command -v toolbox >/dev/null 2>&1; then
    ENGINE="toolbox"
elif command -v distrobox >/dev/null 2>&1; then
    ENGINE="distrobox"
else
    echo "Neither toolbox nor distrobox found. Install one of them first." >&2
    exit 1
fi

echo "Using ${ENGINE} to build the dev container..."

# Compiles the .ruby-version-pinned Ruby via rbenv/ruby-build (skipped if
# already built), installs bundler under it, then runs bundle install.
# rbenv's install dir lives under $HOME, which toolbox/distrobox share with
# the host, so this only needs to happen once per machine.
SETUP_CMD="cd '${REPO_ROOT}' \
    && rbenv install --skip-existing \$(cat .ruby-version) \
    && rbenv exec gem install bundler --no-document \
    && rbenv rehash \
    && rbenv exec bundle install"

if [ "${ENGINE}" = "toolbox" ]; then
    podman build -t "${IMAGE_NAME}" -f "${CONTAINERFILE}" "${REPO_ROOT}/dev"
    if ! toolbox list --containers | grep -q "${CONTAINER_NAME}"; then
        toolbox create --image "${IMAGE_NAME}" --container "${CONTAINER_NAME}" -y
    fi
    toolbox run --container "${CONTAINER_NAME}" bash -lc "${SETUP_CMD}"
else
    podman build -t "${IMAGE_NAME}" -f "${CONTAINERFILE}" "${REPO_ROOT}/dev"
    if ! distrobox list | grep -q "${CONTAINER_NAME}"; then
        distrobox create --image "${IMAGE_NAME}" --name "${CONTAINER_NAME}" --yes
    fi
    distrobox enter "${CONTAINER_NAME}" -- bash -lc "${SETUP_CMD}"
fi

echo "Done. Enter the container with ./dev/toolbox-enter.sh"
