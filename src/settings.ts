import { decisionFolder } from './markdownStore';
import { DEFAULT_SETTINGS, type DecisionPluginSettings } from './types';

export function readSettings(value: unknown): DecisionPluginSettings {
	if (value && typeof value === 'object' && !Array.isArray(value)
		&& 'storageFolder' in value && typeof value.storageFolder === 'string') {
		try { return { storageFolder: decisionFolder(value.storageFolder) }; }
		catch { /* Keep defaults when a saved path is invalid. */ }
	}
	return { ...DEFAULT_SETTINGS };
}
