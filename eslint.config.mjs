import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
	globalIgnores([
		'node_modules/**', 'dist/**', 'main.js', 'scripts/**', 'tests/**',
		'esbuild.config.mjs', 'version-bump.mjs', 'eslint.config.mjs'
	]),
	...obsidianmd.configs.recommended,
	{ languageOptions: { parserOptions: { projectService: true } } }
]);
