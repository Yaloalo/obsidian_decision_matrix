import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/release', { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `dist/release/${name}`);
console.log('Release assets prepared in dist/release/ (upload all three files individually).');
