<script lang="ts">
	import { untrack } from 'svelte';
	import { cloneDecision, matrixScore, netScore, newId, rankOptions } from './decision';
	import type { Decision, DecisionOption } from './types';

	let { decision, onSave, disabled = false }: {
		decision: Decision;
		onSave: (decision: Decision) => void;
		disabled?: boolean;
	} = $props();

	let currentDecision = $state(untrack(() => cloneDecision(decision)));
	$effect(() => { currentDecision = cloneDecision(decision); });
	let ranking = $derived(rankOptions(currentDecision));
	let barMax = $derived(Math.max(1, ...ranking.map(item => Math.abs(item.score))));
	let hasEvidence = $derived(currentDecision.mode === 'matrix' ? currentDecision.criteria.length > 0
		: currentDecision.options.some(option => option.pros.length + option.cons.length > 0));
	let tied = $derived(ranking.filter(item => item.rank === 1).length > 1);

	function save() { if (!disabled) onSave(cloneDecision(currentDecision)); }
	// Svelte updates bind:value after the input listener.
	function changed() { queueMicrotask(save); }
	function addOption() {
		currentDecision.options.push({ id: newId(), name: `Option ${currentDecision.options.length + 1}`, pros: [], cons: [],
			scores: Object.fromEntries(currentDecision.criteria.map(criterion => [criterion.id, 5])) });
		save();
	}
	function addCriterion() {
		const criterion = { id: newId(), name: 'New criterion', weight: 5 };
		currentDecision.criteria.push(criterion);
		for (const option of currentDecision.options) option.scores[criterion.id] = 5;
		save();
	}
	function removeCriterion(id: string) {
		currentDecision.criteria = currentDecision.criteria.filter(criterion => criterion.id !== id);
		for (const option of currentDecision.options) delete option.scores[id];
		save();
	}
	function removeOption(id: string) { currentDecision.options = currentDecision.options.filter(option => option.id !== id); save(); }
	function addReason(option: DecisionOption, kind: 'pros' | 'cons') {
		option[kind].push({ id: newId(), text: kind === 'pros' ? 'New advantage' : 'New disadvantage', weight: 3 });
		save();
	}
</script>

