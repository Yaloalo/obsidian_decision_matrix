# Decision Matrix & Pros/Cons Plugin Specification

## 1. Vision & Purpose
When facing complex choices—such as buying a car, choosing an apartment, deciding on a vacation destination, or comparing job opportunities—human brains struggle to weigh trade-offs objectively.

The **Decision Matrix & Pros/Cons** plugin turns Obsidian into an interactive, visual decision-making engine. It allows users to compare alternatives using either **Weighted Criteria Scoring** or **Weighted Pros & Cons**, storing all data directly in vault Markdown files.

---

## 2. Core Functional Requirements

### A. Two Operational Modes
1. **Weighted Criteria Matrix (Multi-Criteria Decision Analysis - MCDA)**:
   - Users create evaluation criteria (e.g., *Price*, *Safety*, *Aesthetics*, *Speed*).
   - Each criterion has an adjustable importance weight (1x to 10x).
   - Each option is scored from 1 to 10 on each criterion.
   - The plugin computes total weighted scores:
     $$\text{Total Score} = \sum (\text{Criterion Weight} \times \text{Option Score})$$
   - Real-time ranking with a visual "Winner" highlight and comparison bars.

2. **Weighted Pros & Cons Analyzer**:
   - Side-by-side columns for each option.
   - Separate lists for **Pros** (green) and **Cons** (red).
   - Each pro/con has an impact rating from 1 to 5.
   - Automatic net score calculation:
     $$\text{Net Score} = \sum \text{Pros Weights} - \sum \text{Cons Weights}$$

### B. Markdown Storage & Two-Way Sync
- Each decision is stored as a standard Markdown note inside the user's designated folder (e.g., `decisions/car-choice.md`).
- **YAML Frontmatter**: Keeps structured data (options, criteria, scores, weights).
- **Markdown Body**: Generates clean, human-readable comparison tables and bulleted pros/cons so the note remains 100% accessible even outside of Obsidian or when mobile plugins are disabled.
- Bidirectional live-sync: Edits made in the note or in the UI stay synchronized.

### C. Workspace View & User Interface
- **Ribbon Icon**: `scale` icon to open the active decision or decision hub.
- **Header Toolbar**:
  - Title input for the decision.
  - Mode toggle: *Weighted Matrix* vs *Pros & Cons*.
  - "Open Markdown Note" button.
- **Interactive Controls**:
  - Add / delete options.
  - Add / delete criteria.
  - Sliders for fluid weight and score adjustments.
  - Mobile-responsive layout (collapses gracefully on phone screens).

---

## 3. Obsidian Technical Standards
- **Framework**: Svelte 5 with fine-grained reactivity (`$state`, `$derived`, `$props`).
- **Theme Support**: 100% CSS variables (`--background-primary`, `--text-normal`, `--interactive-accent`, etc.).
- **Security**: Zero `innerHTML` usage; strict sanitized DOM generation.
- **Compatibility**: Desktop and Obsidian Mobile.

---

## 4. Implementation Checklist
- [x] Svelte 5 + TypeScript + esbuild bundling pipeline.
- [x] Initial UI prototype with weighted matrix and pros & cons views.
- [x] Markdown repository (`src/markdownStore.ts`):
  - Read/write `.md` decision files with frontmatter and Markdown tables.
  - Vault file watcher for external edits.
- [x] Decision Hub / Index view: List all decisions in `decisions/` with quick-create button.
- [x] Codeblock processor (` ```decision `) to embed decision widgets inside any note.
