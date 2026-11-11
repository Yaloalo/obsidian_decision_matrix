import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { createDecision, cloneDecision, matrixScore, netScore, rankOptions, validateDecision } from '../src/decision';
import { isDecisionNote, readDecisionNote, renderDecisionBody, writeDecisionNote } from '../src/markdown';
import { decisionFolder, MarkdownDecisionStore } from '../src/markdownStore';
import { TFile, TFolder } from './obsidianMock';
import { readSettings } from '../src/settings';
import type { App } from 'obsidian';

const codec = { parse, stringify };
const fixture = () => {
	const decision = createDecision('Choose a home');
	decision.options[0].scores[decision.criteria[0].id] = 8;
	decision.options[1].scores[decision.criteria[0].id] = 3;
	decision.options[0].pros.push({ id: 'pro-1', text: 'Near friends', weight: 4 });
	decision.options[0].cons.push({ id: 'con-1', text: 'Small kitchen', weight: 2 });
	return decision;
};

function editYaml(source: string, edit: (data: any) => void) {
	return source.replace(/^---\n([\s\S]*?)\n---/, (_, yaml) => {
		const data = parse(yaml); edit(data); return `---\n${stringify(data).trimEnd()}\n---`;
	});
}

class Vault {
	files = new Map<string, TFile | TFolder>();
	contents = new Map<string, string>();
	beforeProcess?: () => Promise<void>;
	writes = 0;
	reads: string[] = [];
	getAbstractFileByPath(path: string) { return this.files.get(path) ?? null; }
	getMarkdownFiles() { return [...this.files.values()].filter((file): file is TFile => file instanceof TFile && file.extension === 'md'); }
	async read(file: TFile) { this.reads.push(file.path); const content = this.contents.get(file.path); if (content === undefined) throw Error('Missing file'); return content; }
	private add(file: TFile | TFolder) {
		this.files.set(file.path, file);
		const parent = this.files.get(file.path.slice(0, file.path.lastIndexOf('/')));
		if (parent instanceof TFolder) parent.children.push(file);
	}
	async createFolder(path: string) { const folder = new TFolder(path); this.add(folder); return folder; }
	async create(path: string, content: string) {
		assert(!this.files.has(path)); const file = new TFile(path); this.add(file); this.contents.set(path, content); return file;
	}
	async process(file: TFile, update: (source: string) => string) {
		await this.beforeProcess?.();
		const next = update(await this.read(file)); this.contents.set(file.path, next); this.writes++; return next;
	}
}
const setup = () => {
	const vault = new Vault();
	const store = new MarkdownDecisionStore({ vault } as unknown as App, 'decisions');
	return { vault, store };
};
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function settled(store: MarkdownDecisionStore, path: string) {
	for (let i = 0; i < 100; i++) { await tick(); if (!store.get(path)?.saving) return; }
	throw Error('Save did not finish');
}

// These exercise the storage and synchronization boundary rather than copying UI implementation.
test('calculates both scoring modes and tied competition ranks', () => {
	const decision = fixture();
	assert.equal(matrixScore(decision, decision.options[0]), 40);
	assert.equal(netScore(decision.options[0]), 2);
	assert.deepEqual(rankOptions(decision).map(item => item.score), [40, 15]);
	decision.options[1].scores[decision.criteria[0].id] = 8;
	assert.deepEqual(rankOptions(decision).map(item => item.rank), [1, 1]);
	decision.mode = 'pros-cons';
	assert.deepEqual(rankOptions(decision).map(item => item.score), [2, 0]);
	decision.options[1].cons.push({ id: 'negative', text: 'Expensive', weight: 5 });
	assert.equal(rankOptions(decision)[1].score, -5);
});

test('validates ratings, IDs and malformed structures before saving', () => {
	const decision = fixture();
	decision.criteria[0].weight = 11;
	assert.throws(() => validateDecision(decision), /1 to 10/);
	decision.criteria[0].weight = 5;
	decision.options[0].pros[0].weight = 1.5;
	assert.throws(() => validateDecision(decision), /1 to 5/);
	decision.options[0].pros[0].weight = 3;
	decision.options[0].id = decision.criteria[0].id;
	assert.throws(() => validateDecision(decision), /unique ID/);
	assert.throws(() => validateDecision({}), /must be text/);
});

