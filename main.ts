import {
	ItemView, MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder,
	normalizePath, type App, type ViewStateResult, type WorkspaceLeaf
} from 'obsidian';
import { mount, unmount } from 'svelte';
import DecisionWorkspace from './src/DecisionWorkspace.svelte';
import { decisionFolder, markdownFilesIn, MarkdownDecisionStore } from './src/markdownStore';
import { readSettings } from './src/settings';
import { DEFAULT_SETTINGS, type DecisionPluginSettings } from './src/types';

export const DECISION_VIEW_TYPE = 'decision-matrix-view';

export class DecisionMatrixItemView extends ItemView {
	private component: ReturnType<typeof mount> | null = null;
	private path: string | null = null;
	private opened = false;

	constructor(leaf: WorkspaceLeaf, private plugin: DecisionMatrixPlugin) { super(leaf); }
	getViewType(): string { return DECISION_VIEW_TYPE; }
	getDisplayText(): string { return 'Decision Matrix'; }
	getIcon(): string { return 'scale'; }
	getState(): Record<string, unknown> { return { path: this.path }; }

	async setState(state: { path?: unknown }, result: ViewStateResult): Promise<void> {
		const next = typeof state?.path === 'string' ? state.path : null;
		if (this.path !== next) {
			this.path = next;
			if (this.opened) await this.render();
		}
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> { this.opened = true; await this.render(); }
	async onClose(): Promise<void> {
		this.opened = false;
		if (this.component) await unmount(this.component);
		this.component = null;
	}

	private async render(): Promise<void> {
		if (this.component) await unmount(this.component);
		this.contentEl.empty();
		this.component = mount(DecisionWorkspace, {
			target: this.contentEl,
			props: {
				store: this.plugin.store, initialPath: this.path,
				onOpenNote: (path: string) => { void this.plugin.openNote(path); },
				onPathChange: (path: string | null) => {
					this.path = path;
					this.app.workspace.requestSaveLayout();
				}
			}
		});
	}
}

class DecisionEmbed extends MarkdownRenderChild {
	private component: ReturnType<typeof mount> | null = null;
	constructor(containerEl: HTMLElement, private plugin: DecisionMatrixPlugin, private path: string) { super(containerEl); }
	onload(): void {
		this.plugin.embeds.add(this);
		this.component = mount(DecisionWorkspace, {
			target: this.containerEl,
			props: {
				store: this.plugin.store, initialPath: this.path, embedded: true,
				onOpenNote: (path: string) => { void this.plugin.openNote(path); }
			}
		});
	}
	onunload(): void {
		this.plugin.embeds.delete(this);
		if (this.component) void unmount(this.component).catch(error => console.error('Decision Matrix: could not unmount embed', error));
		this.component = null;
		this.containerEl.empty();
	}
}

export default class DecisionMatrixPlugin extends Plugin {
	settings: DecisionPluginSettings = { ...DEFAULT_SETTINGS };
	store!: MarkdownDecisionStore;
	readonly embeds = new Set<DecisionEmbed>();

