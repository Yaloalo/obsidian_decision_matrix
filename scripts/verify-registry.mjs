import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const response = await fetch('https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json', {
	signal: AbortSignal.timeout(30000)
});
if (!response.ok) throw new Error(`Could not check Obsidian's registry: HTTP ${response.status}.`);
const plugins = await response.json();
assert(Array.isArray(plugins), 'The registry must be a plugin list.');
for (const entry of plugins) {
	if (entry.repo?.toLowerCase() === 'yaloalo/obsidian_decision_matrix') continue;
	assert.notEqual(entry.id, manifest.id, `Plugin ID already belongs to ${entry.repo}.`);
	assert.notEqual(entry.name.toLowerCase(), manifest.name.toLowerCase(), `Display name already belongs to ${entry.repo}.`);
}
console.log(`Registry checked: ${manifest.id} and “${manifest.name}” are available for this repository.`);
