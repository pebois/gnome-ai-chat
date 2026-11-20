---
name: release
description: Cut a gnome-ai-chat release - bump the version in package.json, package-lock.json and src/lib/constants.ts, add the AppStream metainfo <release> entry, finalize CHANGELOG.md, verify, commit "Release version X.Y.Z" and tag vX.Y.Z. Use this whenever the user asks to bump the version, release, ship, prepare or cut version X.Y.Z, publish a patch/minor/major, write release notes for the metainfo, or tag a release in this repo, even if they only say "bump version" or "tag".
---

# Release gnome-ai-chat

A release touches five files that must agree on one version, plus a commit and a tag. Users see the metainfo text in GNOME Software and Flathub, and developers read the CHANGELOG and `git log`. Write each for its reader instead of copying one into the other.

Run every command from the repo root.

## 1. Check the starting point

```bash
git status --short
git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
date +%F
```

- **Uncommitted changes:** if `git status` shows any, they are probably unfinished work. Ask the user whether to commit them separately, or to stash or drop them, before you release. A release commit that silently ships a code change is hard to review later.
- **Unreleased notes:** if `## [Unreleased]` in `CHANGELOG.md` is empty, stop and say there is nothing to release.
- **Missing entries:** compare `[Unreleased]` with the commits since the last tag. If a user-visible `feat:` or `fix:` commit has no entry, mention it, and add the entry before you release if the user agrees.
- **Date:** use the date from `date +%F`. Never guess it.

## 2. Pick the version

If the user named a version or a bump type, use it. Otherwise infer it from `[Unreleased]` and say which you chose:
- **major:** a breaking change for users, such as removed features or data that no longer loads.
- **minor:** any `### Added` entry.
- **patch:** only `### Fixed` or small `### Changed` entries.

Check that the tag is free: `git tag -l vX.Y.Z` must print nothing.

## 3. Update the files

1. **package files:**
   ```bash
   npm version <major|minor|patch|X.Y.Z> --no-git-tag-version
   ```
   This updates `package.json` and `package-lock.json`. Don't let npm commit or tag: both come after verification.
2. **app constant:** set `export const VERSION = 'X.Y.Z'` in `src/lib/constants.ts`. The About dialog reads it.
3. **CHANGELOG.md:** rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`. Insert a new empty `## [Unreleased]` above it, followed by a blank line. Leave the entries unchanged.
4. **metainfo:** in `io.github.pebois.gnome-ai-chat.metainfo.xml`, add a new `<release>` as the first child of `<releases>`, with the same indentation as the others:
   ```xml
   <release version="X.Y.Z" date="YYYY-MM-DD">
     <description>
       <p>This release adds …, … and ….</p>
       <ul>
         <li>Added …</li>
         <li>Fixed …</li>
       </ul>
     </description>
   </release>
   ```
   - **Summary:** one `<p>` that sums up the theme of the release in one sentence, starting with "This release …".
   - **Bullets:** one `<li>` per notable change, at most 8, ordered from most to least important to a user. Merge related CHANGELOG entries, and leave out purely internal ones (refactors, tests, logging, tooling). A small release has few bullets, which is fine.
   - **Language:** each bullet is a full sentence ending with a period, in plain user language: no file paths, function names, migration numbers or table names. Command names such as `/deepsearch` are fine because users type them.
   - **Escaping:** escape `&`, `<` and `>`.
   - **Tone:** match the earlier entries.
5. **desktop file:** don't touch `Version=` in `io.github.pebois.gnome-ai-chat.desktop`. It is the Desktop Entry Specification version (`1.1`), not the app version.

## 4. Verify

```bash
grep -h '"version"' package.json | head -1
node -p "const l = require('./package-lock.json'); l.version + ' ' + l.packages[''].version"
grep "export const VERSION" src/lib/constants.ts
grep -m1 '<release ' io.github.pebois.gnome-ai-chat.metainfo.xml
grep -m2 '^## \[' CHANGELOG.md
git status --short
npm run lint-fix && npm run lint
npm run build
npm test
appstreamcli validate --no-net io.github.pebois.gnome-ai-chat.metainfo.xml
```

- **Versions:** all five places show X.Y.Z, and both dates are today's.
- **CHANGELOG headers:** the two headers are `## [Unreleased]` then `## [X.Y.Z] - today`.
- **Changed files:** `git status` lists only `CHANGELOG.md`, the metainfo, `package.json`, `package-lock.json` and `src/lib/constants.ts`.
- **Tests:** if `npm test` fails on a Watchman file-watch limit, rerun it with `npm test -- --watchman=false`. If a test fails for a reason unrelated to the release, report it with its output and ask before going on. Don't hide a failure.

## 5. Commit on the release branch

Create a `release/vX.Y.Z` branch (never commit directly to protected `main`):

```bash
git checkout -b release/vX.Y.Z
git commit -a -F - <<'EOF'
Release version X.Y.Z

Added:
- Short fragment per notable addition, wrapped at about 72 columns
  with a two-space continuation indent

Fixed:
- …

Changed:
- …

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- **Body:** a condensed CHANGELOG for someone scrolling `git log`, one terse fragment per bullet with no trailing period. Group the minor fixes into one bullet.
- **Sections:** keep only the ones that have entries, in the order Added, Fixed, Changed.
- **Trailer:** use the attribution line given in the session, or the one above if the session doesn't give one.
- **Example:** `git show -s v1.14.0` shows the expected shape.

## 6. Report and tag after PR merge

Report:
- the version and the release branch `release/vX.Y.Z` ready for a Pull Request to `main`;
- after the founder merges the PR into `main`, tag the merge commit with a lightweight tag (never `-a`) and push the tag:
  ```bash
  git checkout main && git pull --ff-only origin main
  git tag vX.Y.Z
  git push origin vX.Y.Z
  ```

Never merge or publish yourself: merging and tagging are the user's call.

## Tagging an existing release

If the user says "tag" after a release PR has merged to `main` without a tag yet:
1. Find the merged `Release version X.Y.Z` commit on `main`.
2. Check that `vX.Y.Z` doesn't exist.
3. Run `git tag vX.Y.Z <hash>`.

Don't bump anything.