	async onload(): Promise<void> {
		const saved: unknown = await this.loadData();
		this.settings = readSettings(saved);
		this.store = new MarkdownDecisionStore(this.app, this.settings.storageFolder);
		this.registerView(DECISION_VIEW_TYPE, leaf => new DecisionMatrixItemView(leaf, this));
		this.addRibbonIcon('scale', 'Open active decision or decision hub', () => { void this.activateView(); });
		this.addCommand({ id: 'open-active', name: 'Open active decision or decision hub', callback: () => { void this.activateView(); } });
		this.addCommand({ id: 'open-decision-hub', name: 'Open decision hub', callback: () => { void this.activateView(null); } });
		this.addCommand({ id: 'create-decision', name: 'Create new decision', callback: () => { void this.createDecision(); } });
		this.addSettingTab(new DecisionMatrixSettingTab(this.app, this));

		const read = (file: TFile) => { void this.store.read(file.path).catch(error => new Notice(`Decision Matrix: ${error}`)); };
		this.registerEvent(this.app.vault.on('modify', file => { if (file instanceof TFile && file.extension === 'md') read(file); }));
		this.registerEvent(this.app.vault.on('create', file => {
			if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(`${this.store.folder}/`)) read(file);
		}));
		this.registerEvent(this.app.vault.on('delete', file => {
			if (file instanceof TFile) this.store.handleDelete(file.path);
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile) this.store.handleRename(file, oldPath);
			else if (file instanceof TFolder) for (const child of markdownFilesIn(file)) {
				this.store.handleRename(child, oldPath + child.path.slice(file.path.length));
			}
		}));
		this.registerMarkdownCodeBlockProcessor('decision', (source, element, context) => {
			const reference = source.trim().replace(/^\[\[([\s\S]*)\]\]$/, '$1');
			if (!reference || /[\r\n]/.test(reference)) {
				element.createEl('p', { text: 'Use one decision note path inside this block, for example decisions/Car choice.md.', cls: 'dm-error' });
				return;
			}
			const file = this.resolveReference(reference, context.sourcePath);
			if (!file) {
				element.createEl('p', { text: `Decision note not found: ${reference}`, cls: 'dm-error' });
				return;
			}
			context.addChild(new DecisionEmbed(element, this, file.path));
		});
	}

	private resolveReference(reference: string, sourcePath: string): TFile | null {
		const path = normalizePath(reference);
		const direct = this.app.vault.getAbstractFileByPath(path.endsWith('.md') ? path : `${path}.md`);
		if (direct instanceof TFile) return direct;
		return this.app.metadataCache.getFirstLinkpathDest(reference, sourcePath);
	}

	async activateView(path?: string | null): Promise<void> {
		try {
			if (path === undefined) {
				const active = this.app.workspace.getActiveFile();
				if (active?.extension === 'md') {
					await this.store.read(active.path);
					path = this.store.get(active.path) ? active.path : null;
				} else path = null;
			}
			const workspace = this.app.workspace;
			const leaf = workspace.getLeavesOfType(DECISION_VIEW_TYPE)[0] ?? workspace.getLeaf('tab');
			await leaf.setViewState({ type: DECISION_VIEW_TYPE, active: true, state: { path } });
			await workspace.revealLeaf(leaf);
		} catch (error) { new Notice(`Could not open Decision Matrix: ${error}`); }
	}

	async createDecision(): Promise<void> {
		try { await this.activateView(await this.store.create()); }
		catch (error) { new Notice(`Could not create decision: ${error}`); }
	}

	async openNote(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) await this.app.workspace.getLeaf('tab').openFile(file);
		else new Notice('The decision note no longer exists.');
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.store.folder = this.settings.storageFolder;
		await this.store.refresh();
	}

	onunload(): void {
		for (const embed of this.embeds) embed.unload();
		this.embeds.clear();
		this.store.dispose();
	}
}

class DecisionMatrixSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: DecisionMatrixPlugin) { super(app, plugin); }
	// 1.13+ indexes this row for settings search; earlier versions use display().
	getSettingDefinitions() {
		return [{
			name: 'Decisions folder',
			desc: 'Vault folder for new decisions and the hub. Existing notes stay at their current paths.',
			render: (setting: Setting) => this.renderFolderSetting(setting)
		}];
	}
	display(): void {
		this.containerEl.empty();
		this.renderFolderSetting(new Setting(this.containerEl));
	}
	private renderFolderSetting(setting: Setting): void {
		setting
			.setName('Decisions folder')
			.setDesc('Vault folder for new decisions and the hub. Existing notes stay at their current paths.')
			.addText(text => text.setPlaceholder('decisions').setValue(this.plugin.settings.storageFolder).onChange(value => {
				try { this.plugin.settings.storageFolder = decisionFolder(value); }
				catch (error) { new Notice(String(error)); return; }
				void this.plugin.saveSettings().catch(error => new Notice(`Could not save settings: ${error}`));
			}));
	}
}
