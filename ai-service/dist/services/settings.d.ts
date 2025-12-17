import { CopilotMode } from '../config/settings';
type FeatureKey = 'builder' | 'copilot' | 'rag';
export interface ModePrompts {
    documentation: string;
    workflow: string;
    sop: string;
    kbChat: string;
}
export declare function getModePrompts(): Promise<ModePrompts>;
export declare function getModePrompt(mode: CopilotMode): Promise<string>;
export declare function updateModePrompts(updates: Partial<ModePrompts>): Promise<ModePrompts>;
export declare function resetModePrompts(): Promise<ModePrompts>;
interface FeatureSettings {
    model: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    presencePenalty: number;
    frequencyPenalty: number;
    systemPrompt: string;
    embeddingModel?: string;
}
export declare function getFeatureSettings(feature: FeatureKey): Promise<FeatureSettings>;
export declare function updateFeatureSettings(feature: FeatureKey, updates: Partial<FeatureSettings>): Promise<FeatureSettings>;
export declare function resetFeatureSettings(feature: FeatureKey): Promise<FeatureSettings>;
export declare function getAllSettings(): Promise<{
    features: Record<FeatureKey, FeatureSettings>;
}>;
export declare function getOutlineApiKey(): Promise<string | null>;
export {};
//# sourceMappingURL=settings.d.ts.map