test('round-trips YAML and readable Markdown including literal HTML, pipes and Unicode', () => {
	const decision = fixture();
	decision.title = 'Home | <script>alert(1)</script>\n新';
	decision.criteria[0].name = 'Cost & safety | <!-- dm:fake -->';
	decision.options[0].name = '**A** [link] `code`';
	decision.options[0].pros[0].text = 'Space | <img src=x> &amp;\nnext';
	const source = writeDecisionNote('', decision, codec);
	assert.deepEqual(readDecisionNote(source, codec), decision);
	const body = renderDecisionBody(decision);
	assert(!body.includes('<script>'));
	assert(!body.includes('<img'));
	assert(body.includes('&#124;'));
	// Re-import the editable body, exercising entity decoding too.
	const edited = source.replace('Mode: Weighted Matrix', 'Mode: Pros & Cons');
	assert.deepEqual(readDecisionNote(edited, codec), { ...decision, mode: 'pros-cons' });
});

test('preserves unrelated frontmatter and user prose outside the managed region', () => {
	const decision = fixture();
	let source = writeDecisionNote('', decision, codec);
	source = editYaml(source, data => { data.tags = ['personal']; data.owner = 'Me'; });
	source = source.replace('<!-- decision-matrix:start -->', 'My introduction\n\n<!-- decision-matrix:start -->') + '\n## My notes\nKeep this.\n';
	decision.title = 'Updated';
	const saved = writeDecisionNote(source, decision, codec);
	assert(saved.includes('My introduction'));
	assert(saved.endsWith('## My notes\nKeep this.\n'));
	assert.deepEqual(parse(saved.match(/^---\n([\s\S]*?)\n---/)![1]).tags, ['personal']);
	assert.equal(readDecisionNote(saved, codec).title, 'Updated');
});

test('YAML-only edits win over the unchanged generated body', () => {
	const decision = fixture();
	const source = editYaml(writeDecisionNote('', decision, codec), data => {
		data.decision.title = 'Edited in source';
		data.decision.criteria[0].weight = 9;
	});
	const parsed = readDecisionNote(source, codec);
	assert.equal(parsed.title, 'Edited in source');
	assert.equal(matrixScore(parsed, parsed.options[0]), 72);
});

test('body edits update title, mode, weights, scores, option names and reasons', () => {
	const decision = fixture();
	let source = writeDecisionNote('', decision, codec);
	source = source.replace('# Choose a home', '# New title').replace('Mode: Weighted Matrix', 'Mode: Pros & Cons');
	source = source.replace(`<!-- dm:${decision.criteria[0].id} --> | 5 |`, `<!-- dm:${decision.criteria[0].id} --> | 7 |`);
	source = source.replace(`Option A <!-- dm:${decision.options[0].id} --> | 8 |`, `Apartment A <!-- dm:${decision.options[0].id} --> | 9 |`);
	source = source.replace('- Near friends (impact: 4)', '- Close to work (impact: 5)');
	const parsed = readDecisionNote(source, codec);
	assert.equal(parsed.title, 'New title');
	assert.equal(parsed.mode, 'pros-cons');
	assert.equal(parsed.criteria[0].weight, 7);
	assert.equal(parsed.options[0].name, 'Apartment A');
	assert.equal(parsed.options[0].scores[decision.criteria[0].id], 9);
	assert.deepEqual(parsed.options[0].pros, [{ id: 'pro-1', text: 'Close to work', weight: 5 }]);
	assert.deepEqual(readDecisionNote(writeDecisionNote(source, parsed, codec), codec), parsed);
});

