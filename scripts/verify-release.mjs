import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { Script } from 'node:vm';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json('manifest.json');
const pkg = await json('package.json');
const lock = await json('package-lock.json');
const versions = await json('versions.json');
const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/, 'Use a lowercase hyphenated plugin ID.');
assert(!manifest.id.includes('obsidian') && !manifest.id.endsWith('plugin'), 'The plugin ID contains a reserved word.');
assert.match(manifest.name, /^[A-Za-z0-9 ()+\-]+$/, 'The display name contains unsupported punctuation.');
assert(!/obsidian|plugin/i.test(manifest.name), 'The display name contains a reserved word.');
assert(manifest.name.trim() && manifest.author.trim(), 'Name and author are required.');
assert.match(manifest.version, version);
assert.match(manifest.minAppVersion, version);
assert.equal(typeof manifest.isDesktopOnly, 'boolean');
assert(manifest.description.length <= 250 && manifest.description.endsWith('.'), 'Description must end in a period and contain at most 250 characters.');
assert.match(manifest.description, /^[\x20-\x7e]+$/, 'Description must not contain emoji or special characters.');
assert.equal(pkg.version, manifest.version, 'package.json and manifest.json versions differ.');
assert.equal(lock.version, manifest.version, 'Lockfile version differs.');
assert.equal(lock.packages[''].version, manifest.version, 'Lockfile package version differs.');
assert.equal(versions[manifest.version], manifest.minAppVersion, 'versions.json must map the release to minAppVersion.');
assert.equal(pkg.license, 'MIT');
assert.equal(pkg.repository.url, 'git+https://github.com/Yaloalo/obsidian_decision_matrix.git');
assert(!pkg.scripts.install && !pkg.scripts.postinstall, 'Do not install into a vault as an npm lifecycle side effect.');
if (process.env.GITHUB_REF_TYPE === 'tag') {
	assert.equal(process.env.GITHUB_REF_NAME, manifest.version, 'Release tag must match manifest.version exactly, without a v prefix.');
}
for (const file of ['main.js', 'manifest.json', 'styles.css', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
	assert((await stat(file)).size > 0, `${file} must exist and be nonempty.`);
}
const source = await readFile('main.js', 'utf8');
new Script(source, { filename: 'main.js' });
assert(source.includes('Svelte Contributors'), 'The bundled runtime license notice is missing.');
assert(!source.includes('sourceMappingURL='), 'Do not distribute development source maps.');
const metafile = await json('dist/build-metafile.json');
assert.deepEqual([...new Set(Object.values(metafile.outputs).flatMap(output => output.imports.map(item => item.path)))], ['obsidian'],
	'The mobile bundle must resolve all runtime dependencies except the Obsidian API.');
assert(!Object.keys(metafile.inputs).some(path => /^(scripts|tests)\//.test(path)), 'Developer tooling must not be bundled into the plugin.');
console.log(`Release checks passed: ${manifest.id} ${manifest.version}, Obsidian ${manifest.minAppVersion}+, desktop and mobile bundle.`);
