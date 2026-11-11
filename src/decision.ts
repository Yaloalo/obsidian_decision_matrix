import type { Decision, DecisionOption } from './types';

export function newId(): string {
	const crypto = window.crypto;
	if (crypto.randomUUID) return crypto.randomUUID();
	// Older mobile WebViews may expose getRandomValues without randomUUID.
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createDecision(title = 'Untitled decision'): Decision {
	const criterion = { id: newId(), name: 'Value', weight: 5 };
	return {
		id: newId(), title, mode: 'matrix', createdAt: new Date().toISOString(),
		criteria: [criterion],
		options: ['Option A', 'Option B'].map(name => ({
			id: newId(), name, pros: [], cons: [], scores: { [criterion.id]: 5 }
		}))
	};
}

export function cloneDecision(decision: Decision): Decision {
	return JSON.parse(JSON.stringify(decision)) as Decision;
}

export function matrixScore(decision: Decision, option: DecisionOption): number {
	return decision.criteria.reduce((total, criterion) => total + criterion.weight * option.scores[criterion.id], 0);
}

export function netScore(option: DecisionOption): number {
	return option.pros.reduce((total, item) => total + item.weight, 0)
		- option.cons.reduce((total, item) => total + item.weight, 0);
}

export function rankOptions(decision: Decision) {
	const ranked = decision.options.map(option => ({
		option, score: decision.mode === 'matrix' ? matrixScore(decision, option) : netScore(option)
	})).sort((a, b) => b.score - a.score);
	return ranked.map(item => ({ ...item, rank: ranked.findIndex(other => other.score === item.score) + 1 }));
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a decision object.');
	return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
	if (!Array.isArray(value)) throw new Error('Criteria, options, pros and cons must be lists.');
	return value;
}

function text(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string') throw new Error(`${label} must be text.`);
}

function rating(value: unknown, max: number): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
		throw new Error(`Ratings must be whole numbers from 1 to ${max}.`);
	}
}

/** Validate before saving or mounting: malformed notes must never be silently rewritten. */
export function validateDecision(value: unknown): Decision {
	const data = record(value);
	text(data.id, 'Decision ID');
	text(data.title, 'Title');
	text(data.createdAt, 'Creation date');
	if (!data.id || !Number.isFinite(Date.parse(data.createdAt))) throw new Error('Invalid decision ID or creation date.');
	if (data.mode !== 'matrix' && data.mode !== 'pros-cons') throw new Error('Mode must be matrix or pros-cons.');
	const criteria = list(data.criteria);
	const options = list(data.options);
	const criterionIds: string[] = [];
	const ids = new Set<string>();
	function identifier(value: unknown) {
		text(value, 'ID');
		if (!/^[\w-]+$/.test(value) || ids.has(value)) throw new Error('Each criterion, option, pro and con needs a unique ID (letters, numbers, hyphens or underscores).');
		ids.add(value);
	}
	for (const value of criteria) {
		const criterion = record(value);
		identifier(criterion.id);
		text(criterion.id, 'Criterion ID');
		criterionIds.push(criterion.id);
		text(criterion.name, 'Criterion name');
		rating(criterion.weight, 10);
	}
	for (const value of options) {
		const option = record(value);
		identifier(option.id);
		text(option.name, 'Option name');
		const scores = record(option.scores);
		for (const id of criterionIds) rating(scores[id], 10);
		for (const kind of ['pros', 'cons']) {
			for (const value of list(option[kind])) {
				const item = record(value);
				identifier(item.id);
				text(item.text, 'Pro/con text');
				rating(item.weight, 5);
			}
		}
	}
	return cloneDecision(value as Decision);
}
