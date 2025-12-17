export declare const config: {
    port: number;
    databaseUrl: string;
    outlineUrl: string;
    outlineApiKey: string;
    openaiApiKey: string;
    adminSecret: string;
    csrfSecret: string;
    trustedOrigins: string[];
    enforceOriginCheck: boolean;
};
export type CopilotMode = 'documentation' | 'workflow' | 'sop' | 'kbChat';
export declare const COPILOT_MODE_CONFIG: Record<CopilotMode, {
    name: string;
    description: string;
    defaultPrompt: string;
}>;
export declare const DEFAULT_FEATURE_CONFIG: {
    builder: {
        name: string;
        description: string;
        model: string;
        maxTokens: number;
        temperature: number;
        topP: number;
        presencePenalty: number;
        frequencyPenalty: number;
        systemPrompt: string;
    };
    copilot: {
        name: string;
        description: string;
        model: string;
        maxTokens: number;
        temperature: number;
        topP: number;
        presencePenalty: number;
        frequencyPenalty: number;
        systemPrompt: string;
    };
    rag: {
        name: string;
        description: string;
        model: string;
        maxTokens: number;
        temperature: number;
        topP: number;
        presencePenalty: number;
        frequencyPenalty: number;
        embeddingModel: string;
        systemPrompt: string;
    };
};
export declare const AVAILABLE_MODELS: {
    id: string;
    name: string;
    description: string;
}[];
export declare const EDIT_KEYWORDS: string[];
export declare const RAG_TRIGGER_KEYWORDS: string[];
//# sourceMappingURL=settings.d.ts.map