test('supports body option/criterion insertion and deletion without handwritten IDs', () => {
	const decision = fixture();
	let source = writeDecisionNote('', decision, codec);
	source = source.replace('## Options', '| Safety | 8 |\n\n## Options');
	source = source.replace('## Pros & Cons', '| Option C | 7 |\n\n## Pros & Cons');
	let parsed = readDecisionNote(source, codec);
	assert.equal(parsed.criteria.length, 2);
	assert.equal(parsed.options.length, 3);
	assert.equal(parsed.options[2].scores[parsed.criteria[1].id], 5);
	source = writeDecisionNote(source, parsed, codec);
	source = source.split('\n').filter(line => !(line.startsWith('| Option B ') || line.startsWith('| Safety '))).join('\n');
	parsed = readDecisionNote(source, codec);
	assert.equal(parsed.criteria.length, 1);
	assert.equal(parsed.options.length, 2);
});

test('supports adding and deleting reasons in Markdown', () => {
	const decision = fixture();
	const source = writeDecisionNote('', decision, codec)
		.replace('- Near friends (impact: 4) <!-- dm:pro-1 -->', '- Garden (impact: 5)\n- Sunny (impact: 2)');
	const parsed = readDecisionNote(source, codec);
	assert.deepEqual(parsed.options[0].pros.map(item => [item.text, item.weight]), [['Garden', 5], ['Sunny', 2]]);
	assert.notEqual(parsed.options[0].pros[0].id, parsed.options[0].pros[1].id);
});

test('supports zero criteria, no options, CRLF and titles resembling YAML', () => {
	const decision = fixture();
	decision.criteria = []; decision.options.forEach(option => { option.scores = {}; });
	let source = writeDecisionNote('', decision, codec).replace('# Choose a home', '# true: [null]');
	assert.equal(readDecisionNote(source.replace(/\n/g, '\r\n'), codec).options.length, 2);
	decision.options = [];
	source = writeDecisionNote('', decision, codec).replace('# Choose a home', '# Empty');
	assert.equal(readDecisionNote(source, codec).options.length, 0);
});

test('refuses malformed notes, missing markers and invalid body ratings', () => {
	const source = writeDecisionNote('', fixture(), codec);
	assert.throws(() => readDecisionNote(source.replace('<!-- decision-matrix:end -->', ''), codec), /markers/);
	assert.throws(() => readDecisionNote(source.replace('(impact: 4)', '(impact: 9)'), codec), /1 to 5/);
	assert.throws(() => readDecisionNote(source.replace('## Criteria', '## Removed'), codec), /headings/);
	assert.throws(() => readDecisionNote('---\ninvalid: [\n---\n', codec));
	assert.throws(() => readDecisionNote(source.replace('decision-matrix: 1', 'decision-matrix: 2'), codec), /not a supported/);
	assert(!isDecisionNote('# Ordinary note'));
});

test('creates nested storage, collision-safe filenames and a folder-scoped hub', async () => {
	const { vault, store } = setup();
	store.folder = 'personal/decisions';
	const first = await store.create('Buy / rent?');
	const second = await store.create('Buy / rent?');
	assert.notEqual(first, second);
	assert(first.startsWith('personal/decisions/'));
	assert.equal(store.list().length, 2);
	assert(vault.getAbstractFileByPath('personal') instanceof TFolder);
	await vault.create('normal.md', 'ordinary note');
	await store.read('normal.md');
	assert.equal(store.list().length, 2);
	assert.equal(decisionFolder('/personal//decisions/'), 'personal/decisions');
	assert.throws(() => decisionFolder('../outside'), /inside your vault/);
});

test('coalesces rapid edits and writes the latest full decision', async () => {
	const { vault, store } = setup();
	const path = await store.create();
	let release!: () => void;
	const gate = new Promise<void>(resolve => { release = resolve; });
	vault.beforeProcess = () => gate;
	const decision = cloneDecision(store.get(path)!.decision!);
	decision.title = 'First'; store.edit(path, decision);
	decision.title = 'Second'; store.edit(path, decision);
	decision.title = 'Latest'; store.edit(path, decision);
	release(); await settled(store, path);
	assert.equal(readDecisionNote(vault.contents.get(path)!, codec).title, 'Latest');
	assert.equal(vault.writes, 2);
	assert.equal(store.get(path)!.dirty, false);
});

