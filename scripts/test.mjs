import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'decision-matrix-test-'));
try {
	const outfile = join(directory, 'tests.cjs');
	await build({ entryPoints: ['tests/decision.test.ts'], outfile, bundle: true, platform: 'node', format: 'cjs',
		plugins: [{ name: 'obsidian-test-adapter', setup(build) {
			build.onResolve({ filter: /^obsidian$/ }, () => ({ path: resolve('tests/obsidianMock.ts') }));
		} }]
	});
	process.exitCode = await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [outfile], { stdio: 'inherit' });
		child.on('error', reject);
		child.on('close', code => resolve(code ?? 1));
	});
} finally { await rm(directory, { recursive: true, force: true }); }
