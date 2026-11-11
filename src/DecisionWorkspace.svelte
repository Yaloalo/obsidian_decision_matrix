<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import DecisionView from './DecisionView.svelte';
	import type { Decision } from './types';
	import type { DecisionDocument, MarkdownDecisionStore } from './markdownStore';

	let { store, initialPath = null, embedded = false, onOpenNote, onPathChange }: {
		store: MarkdownDecisionStore;
		initialPath?: string | null;
		embedded?: boolean;
		onOpenNote: (path: string) => void;
		onPathChange?: (path: string | null) => void;
	} = $props();

	let path = $state<string | null>(untrack(() => initialPath));
	let document = $state<DecisionDocument | null>(null);
	let decisions = $state<DecisionDocument[]>([]);
	let loading = $state(true);
	let error = $state('');
	let title = $state('');
	let creating = $state(false);
	let folder = $state(untrack(() => store.folder));
	let request = 0;

	function update() {
		folder = store.folder;
		const current = path ? store.get(path) : undefined;
		document = current ? { ...current } : null;
		decisions = store.list().map(doc => ({ ...doc }));
	}

	async function select(next: string | null) {
		const token = ++request;
		path = next;
		error = '';
		loading = true;
		onPathChange?.(next);
		update();
		try { if (next) await store.read(next); else await store.refresh(); }
		catch (failure) { if (token === request) error = String(failure); }
		finally { if (token === request) { loading = false; update(); } }
	}

	onMount(() => {
		const unsubscribe = store.subscribe(event => {
			if (event.kind === 'rename' && event.oldPath === path) {
				path = event.path;
				onPathChange?.(path);
			}
			update();
		});
		void select(initialPath);
		return () => { request++; unsubscribe(); };
	});

	async function create() {
		creating = true;
		error = '';
		try { await select(await store.create(title.trim() || 'Untitled decision')); title = ''; }
		catch (failure) { error = String(failure); }
		finally { creating = false; }
	}

	async function reload() {
		if (!path) return;
		try { await store.read(path, true); update(); }
		catch (failure) { error = String(failure); }
	}
</script>

<div class="dm-workspace" class:dm-embedded={embedded}>
	{#if path}
		<div class="dm-workspace-toolbar">
			{#if !embedded}<button class="dm-btn" onclick={() => select(null)}>← All decisions</button>{/if}
			<span class="dm-file-path">{path}</span>
			<span class="dm-save-status" role="status">{document?.saving ? 'Saving…' : document?.dirty ? 'Unsaved changes' : document?.decision ? 'Saved to vault' : ''}</span>
			<button class="dm-btn" onclick={() => onOpenNote(path!)}>Open Markdown note</button>
		</div>
	{/if}
	{#if error}<p class="dm-error" role="alert">{error}</p>{/if}
	{#if loading}<p class="dm-empty" role="status">Loading decisions…</p>
	{:else if path}
		{#if document?.error}
			<div class="dm-error" role="alert">
				<p>{document.error}</p>
				<button class="dm-btn" onclick={reload}>Reload note{document.dirty ? ' and discard draft' : ''}</button>
			</div>
		{/if}
		{#if document?.decision}
			{#key path}
				<DecisionView decision={document.decision} disabled={!!document.error}
					onSave={(decision: Decision) => store.edit(path!, decision)} />
			{/key}
		{:else if !document?.error}
			<p class="dm-empty">This decision note is missing or is no longer a decision. Open its Markdown note to check the file.</p>
		{/if}
	{:else}
		<div class="dm-container dm-hub">
			<header><h1>Decisions</h1><p>Compare your options. Keep the reasoning in your vault.</p></header>
			<form class="dm-create-form" onsubmit={event => { event.preventDefault(); void create(); }}>
				<input aria-label="New decision title" placeholder="What are you deciding?" bind:value={title} />
				<button class="dm-btn dm-btn-primary" disabled={creating}>{creating ? 'Creating…' : '+ New decision'}</button>
			</form>
			<p class="dm-folder-label">Saved in {folder}/</p>
			{#if decisions.length === 0}<p class="dm-empty">No decisions yet. Create one to start comparing options.</p>{/if}
			<div class="dm-decision-list">
				{#each decisions as item (item.path)}
					<button class="dm-decision-link" onclick={() => select(item.path)}>
						<strong>{item.decision?.title || item.path.split('/').pop()}</strong>
						<span>{item.error ? 'Needs attention — open to repair' : `${item.decision?.mode === 'matrix' ? 'Weighted matrix' : 'Pros & cons'} · ${item.decision?.options.length ?? 0} options`}</span>
						<small>{item.path}</small>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
