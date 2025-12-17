import OpenAI from 'openai';
export declare function getOpenAIApiKey(): Promise<string | null>;
export declare function getOpenAIClientAsync(): Promise<OpenAI>;
export declare function getOpenAIClient(): OpenAI;
export declare function resetOpenAIClient(): void;
interface ChatOptions {
    feature: 'builder' | 'copilot' | 'rag';
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    overrides?: Partial<{
        model: string;
        maxTokens: number;
        temperature: number;
        topP: number;
        presencePenalty: number;
        frequencyPenalty: number;
    }>;
}
export declare function chat(options: ChatOptions): Promise<string>;
export declare function createEmbedding(text: string): Promise<number[]>;
export {};
//# sourceMappingURL=openai.d.ts.map