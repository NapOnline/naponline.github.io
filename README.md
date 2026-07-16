# NapOnline

Personal site for [naponline.net](https://naponline.net), built with [Jekyll](https://jekyllrb.com/)
and deployed via GitHub Pages. Red/terminal design system, a DevOps-themed 2D side-scroller on the
landing page, and a small recipe collection.

## Local development

This repo assumes an atomic/immutable host (no global Ruby/Jekyll install). All local development
happens inside a `toolbox`/`distrobox` container so nothing touches the host system.

**Prerequisites:** `toolbox` (native on Fedora Silverblue/Kinoite/Atomic) or `distrobox`, both
backed by Podman.

```sh
# One-time: build the container image, compile the pinned Ruby via rbenv, install gems
./dev/toolbox-setup.sh

# Enter the container for day-to-day work
./dev/toolbox-enter.sh

# Inside the container:
bundle exec jekyll serve --livereload --host 0.0.0.0
```

`./dev/toolbox-setup.sh` compiles the Ruby version pinned in `.ruby-version` via `rbenv`/`ruby-build`
rather than using Fedora's system Ruby. That's not a style choice: the `github-pages` gem's
dependency chain (`commonmarker`, via `jekyll-commonmark-ghpages`) requires Ruby `< 4.0` to match
GitHub's actual Pages build environment, while Fedora's `ruby` package tracks the latest 4.x. The
compiled Ruby lives under `~/.rbenv`, shared with the host like everything else toolbox/distrobox
mounts — nothing is installed as a host system package. `./dev/toolbox-enter.sh` initializes rbenv
in the shell it drops you into, so plain `bundle`/`jekyll` commands resolve to the right version
automatically.

The server always binds `0.0.0.0` so it's reachable regardless of whether your container runtime
shares the host's network namespace. `toolbox` shares it by default, so the site is reachable
straight from the host browser at `http://127.0.0.1:4000` — no port-forwarding needed. If you're
using `distrobox` without shared networking, browse to `http://<container-ip>:4000` instead, or add
`-p 4000:4000` when creating the container.

### Build

```sh
bundle exec jekyll build
```

Output goes to `_site/` (gitignored). Run `bundle exec jekyll doctor` if something looks off in the
build — it flags common config mistakes.

### Checking for gem/Jekyll drift

GitHub Pages builds with whatever Ruby/Jekyll version its own `github-pages` gem release pins.
Periodically run this inside the container to check for drift and re-`bundle install` if it moved:

```sh
bundle exec github-pages versions
```

## Deployment

This repo uses GitHub's legacy **"build from branch"** Pages setting (configured in the repo's
GitHub Settings UI, not in-repo) — there is no GitHub Actions workflow. Pushing to `master`
triggers GitHub's own Jekyll build automatically. The `CNAME` file pins the custom domain
(`naponline.net`) and must never be excluded from the build or deleted.

## Directory structure

```
_layouts/       Page shells (default, home, recipes)
_includes/      Partials (head, header, footer, hero-game, portfolio-links, recipe-*)
_data/          projects.yml (portfolio links) and recipes/*.yml (recipe content)
recipes/        Recipes page + recipe images
javascripts/
  game/         DevOps side-scroller (ES modules on Kaplay — see AGENTS.md)
  vendor/       Vendored third-party JS (currently just Kaplay)
  recipes.js    Recipe dialog wiring
stylesheets/    stylesheet.css — the red design system (CSS custom properties at :root)
dev/            Containerfile + toolbox/distrobox scripts for local dev
```

See [AGENTS.md](AGENTS.md) for the architectural rules and constraints this project intentionally
follows (dependency minimalism, no bundler, etc.) before making structural changes.
