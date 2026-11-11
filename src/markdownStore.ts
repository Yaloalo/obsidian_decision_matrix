import { normalizePath, parseYaml, stringifyYaml, TFile, TFolder, type App } from 'obsidian';
import { cloneDecision, createDecision, validateDecision } from './decision';
import { decisionNoteNeedsSync, isDecisionNote, readDecisionNote, writeDecisionNote } from './markdown';
import type { Decision } from './types';

const codec = { parse: parseYaml, stringify: stringifyYaml };

export interface DecisionDocument {
	path: string;
	decision: Decision | null;
	content: string;
	error: string;
	saving: boolean;
	dirty: boolean;
}

export interface StoreEvent { kind: 'change' | 'rename' | 'delete'; path: string; oldPath?: string }

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function decisionFolder(value: string): string {
	const trimmed = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	if (trimmed.split('/').some(part => part === '..' || part === '.')) throw new Error('Use a folder path inside your vault without . or .. segments.');
	return normalizePath(trimmed || 'decisions');
}

/** Walk only the requested subtree; the decision hub does not scan the whole vault. */
export function markdownFilesIn(folder: TFolder): TFile[] {
	const files: TFile[] = [];
	const pending = [folder];
	while (pending.length) {
		const current = pending.pop()!;
		for (const child of current.children) {
			if (child instanceof TFolder) pending.push(child);
			else if (child instanceof TFile && child.extension === 'md') files.push(child);
		}
	}
	return files;
}

export class MarkdownDecisionStore {
	private documents = new Map<string, DecisionDocument>();
	private listeners = new Set<(event: StoreEvent) => void>();
	private pending = new Map<string, Decision>();
	private reads = new Map<string, number>();
	private disposed = false;
	folder: string;

	constructor(private app: App, folder: string) { this.folder = decisionFolder(folder); }

	subscribe(callback: (event: StoreEvent) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private emit(event: StoreEvent): void {
		if (!this.disposed) this.listeners.forEach(callback => callback(event));
	}

	get(path: string): DecisionDocument | undefined { return this.documents.get(path); }

	list(): DecisionDocument[] {
		return [...this.documents.values()].filter(doc => doc.path.startsWith(`${this.folder}/`))
			.sort((a, b) => (a.decision?.title ?? a.path).localeCompare(b.decision?.title ?? b.path));
	}

	async refresh(): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(this.folder);
		if (folder instanceof TFolder) await Promise.all(markdownFilesIn(folder).map(file => this.read(file.path)));
		this.emit({ kind: 'change', path: '' });
	}

	async read(path: string, discardDraft = false): Promise<void> {
		const current = this.documents.get(path);
		if (current?.saving || (current?.dirty && !discardDraft)) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension !== 'md') return;
		const generation = (this.reads.get(path) ?? 0) + 1;
		this.reads.set(path, generation);
		try {
			const content = await this.app.vault.read(file);
			if (this.disposed || this.reads.get(path) !== generation || file.path !== path
				|| this.documents.get(path)?.saving || (this.documents.get(path)?.dirty && !discardDraft)) return;
			if (!isDecisionNote(content)) {
				this.documents.delete(path);
			} else {
				let decision: Decision | null = null;
				let error = '';
				try { decision = readDecisionNote(content, codec); } catch (failure) { error = message(failure); }
				this.documents.set(path, { path, decision, content, error, saving: false, dirty: false });
			}
			this.emit({ kind: 'change', path });
			const document = this.documents.get(path);
			if (document?.decision && !document.error && decisionNoteNeedsSync(content, document.decision, codec)) {
				this.edit(path, document.decision);
			}
		} catch (failure) {
			if (current) { current.error = message(failure); this.emit({ kind: 'change', path }); }
			else throw failure;
		}
	}

	/** Coalesce rapid slider edits and serialize writes against the last known note revision. */
	edit(path: string, value: Decision): void {
		const doc = this.documents.get(path);
		if (!doc?.decision || doc.error || this.disposed) return;
		try { doc.decision = validateDecision(value); } catch (error) {
			doc.error = message(error);
			this.emit({ kind: 'change', path });
			return;
		}
		doc.dirty = true;
		this.pending.set(path, cloneDecision(doc.decision));
		if (!doc.saving) void this.save(doc);
	}

	private async save(doc: DecisionDocument): Promise<void> {
		doc.saving = true;
		this.emit({ kind: 'change', path: doc.path });
		try {
			while (this.pending.has(doc.path)) {
				const path = doc.path;
				const decision = this.pending.get(path)!;
				this.pending.delete(path);
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) throw new Error('The decision note was deleted. Copy any unsaved changes before returning to the hub.');
				const expected = doc.content;
				// The decision YAML, body and checksum must change in one transaction.
				// Splitting this into processFrontMatter + a separate body write would
				// expose a partial decision to vault watchers and other editors.
				const saved = await this.app.vault.process(file, content => {
					if (content !== expected) throw new Error('The Markdown note changed while you were editing. Your draft is kept here. Copy any changes you need, then reload the note.');
					return writeDecisionNote(content, decision, codec);
				});
				doc.content = saved;
			}
			doc.dirty = false;
		} catch (error) {
			doc.error = message(error);
			this.pending.delete(doc.path);
		} finally {
			doc.saving = false;
			this.emit({ kind: 'change', path: doc.path });
			// Catch an external modification arriving during our last awaited write.
			if (!doc.error && !this.disposed) void this.read(doc.path).catch(() => {});
		}
	}

	async create(title = 'Untitled decision'): Promise<string> {
		const folder = decisionFolder(this.folder);
		let partial = '';
		for (const segment of folder.split('/')) {
			partial = partial ? `${partial}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(partial);
			if (existing && !(existing instanceof TFolder)) throw new Error(`${partial} is a file. Choose another decisions folder.`);
			if (!existing) {
				try { await this.app.vault.createFolder(partial); } catch (error) {
					if (!(this.app.vault.getAbstractFileByPath(partial) instanceof TFolder)) throw error;
				}
			}
		}
		const decision = createDecision(title);
		const filename = title.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 80) || 'Untitled decision';
		let path = `${folder}/${filename}.md`;
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(path)) path = `${folder}/${filename} ${suffix++}.md`;
		const content = writeDecisionNote('', decision, codec);
		await this.app.vault.create(path, content);
		await this.read(path);
		return path;
	}

	handleRename(file: TFile, oldPath: string): void {
		this.reads.set(oldPath, (this.reads.get(oldPath) ?? 0) + 1);
		const doc = this.documents.get(oldPath);
		if (doc) {
			this.documents.delete(oldPath);
			doc.path = file.path;
			this.documents.set(file.path, doc);
			const pending = this.pending.get(oldPath);
			if (pending) { this.pending.delete(oldPath); this.pending.set(file.path, pending); }
		}
		this.emit({ kind: 'rename', path: file.path, oldPath });
		void this.read(file.path).catch(() => {});
	}

	handleDelete(path: string): void {
		this.reads.set(path, (this.reads.get(path) ?? 0) + 1);
		this.documents.delete(path);
		this.pending.delete(path);
		this.emit({ kind: 'delete', path });
	}

	dispose(): void { this.disposed = true; this.listeners.clear(); }
}
