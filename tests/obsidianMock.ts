import { parse, stringify } from 'yaml';
import { webcrypto } from 'node:crypto';
Object.defineProperty(globalThis, 'window', { value: { crypto: webcrypto }, configurable: true });
export const parseYaml = parse;
export const stringifyYaml = stringify;
export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
export class TFile {
	constructor(public path: string) {}
	get extension() { return this.path.split('.').pop(); }
}
export class TFolder {
	children: (TFolder | TFile)[] = [];
	constructor(public path: string) {}
}
