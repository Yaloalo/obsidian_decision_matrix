import { cloneDecision, newId, rankOptions, validateDecision } from './decision';
import type { Decision, ProConItem } from './types';

export interface YamlCodec {
	parse(source: string): unknown;
	stringify(value: unknown): string;
}

const START = '<!-- decision-matrix:start -->';
const END = '<!-- decision-matrix:end -->';
const marker = /<!-- dm:([\w-]+) -->/;

// Entity encoding keeps pipes, line breaks, Markdown syntax and ID-like user text literal.
function escape(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/\|/g, '&#124;').replace(/\r?\n/g, '&#10;')
		.replace(/[*_`\[\]\\]/g, char => `&#${char.charCodeAt(0)};`);
}

function unescape(value: string): string {
	return value.replace(/&(?:amp|lt|gt|#\d+);/g, entity => {
		if (entity === '&amp;') return '&';
		if (entity === '&lt;') return '<';
		if (entity === '&gt;') return '>';
		const code = Number(entity.slice(2, -1));
		return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
	});
}

function named(name: string, id: string): string { return `${escape(name)} <!-- dm:${id} -->`; }
function readName(source: string) {
	const match = source.match(marker);
	return { id: match?.[1] ?? newId(), name: unescape(source.replace(marker, '').trim()) };
}

export function renderDecisionBody(decision: Decision): string {
	const lines = [START, `# ${escape(decision.title)}`, '',
		`Mode: ${decision.mode === 'matrix' ? 'Weighted Matrix' : 'Pros & Cons'}`, '',
		'## Criteria', '', '| Criterion | Weight |', '| --- | ---: |',
		...decision.criteria.map(c => `| ${named(c.name, c.id)} | ${c.weight} |`), '',
		'## Options', '',
		`| Option | ${decision.criteria.map(c => named(c.name, c.id)).join(' | ')}${decision.criteria.length ? ' |' : ''}`,
		`| --- |${decision.criteria.map(() => ' ---: |').join('')}`,
		...decision.options.map(o => `| ${named(o.name, o.id)} |${decision.criteria.map(c => ` ${o.scores[c.id]} |`).join('')}`),
		'', '## Pros & Cons', ''];
	for (const option of decision.options) {
		lines.push(`### ${named(option.name, option.id)}`, '');
		for (const kind of ['pros', 'cons'] as const) {
			lines.push(kind === 'pros' ? '**Pros**' : '**Cons**');
			for (const item of option[kind]) lines.push(`- ${escape(item.text)} (impact: ${item.weight}) <!-- dm:${item.id} -->`);
			lines.push('');
		}
	}
	lines.push('## Ranking', '', '| Rank | Option | Score |', '| ---: | --- | ---: |',
		...rankOptions(decision).map(item => `| ${item.rank} | ${escape(item.option.name)} | ${item.score} |`), '', END);
	return lines.join('\n');
}

function hash(source: string): string {
	let result = 2166136261;
	for (let i = 0; i < source.length; i++) result = Math.imul(result ^ source.charCodeAt(i), 16777619);
	return (result >>> 0).toString(16);
}

function splitNote(source: string, codec: YamlCodec) {
	const normalized = source.replace(/\r\n/g, '\n');
	const match = normalized.match(/^\uFEFF?---\n([\s\S]*?)\n---(?:\n|$)/);
	const parsed = match ? codec.parse(match[1]) : {};
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Frontmatter must be a YAML object.');
	return { metadata: parsed as Record<string, unknown>, body: normalized.slice(match?.[0].length ?? 0) };
}

function region(body: string) {
	const start = body.indexOf(START);
	const end = body.indexOf(END);
	if (start < 0 || end < start || body.indexOf(START, start + 1) >= 0 || body.indexOf(END, end + 1) >= 0) {
		throw new Error('The decision section markers are missing or duplicated. Restore them before editing in the plugin.');
	}
	return { start, end: end + END.length, content: body.slice(start, end + END.length) };
}

function section(body: string, heading: string, next: string): string {
	const start = body.indexOf(`\n${heading}\n`);
	const end = body.indexOf(`\n${next}\n`);
	if (start < 0 || end <= start) throw new Error(`Keep the generated ${heading} and ${next} headings.`);
	return body.slice(start + heading.length + 2, end);
}

function table(source: string): string[][] {
	const rows = source.split('\n').filter(line => line.trim().startsWith('|'))
		.map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()));
	if (rows.length < 2 || !rows[1].every(cell => /^:?-+:?$/.test(cell))) throw new Error('Keep the decision table headers and separator rows.');
	return rows;
}