test('external YAML and Markdown edits refresh shared documents', async () => {
	const { vault, store } = setup(); const path = await store.create();
	let events = 0; const unsubscribe = store.subscribe(() => { events++; });
	vault.contents.set(path, editYaml(vault.contents.get(path)!, data => { data.decision.title = 'From YAML'; }));
	await store.read(path);
	assert.equal(store.get(path)!.decision!.title, 'From YAML');
	await settled(store, path);
	assert(vault.contents.get(path)!.includes('# From YAML'));
	vault.contents.set(path, vault.contents.get(path)!.replace('# From YAML', '# From body'));
	await store.read(path);
	assert.equal(store.get(path)!.decision!.title, 'From body');
	await settled(store, path);
	assert.equal(parse(vault.contents.get(path)!.match(/^---\n([\s\S]*?)\n---/)![1]).decision.title, 'From body');
	assert(events >= 2); unsubscribe();
});

test('an external edit racing a UI save is preserved and the local draft remains visible', async () => {
	const { vault, store } = setup(); const path = await store.create();
	const original = vault.contents.get(path)!;
	vault.beforeProcess = async () => { vault.contents.set(path, original + '\nExternal notes\n'); };
	const draft = cloneDecision(store.get(path)!.decision!); draft.title = 'Local draft'; store.edit(path, draft);
	await settled(store, path);
	assert(vault.contents.get(path)!.endsWith('External notes\n'));
	assert.equal(store.get(path)!.decision!.title, 'Local draft');
	assert.match(store.get(path)!.error, /changed while/);
	assert.equal(store.get(path)!.dirty, true);
	await store.read(path); assert.equal(store.get(path)!.decision!.title, 'Local draft');
	await store.read(path, true); assert.equal(store.get(path)!.decision!.title, 'Untitled decision');
	assert.equal(store.get(path)!.error, '');
});

test('malformed external edits are shown without overwriting the note', async () => {
	const { vault, store } = setup(); const path = await store.create();
	const corrupt = vault.contents.get(path)!.replace('mode: matrix', 'mode: bad');
	vault.contents.set(path, corrupt); await store.read(path);
	assert.match(store.get(path)!.error, /Mode/);
	assert.equal(vault.contents.get(path), corrupt);
	assert.equal(vault.writes, 0);
});

test('renames migrate shared document paths and deletion removes the hub entry', async () => {
	const { vault, store } = setup(); const oldPath = await store.create();
	const file = vault.files.get(oldPath) as TFile;
	const path = 'decisions/Renamed.md';
	vault.files.delete(oldPath); file.path = path; vault.files.set(path, file);
	vault.contents.set(path, vault.contents.get(oldPath)!); vault.contents.delete(oldPath);
	store.handleRename(file as any, oldPath); await tick();
	assert(!store.get(oldPath)); assert.equal(store.get(path)!.path, path);
	const draft = cloneDecision(store.get(path)!.decision!); draft.title = 'After rename'; store.edit(path, draft);
	await settled(store, path);
	assert.equal(readDecisionNote(vault.contents.get(path)!, codec).title, 'After rename');
	vault.files.delete(path); vault.contents.delete(path); store.handleDelete(path);
	assert.equal(store.list().length, 0);
});

test('imports option heading and criterion column name edits', () => {
	const decision = fixture();
	const source = writeDecisionNote('', decision, codec)
		.replace(`### Option A <!-- dm:${decision.options[0].id} -->`, `### Better name <!-- dm:${decision.options[0].id} -->`)
		.replace(`| Option | Value <!-- dm:${decision.criteria[0].id} -->`, `| Option | Cost <!-- dm:${decision.criteria[0].id} -->`);
	const parsed = readDecisionNote(source, codec);
	assert.equal(parsed.options[0].name, 'Better name');
	assert.equal(parsed.criteria[0].name, 'Cost');
});

test('does not silently choose between conflicting names in the editable body', () => {
	const decision = fixture();
	const source = writeDecisionNote('', decision, codec)
		.replace(`### Option A <!-- dm:${decision.options[0].id} -->`, `### Conflicting <!-- dm:${decision.options[0].id} -->`)
		.replace(`| Option A <!-- dm:${decision.options[0].id} -->`, `| Different <!-- dm:${decision.options[0].id} -->`);
	assert.throws(() => readDecisionNote(source, codec), /conflicting names/);
});

