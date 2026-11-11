import { readFile, writeFile, mkdir, copyFile, rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args[0] !== '--vault' || args.length !== 2)) {
	console.error('Usage: npm run install:local -- [--vault /path/to/vault]');
	process.exit(1);
}

try {
	let vault = args[1];
	if (!vault) {
		const config = JSON.parse(await readFile(join(homedir(), '.config/obsidian/obsidian.json'), 'utf8'));
		const vaults = Object.values(config.vaults ?? {});
		const opened = vaults.filter(item => item.open);
		if (opened.length === 1) vault = opened[0].path;
		else if (vaults.length === 1) vault = vaults[0].path;
		else throw new Error('Specify the vault explicitly using --vault /path/to/vault.');
	}
	vault = resolve(vault);
	const configDir = join(vault, '.obsidian');
	await access(configDir);
	const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
	const filenames = ['main.js', 'manifest.json', 'styles.css'];
	// Read all build artifacts and settings before changing the vault.
	const artifacts = await Promise.all(filenames.map(name => readFile(join(root, name))));
	const enabledPath = join(configDir, 'community-plugins.json');
	let enabled = [];
	let previousEnabled;
	try { previousEnabled = await readFile(enabledPath, 'utf8'); enabled = JSON.parse(previousEnabled); }
	catch (error) { if (error.code !== 'ENOENT') throw error; }
	if (!Array.isArray(enabled) || enabled.some(id => typeof id !== 'string')) throw new Error('community-plugins.json must contain a list of plugin IDs.');
	const target = join(configDir, 'plugins', manifest.id);
	const backup = join(configDir, 'plugins', '.decision-matrix-backups', new Date().toISOString().replace(/[:.]/g, '-'));
	await mkdir(backup, { recursive: true });
	await mkdir(target, { recursive: true });
	for (const filename of filenames) {
		try { await copyFile(join(target, filename), join(backup, filename)); }
		catch (error) { if (error.code !== 'ENOENT') throw error; }
	}
	if (previousEnabled !== undefined) await writeFile(join(backup, 'community-plugins.json'), previousEnabled);
	for (let i = 0; i < filenames.length; i++) {
		const destination = join(target, filenames[i]);
		const temporary = destination + '.decision-matrix-install.tmp';
		await writeFile(temporary, artifacts[i]);
		await rename(temporary, destination);
	}
	if (!enabled.includes(manifest.id)) {
		const temporary = enabledPath + '.decision-matrix-install.tmp';
		await writeFile(temporary, JSON.stringify([...enabled, manifest.id], null, 2) + '\n');
		await rename(temporary, enabledPath);
	}
	console.log(`Installed and enabled ${manifest.name} in ${vault}`);
	console.log(`Backup: ${backup}`);
	console.log('Reload Obsidian, then click the scale ribbon icon or run “Decision Matrix: Open decision hub”.');
} catch (error) {
	console.error(`Installation failed: ${error.message}`);
	process.exitCode = 1;
}
