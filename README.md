# Decision Matrix

Compare choices using weighted criteria or weighted pros and cons. Decisions are ordinary Markdown notes in your vault, with YAML data and readable tables and lists.

- **Weighted matrix:** criteria weights and option scores from 1–10. Totals are the sum of weight × score.
- **Pros & cons:** impacts from 1–5. Net scores subtract cons from pros.
- **Live comparison:** ranked options, comparison bars, winner highlights and explicit ties.
- **Vault sync:** changes in the workspace, embeds, frontmatter and generated Markdown stay synchronized. Shared views use the same document.
- **Responsive editor:** add, rename and remove options, criteria, pros and cons, with theme colors and labeled sliders.

## Install from a release

Requires Obsidian 1.5.0 or later. Download `main.js`, `manifest.json`, and `styles.css` from the [latest GitHub release](https://github.com/Yaloalo/obsidian_decision_matrix/releases/latest). Copy the three files into your vault's `.obsidian/plugins/decision-matrix/` folder, then reload Obsidian and enable **Decision Matrix** under Community plugins. If you use a custom Obsidian configuration folder, use that folder in place of `.obsidian`.

The GitHub release can be installed manually before community-directory approval. Listing in Obsidian's directory is a separate review process.

## Build and install locally

Requires Node.js 22+ to build; the installed plugin has no Node.js dependency and supports Obsidian desktop and mobile.

```bash
npm ci
npm run check
npm test
npm run build
npm run install:local -- --vault "/path/to/your/vault"
```

The installer copies `main.js`, `manifest.json` and `styles.css` into `.obsidian/plugins/decision-matrix/`, backs up existing plugin files and the enabled-plugin list, and enables the plugin without changing other plugin IDs. Existing `data.json` and decision notes are preserved. On Linux, omitting `--vault` uses the single open vault recorded in Obsidian's configuration.

Reload Obsidian after installation. If community plugins are disabled, enable them in Obsidian settings. You can also copy the three files manually and enable **Decision Matrix** in Community plugins.

## Use

Click the **scale** ribbon icon to open the active decision note, or the decision hub when the active note is an ordinary note. The command palette also includes **Open decision hub** and **Create new decision**.

In the hub, enter a title and choose **New decision**. Use the editor to change criteria, scores and reasons. Changes save automatically; the toolbar shows save status and opens the underlying Markdown note. Switching modes keeps both sets of data. Notes default to `decisions/`; change the folder in plugin settings. Changing the folder affects the hub and new notes and does not move existing notes. Editing a title leaves its file path stable.

To embed an interactive editor in another note, put a vault-relative decision path in a fenced block:

````markdown
```decision
decisions/Choose a home.md
```
````

A `[[decision note]]` reference is also supported. Embeds and the workspace share live edits. Update the reference if you rename a file; Obsidian does not automatically rewrite plain paths in code blocks.

## Edit decisions as Markdown

Frontmatter uses `decision-matrix: 1`, a `decision` object containing all structured data, and `decision-matrix-body`, a checksum identifying edits to the generated body. Keep the section boundary comments and hidden `dm:` IDs: they connect names and table columns to stable records.

Within the generated section you can edit:

- The title and `Mode: Weighted Matrix` / `Mode: Pros & Cons` line.
- Criteria names and weights in the Criteria table, and names and scores in the Options table.
- Option names in the table or their pros/cons headings. If changing both copies, keep them equal.
- Pro/con bullets using `- Reason (impact: 3)`. Remove bullets to delete reasons; new bullets receive IDs automatically.
- Add or remove option rows or criterion rows. New criterion scores default to 5 until set. Preserve the Options table's existing column IDs; the plugin regenerates columns after it imports the edit.

YAML-only changes regenerate the readable body. Body changes update YAML and regenerate rankings. If you edit both YAML and the generated body in the same change, the editable body takes precedence. Unrelated frontmatter properties and prose outside the generated section are retained; YAML formatting/comments inside frontmatter may be normalized when saving.

Malformed decision data displays an error and is not overwritten. If a note changes during an in-flight UI save, the plugin preserves the note and keeps the unsaved draft visible. Copy any draft changes you need, then choose **Reload note and discard draft**. Ranges are validated before reading or writing; no invalid scores are silently clamped.

## Development

```bash
npm run dev       # watch and rebuild
npm run check     # Svelte and TypeScript diagnostics
npm test          # scoring, Markdown round-trips, and vault synchronization tests
npm run build     # production bundle
```

Tests use the actual YAML parser with an in-memory Obsidian vault adapter, including external edits, malformed notes, save conflicts, rapid edits, renames and deletions. A live Obsidian session is still needed to check host integration and appearance on desktop/mobile.

## Privacy

The installed plugin works offline. It makes no network requests, sends no telemetry, requires no account or payment, and stores decision data only in your vault. It does not install or update itself.

The optional `install:local` command is development tooling, runs only when invoked in a terminal, and is excluded from the plugin bundle. It reads Obsidian's application configuration to find the selected vault and copies the build into its configuration folder. Registry verification and GitHub Actions use the network during release preparation; neither runs inside Obsidian.

## Publishing and license

See [PUBLISHING.md](PUBLISHING.md) for the release workflow and community submission details. The project uses the [MIT License](LICENSE). Bundled Svelte runtime attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and included in the JavaScript bundle.