test('local installer deploys artifacts, preserves plugin data and other enabled plugins, and backs up replacements', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'decision-installer-'));
	try {
		const source = join(directory, 'package');
		const vault = join(directory, 'vault');
		const config = join(vault, '.obsidian');
		const target = join(config, 'plugins/decision-matrix');
		await mkdir(join(source, 'scripts'), { recursive: true });
		await mkdir(target, { recursive: true });
		await copyFile(resolve('scripts/install.mjs'), join(source, 'scripts/install.mjs'));
		await writeFile(join(source, 'main.js'), 'new bundle');
		await writeFile(join(source, 'styles.css'), 'new styles');
		await writeFile(join(source, 'manifest.json'), JSON.stringify({ id: 'decision-matrix', name: 'Decision Matrix' }));
		await writeFile(join(target, 'main.js'), 'old bundle');
		await writeFile(join(target, 'data.json'), '{"storageFolder":"private"}');
		await writeFile(join(config, 'community-plugins.json'), '["another-plugin"]');
		const install = () => spawnSync(process.execPath, [join(source, 'scripts/install.mjs'), '--vault', vault], { encoding: 'utf8' });
		const first = install(); assert.equal(first.status, 0, first.stderr);
		assert.equal(await readFile(join(target, 'main.js'), 'utf8'), 'new bundle');
		assert.equal(await readFile(join(target, 'data.json'), 'utf8'), '{"storageFolder":"private"}');
		assert.deepEqual(JSON.parse(await readFile(join(config, 'community-plugins.json'), 'utf8')), ['another-plugin', 'decision-matrix']);
		const backups = join(config, 'plugins/.decision-matrix-backups');
		const backup = (await readdir(backups))[0];
		assert.equal(await readFile(join(backups, backup, 'main.js'), 'utf8'), 'old bundle');
		assert.deepEqual(JSON.parse(await readFile(join(backups, backup, 'community-plugins.json'), 'utf8')), ['another-plugin']);
		const second = install(); assert.equal(second.status, 0, second.stderr);
		assert.deepEqual(JSON.parse(await readFile(join(config, 'community-plugins.json'), 'utf8')), ['another-plugin', 'decision-matrix']);
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test('generates unique valid IDs on mobile WebViews without randomUUID', async () => {
	const { newId } = await import('../src/decision');
	const descriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
	Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
	try {
		const ids = new Set(Array.from({ length: 100 }, () => newId()));
		assert.equal(ids.size, 100);
		for (const id of ids) assert.match(id, /^[a-f0-9]{32}$/);
		assert.doesNotThrow(() => validateDecision(createDecision()));
	} finally {
		if (descriptor) Object.defineProperty(globalThis.crypto, 'randomUUID', descriptor);
		else delete (globalThis.crypto as unknown as Record<string, unknown>).randomUUID;
	}
});

test('validates saved settings without trusting unknown JSON shapes', () => {
	for (const value of [undefined, null, [], 'bad', 42, { storageFolder: 5 }, { storageFolder: '../outside' }]) {
		assert.deepEqual(readSettings(value), { storageFolder: 'decisions' });
	}
	assert.deepEqual(readSettings({ storageFolder: '/personal//decisions/' }), { storageFolder: 'personal/decisions' });
});

test('refresh reads only Markdown decisions within the configured folder subtree', async () => {
	const { vault, store } = setup();
	await vault.createFolder('decisions');
	await vault.createFolder('decisions/nested');
	await vault.createFolder('private');
	await vault.create('private/unrelated.md', writeDecisionNote('', fixture(), codec));
	await vault.create('decisions/a.md', writeDecisionNote('', fixture(), codec));
	await vault.create('decisions/nested/b.md', writeDecisionNote('', fixture(), codec));
	await vault.create('decisions/image.png', 'not Markdown');
	await store.refresh();
	assert.deepEqual(vault.reads.sort(), ['decisions/a.md', 'decisions/nested/b.md']);
	assert.equal(store.list().length, 2);
});