<fieldset class="dm-editor" {disabled}>
	<legend class="dm-sr-only">Decision editor</legend>
	<div class="dm-container">
		<header class="dm-header">
			<div class="dm-title-row">
				<input aria-label="Decision title" class="dm-title-input" bind:value={currentDecision.title}
					placeholder="What are you deciding?" oninput={changed} />
				<div class="dm-mode-pills" role="group" aria-label="Comparison mode">
					<button class="dm-pill-btn" class:active={currentDecision.mode === 'matrix'} aria-pressed={currentDecision.mode === 'matrix'}
						onclick={() => { currentDecision.mode = 'matrix'; save(); }}>Weighted matrix</button>
					<button class="dm-pill-btn" class:active={currentDecision.mode === 'pros-cons'} aria-pressed={currentDecision.mode === 'pros-cons'}
						onclick={() => { currentDecision.mode = 'pros-cons'; save(); }}>Pros and cons</button>
				</div>
			</div>
		</header>

		<section class="dm-section" aria-label="Ranking">
			<h3 class="dm-section-title">Comparison</h3>
			{#if ranking.length === 0}<p class="dm-empty">Add options to compare them.</p>
			{:else if !hasEvidence}<p class="dm-empty">{currentDecision.mode === 'matrix' ? 'Add criteria to calculate weighted scores.' : 'Add pros and cons to compare their impact.'}</p>
			{:else}
				<ol class="dm-ranking">
					{#each ranking as item (item.option.id)}
						<li class:dm-winner={item.rank === 1}>
							<div class="dm-ranking-label"><span>#{item.rank} {item.option.name || 'Unnamed option'}</span>
								<strong>{item.score} pts{item.rank === 1 ? tied ? ' · Tied for first' : ' · Winner' : ''}</strong></div>
							<progress class:dm-negative={item.score < 0} max={barMax} value={Math.abs(item.score)} aria-label={`${item.option.name}: ${item.score} points`}></progress>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		{#if currentDecision.mode === 'matrix'}
			<section class="dm-section">
				<div class="dm-section-top"><h3 class="dm-section-title">Evaluation criteria & importance</h3>
					<button class="dm-btn" onclick={addCriterion}>+ Add criterion</button></div>
				<div class="dm-criteria-list">
					{#each currentDecision.criteria as criterion (criterion.id)}
						<div class="dm-criterion-card">
							<input class="dm-crit-name" aria-label="Criterion name" bind:value={criterion.name} oninput={changed} placeholder="Criterion name" />
							<label class="dm-crit-weight-wrap"><span class="dm-crit-label">Weight: {criterion.weight}x</span>
								<input class="dm-slider" type="range" min="1" max="10" step="1" aria-label={`${criterion.name} importance`}
									bind:value={criterion.weight} oninput={changed} /></label>
							<button class="dm-delete-btn" aria-label={`Delete criterion ${criterion.name}`} onclick={() => removeCriterion(criterion.id)}>✕</button>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section class="dm-section">
			<div class="dm-section-top"><h3 class="dm-section-title">{currentDecision.mode === 'matrix' ? 'Score options' : 'Pros & cons breakdown'}</h3>
				<button class="dm-btn dm-btn-primary" onclick={addOption}>+ Add option</button></div>
			<div class="dm-options-grid">
				{#each currentDecision.options as option (option.id)}
					{@const score = currentDecision.mode === 'matrix' ? matrixScore(currentDecision, option) : netScore(option)}
					<div class="dm-option-card" class:dm-winner={hasEvidence && ranking.find(item => item.option.id === option.id)?.rank === 1}>
						<div class="dm-option-header">
							<input class="dm-option-title" aria-label="Option name" bind:value={option.name} oninput={changed} />
							<button class="dm-delete-btn" aria-label={`Delete option ${option.name}`} onclick={() => removeOption(option.id)}>✕</button>
						</div>
						<div class="dm-score-badge" class:dm-score-positive={score > 0} class:dm-score-negative={score < 0}>
							<span class="dm-score-label">{currentDecision.mode === 'matrix' ? 'Weighted score' : 'Net score'}</span>
							<strong class="dm-score-val">{score} pts</strong>
						</div>
						{#if currentDecision.mode === 'matrix'}
							<div class="dm-criteria-scores">
								{#each currentDecision.criteria as criterion (criterion.id)}
									<label class="dm-score-row"><span class="dm-score-crit-name">{criterion.name}</span>
										<span class="dm-score-slider-group"><input class="dm-slider" type="range" min="1" max="10" step="1"
											aria-label={`${option.name}: ${criterion.name} score`} bind:value={option.scores[criterion.id]} oninput={changed} />
											<span class="dm-score-num">{option.scores[criterion.id]}/10</span></span></label>
								{/each}
							</div>
						{:else}
							{#each ['pros', 'cons'] as kind}
								{@const key = kind as 'pros' | 'cons'}
								<div class="dm-procon-block">
									<div class="dm-procon-header"><span class:dm-pro-title={key === 'pros'} class:dm-con-title={key === 'cons'}>{key === 'pros' ? 'Pros' : 'Cons'}</span>
										<button class="dm-btn-xs" onclick={() => addReason(option, key)}>+ {key === 'pros' ? 'Pro' : 'Con'}</button></div>
									{#each option[key] as reason (reason.id)}
										<div class="dm-reason">
											<div class="dm-item-row"><input class="dm-item-input" aria-label={`${option.name} ${key === 'pros' ? 'advantage' : 'disadvantage'}`}
												bind:value={reason.text} oninput={changed} />
												<button class="dm-delete-btn" aria-label={`Delete ${reason.text}`} onclick={() => { option[key] = option[key].filter(item => item.id !== reason.id); save(); }}>✕</button></div>
											<label class="dm-impact"><span>Impact: {reason.weight}/5</span><input class="dm-slider" type="range" min="1" max="5" step="1"
												aria-label={`Impact of ${reason.text}`} bind:value={reason.weight} oninput={changed} /></label>
										</div>
									{:else}<p class="dm-empty">No {key} yet.</p>{/each}
								</div>
							{/each}
						{/if}
					</div>
				{/each}
			</div>
		</section>
	</div>
</fieldset>
