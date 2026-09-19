# Temp Render

Tag a pull request with `temp-render` and a GitHub Action publishes a temporary page that renders every `.md` and `.html` file changed in that PR. The page is protected by a user and a password kept in a repository secret, the link is commented on the PR, and the page is deleted after 24 hours.

<img src="diagrams/temp-render.png" width="900"/>

## How it Works

1. The repo owner adds the `temp-render` label to a pull request.
2. The workflow runs only when the label was added (or the push was made) by the repo owner and the PR branch lives in this repo, not a fork.
3. `git diff` between the PR base and head lists the changed `.md`, `.markdown`, `.html` and `.htm` files.
4. `src/build.js` packs those files, plus the images they reference, into one self-contained `index.html` and encrypts the content with AES-GCM using a key derived from `user:password` (PBKDF2, 310k iterations).
5. `ci/pages.sh` writes the page to `previews/pr-N/` on the `gh-pages` branch as a single orphan commit, so removed previews do not stay in git history.
6. The bot comments the URL, user and expiry on the PR, never the password. Every new push replaces the page and the comment.
7. The owner opens the URL, types the user and the `RENDER_PASS` password, and the browser decrypts and renders the files.
8. An hourly cron removes previews older than 24h. Closing the PR or removing the label removes the preview right away.

## Architecture

| Piece | File | Role |
|---|---|---|
| Viewer | `src/viewer.html` | Login, file list, filter, renders md and html in sandboxed iframes |
| Markdown renderer | `src/markdown.js` | Zero dependency GitHub-flavored markdown to html |
| Crypto | `src/seal.js` | PBKDF2 + AES-GCM with WebCrypto, same code runs in Node and in the browser |
| Builder | `src/build.js` | Reads files, embeds images, seals, inlines everything into one page |
| Publisher | `ci/pages.sh` | `publish`, `remove`, `prune` on `gh-pages` |
| PR comment | `ci/comment.sh` | Creates or updates one bot comment |
| Workflow | `../.github/workflows/temp-render.yml` | Label trigger, owner check, build, publish, comment, remove |
| Cleanup | `../.github/workflows/temp-render-cleanup.yml` | Hourly prune of expired previews |

The workflows live in the repo root `.github/workflows/` because GitHub only reads workflows from there.

## Features

* **Only the owner can trigger** - label adds and pushes from anyone other than `github.repository_owner` are skipped, and fork PRs never publish.
* **User and password** - content is encrypted, the public page is only ciphertext until unlocked.
* **Dies in 24h** - hourly prune deletes the files and rewrites `gh-pages` without history, and the page itself refuses to unlock after expiry.
* **Renders md and html** - tables, task lists, nested lists, code blocks, images, raw html in markdown, and full html pages with their own JS and CSS.
* **Images embedded** - relative images referenced by the files are inlined as data URIs so the page is self-contained.
* **Links between files** - a markdown link to another rendered file opens it in the viewer.
* **Isolation** - html runs in a sandboxed iframe without same-origin, so it cannot read the decrypted content of other files.
* **No path leaks** - only repo-relative paths are published, files and images that resolve outside the repo (including symlinks) are rejected.
* **No indexing** - `robots.txt` disallows all and the page sets `noindex`.
* **No dependencies** - no npm packages, only Node, bash, git and the browser.

## Stack

* **Node 24** - runs the builder and tests with the built-in test runner.
* **WebCrypto** - same encryption API in Node and in the browser.
* **Bash + git** - publishes to `gh-pages` with plumbing commands and orphan commits.
* **GitHub Actions** - label trigger, hourly cron and PR comments with `gh`.
* **GitHub Pages** - static hosting for the encrypted page.
* **Vanilla HTML, CSS and JS** - the viewer is one file with no libraries.

## Contracts

Builder CLI:

```bash
node src/build.js --root <repo> --out <dir> --user <user> --pass <password> \
  --hours 24 --title "PR #12" [--files-from <nul-separated-list>] [files...]
```

Writes `<dir>/index.html` and `<dir>/expires-at` (epoch seconds).

Publisher:

```bash
ci/pages.sh publish pr-12 <dir>
ci/pages.sh remove pr-12
ci/pages.sh prune
```

Preview URL: `https://<owner>.github.io/<repo>/previews/pr-<number>/`

## Key Design Decisions

* **Encryption instead of server auth** - GitHub Pages has no basic auth, so the page ships as ciphertext and the browser decrypts it. Nothing else to host and no extra accounts.
* **Orphan commit on every change** - `gh-pages` always has one commit, so an expired preview is really gone from the branch, not only from the latest tree.
* **Payload shape** - `{ title, expiresAt, sealed: { iterations, salt, iv, data } }`, where `data` decrypts to `{ files: [{ path, type, content }], assets: { path: dataUri } }`.
* **Shared global scope** - `seal.js`, `markdown.js` and the viewer script are inlined into one page, a test fails if they declare the same top level name.

## Security Notes

* **Password lives in a secret** - PR comments, workflow logs, job summaries and artifacts are public in a public repo, so the password is never written to any of them. It comes from the `RENDER_PASS` repository secret, which GitHub masks in logs and never passes to fork PRs.
* **One password for all previews** - rotate it with `gh secret set RENDER_PASS`. Old previews die within 24h anyway.
* **Expiry window** - the hourly cron plus the GitHub Pages cache means files can be served for up to about 1h 10m after 24h. The page itself refuses to unlock at exactly 24h.
* **Copies** - anyone who unlocked the page or fetched `gh-pages` before prune can keep a copy.
* **Owner only** - `github.repository_owner` is a user for personal repos. For an organization repo change the check to a user login.

## GitHub Setup (not done yet)

1. Create the `temp-render` label.
2. Create the password secret and keep a copy in a password manager: `openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | cut -c1-32 | tee /dev/tty | gh secret set RENDER_PASS`.
3. Push this code so the workflows exist on the default branch.
4. After the first publish creates `gh-pages`, enable GitHub Pages from the `gh-pages` branch, root folder.
5. Settings, Actions, General: allow workflows read and write permissions.

## Printscreens

Markdown file rendered after unlocking: headings, embedded image, task list with nested items and an aligned table. The left side lists every changed file grouped by folder, with an expiry countdown on top.

<img src="printscreens/01-markdown.png" width="900"/>

HTML file rendered with its own CSS and JavaScript inside a sandboxed iframe. It was opened by clicking a link inside the markdown file.

<img src="printscreens/02-html.png" width="900"/>

After 24 hours the page refuses to unlock and hides the login form.

<img src="printscreens/03-expired.png" width="900"/>

## Tests

```bash
./scripts/test-all.sh
```

31 tests cover markdown rendering, encryption round trips and wrong credentials, path leak and symlink rejection, expiry, payload escaping, `gh-pages` publish, remove and prune against a local bare repo, and duplicate global names.

## Scripts

All scripts live in `scripts/` and run from any directory of the repository.

| Script | What it does |
|---|---|
| `./scripts/setup.sh` | Checks node, python3, git and lsof, nothing to install |
| `./scripts/start-all.sh` | Builds the files in `samples/` with a random password and serves them, prints the user, password and link |
| `./scripts/status.sh` | Shows the viewer port as UP or DOWN |
| `./scripts/test-all.sh` | Runs every test suite |
| `./scripts/ui.sh` | Opens the viewer in the browser |
| `./scripts/stop-all.sh` | Stops the viewer |

Ports are declared in `scripts/ports.env`.

```bash
./scripts/setup.sh
./scripts/start-all.sh
./scripts/status.sh
./scripts/ui.sh
./scripts/stop-all.sh
```
