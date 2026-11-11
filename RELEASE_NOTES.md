Compatibility and submission fixes for Decision Matrix.

- Declare Obsidian 1.7.2 as the minimum version required by the workspace view API.
- Scan only the configured decisions folder, including its subfolders, when building the hub.
- Validate saved settings and criterion IDs before using them.
- Make the decisions-folder setting searchable on Obsidian 1.13+, while keeping the legacy settings UI on older versions.
- Use the active window's browser crypto API when generating IDs.
- Remove the redundant plugin ID from the open command and simplify the flagged CSS and regular expression.
- Add build provenance attestations for all three release assets.

The open command's ID changed from `decision-matrix:open-decision-matrix` to `decision-matrix:open-active`; reassign a custom hotkey if you used the old command. Your notes and stored decision data are unchanged.
