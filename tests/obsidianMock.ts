import { parse, stringify } from 'yaml';
export const parseYaml = parse;
export const stringifyYaml = stringify;
export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
export class TFile {
	constructor(public path: string) {}
	get extension() { return this.path.split('.').pop(); }
}
export class TFolder { constructor(public path: string) {} }