function parseBody(body: string, original: Decision): Decision {
	const decision = cloneDecision(original);
	const title = body.match(/^# (.*)$/m);
	const mode = body.match(/^Mode: (Weighted Matrix|Pros & Cons)$/m);
	if (!title || !mode) throw new Error('Keep the decision title and Mode line.');
	decision.title = unescape(title[1]);
	decision.mode = mode[1] === 'Weighted Matrix' ? 'matrix' : 'pros-cons';
	decision.criteria = table(section(body, '## Criteria', '## Options')).slice(2).map(row => {
		if (row.length !== 2) throw new Error('Each criterion needs a name and weight.');
		return { ...readName(row[0]), weight: Number(row[1]) };
	});
	const rows = table(section(body, '## Options', '## Pros & Cons'));
	const columnIds = rows[0].slice(1).map(cell => cell.match(marker)?.[1]);
	if (columnIds.some(id => !id) || new Set(columnIds).size !== columnIds.length) throw new Error('Keep criterion IDs in the Options table header.');
	for (const cell of rows[0].slice(1)) {
		const header = readName(cell);
		const criterion = decision.criteria.find(item => item.id === header.id);
		const previous = original.criteria.find(item => item.id === header.id);
		if (criterion && previous && header.name !== previous.name) {
			if (criterion.name !== previous.name && criterion.name !== header.name) throw new Error('A criterion has conflicting names in the two tables. Make the names match.');
			criterion.name = header.name;
		}
	}
	decision.options = rows.slice(2).map(row => {
		if (row.length !== rows[0].length) throw new Error('Each option row must match the table header.');
		const option = readName(row[0]);
		const previous = original.options.find(item => item.id === option.id);
		return { ...option, pros: previous?.pros ?? [], cons: previous?.cons ?? [],
			scores: Object.fromEntries(decision.criteria.map(criterion => {
				const column = columnIds.indexOf(criterion.id);
				return [criterion.id, column < 0 ? 5 : Number(row[column + 1])];
			})) };
	});
	const procons = section(body, '## Pros & Cons', '## Ranking');
	const blocks = procons.split(/^### /m).slice(1);
	const seen = new Set<string>();
	for (const block of blocks) {
		const [heading, ...lines] = block.split('\n');
		const id = heading.match(marker)?.[1];
		const option = decision.options.find(item => item.id === id);
		// Option deletion in the table also removes its former pro/con section on the next UI save.
		if (!option) continue;
		if (seen.has(option.id)) throw new Error('Duplicate pros/cons option section.');
		seen.add(option.id);
		const headingName = readName(heading).name;
		const previous = original.options.find(item => item.id === option.id);
		if (previous && headingName !== previous.name) {
			if (option.name !== previous.name && option.name !== headingName) throw new Error('An option has conflicting names in the table and pros/cons heading. Make the names match.');
			option.name = headingName;
		}
		option.pros = [];
		option.cons = [];
		let items: ProConItem[] | undefined;
		for (const line of lines) {
			if (line === '**Pros**') items = option.pros;
			else if (line === '**Cons**') items = option.cons;
			else if (line.startsWith('- ')) {
				const match = line.match(/^- (.*) \(impact: (\d+)\)(?: <!-- dm:([\w-]+) -->)?$/);
				if (!items || !match) throw new Error('Use “- Reason (impact: 1)” for pro/con entries, with impact from 1 to 5.');
				items.push({ id: match[3] ?? newId(), text: unescape(match[1]), weight: Number(match[2]) });
			}
		}
	}
	return validateDecision(decision);
}

export function isDecisionNote(source: string): boolean {
	return /^\s*decision-matrix:\s*1\s*$/m.test(source) || source.includes(START);
}

export function readDecisionNote(source: string, codec: YamlCodec): Decision {
	const { metadata, body } = splitNote(source, codec);
	if (metadata['decision-matrix'] !== 1) throw new Error('This note is not a supported decision (decision-matrix: 1).');
	const decision = validateDecision(metadata.decision);
	const managed = region(body).content;
	return metadata['decision-matrix-body'] === hash(managed) ? decision : parseBody(managed, decision);
}

export function decisionNoteNeedsSync(source: string, decision: Decision, codec: YamlCodec): boolean {
	const { metadata, body } = splitNote(source, codec);
	return region(body).content !== renderDecisionBody(decision)
		|| JSON.stringify(metadata.decision) !== JSON.stringify(decision);
}

export function writeDecisionNote(source: string, value: Decision, codec: YamlCodec): string {
	const decision = validateDecision(value);
	const { metadata, body } = splitNote(source, codec);
	const managed = renderDecisionBody(decision);
	let nextBody: string;
	if (source) {
		const existing = region(body);
		nextBody = body.slice(0, existing.start) + managed + body.slice(existing.end);
	} else nextBody = `${managed}\n`;
	metadata['decision-matrix'] = 1;
	metadata.decision = decision;
	metadata['decision-matrix-body'] = hash(managed);
	return `---\n${codec.stringify(metadata).trimEnd()}\n---\n${nextBody}`;
}
