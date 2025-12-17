interface Chunk {
    section: string;
    content: string;
}
export declare function splitIntoChunks(content: string, title: string, maxChunkSize?: number): Chunk[];
export declare function extractSections(content: string): string[];
export {};
//# sourceMappingURL=chunker.d.ts.map