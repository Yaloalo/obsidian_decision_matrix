export interface ProConItem {
	id: string;
	text: string;
	weight: number; // 1 to 5
}

export interface DecisionOption {
	id: string;
	name: string;
	pros: ProConItem[];
	cons: ProConItem[];
	scores: Record<string, number>; // criterionId -> score (1 to 10)
}

export interface DecisionCriterion {
	id: string;
	name: string;
	weight: number; // 1 to 10
}

export interface Decision {
	id: string;
	title: string;
	mode: 'matrix' | 'pros-cons';
	createdAt: string;
	options: DecisionOption[];
	criteria: DecisionCriterion[];
}

export interface DecisionPluginSettings {
	storageFolder: string;
}

export const DEFAULT_SETTINGS: DecisionPluginSettings = {
	storageFolder: 'decisions'
};
