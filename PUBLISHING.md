# Publishing Decision Matrix

Repository: https://github.com/Yaloalo/obsidian_decision_matrix

- Plugin ID: `decision-matrix`
- Display name: `Decision Matrix`
- First release tag: `1.0.0` (no `v` prefix)
- Minimum Obsidian version: `1.7.2`
- Platforms: desktop and mobile (the runtime bundle uses only the Obsidian API and browser APIs)
- License: MIT

## Validate and package

Use Node.js 22.13 or later:

```bash
npm ci
npm run package:release
npm run verify:registry
```

`package:release` runs Obsidian's recommended ESLint rules with zero warnings allowed, Svelte and TypeScript diagnostics, automated tests, the production build and release validation, then copies the three installable files into `dist/release/`. Validation checks manifest fields, matching package/lockfile/compatibility versions, release-tag format, license notices, and that no Node.js or developer tooling dependencies appear in the mobile runtime bundle.

`verify:registry` downloads the official Obsidian registry and checks that the chosen ID and display name do not belong to another repository. This command uses the network only during release preparation.

Check host behavior in an Obsidian test vault before changing the supported versions: create and reopen a decision; edit each mode; edit YAML and body tables; open an embed; rename the note; disable/re-enable the plugin; and check the layout on a narrow screen. Automated storage tests do not replace testing on an actual mobile device.

## GitHub releases

The release workflow runs when `manifest.json` changes on `main`, when the release workflow itself changes, on a pushed tag, or through **Actions → Publish plugin release → Run workflow**. It validates the build and the live registry before publishing.

It uses the exact version from `manifest.json` as the release tag and attaches these three files individually:

- `main.js`
- `manifest.json`
- `styles.css`

Before uploading, the workflow creates and verifies GitHub build provenance attestations for all three assets. It leaves any existing release untouched. For a correction, increase the version instead of silently replacing published files. A pushed tag must match the manifest version exactly. The workflow needs GitHub Actions enabled, `contents: write`, `id-token: write` and `attestations: write`; it uses the repository's built-in token and requires no personal token.

For the next release, update `RELEASE_NOTES.md`, run `npm version patch` (or `minor`/`major`), then push the commit and generated tag. The version script keeps `manifest.json` and `versions.json` aligned. The release workflow rejects mismatched versions.

Do not commit generated `main.js`, `dist/`, or `node_modules/`. Keep the source, lockfile, manifest, README and license in the default branch. Publish assets through GitHub Releases.

## Submit to Obsidian

A GitHub release is separate from inclusion in the community directory. Follow the current [official submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and [developer policies](https://docs.obsidian.md/community-directory/developer-policies).

Sign into [community.obsidian.md](https://community.obsidian.md) with your Obsidian account, link your GitHub account, and add the repository above. The directory reads `manifest.json` from the default branch and installs the assets from the release whose tag matches its version. Resolve any automated review findings and publish through the directory when ready. Review and acceptance are controlled by Obsidian.

The Markdown store changes structured frontmatter, the readable body and their checksum together through `Vault.process`. This keeps all three representations atomic; separate frontmatter and body transactions could otherwise expose a partially updated decision to another editor or vault watcher.
