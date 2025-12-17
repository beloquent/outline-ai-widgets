interface DocumentChunk {
    id: number;
    documentId: string;
    collectionId: string | null;
    title: string;
    section: string | null;
    content: string;
    relevance?: number;
}
interface SearchResult extends DocumentChunk {
    url: string;
}
export declare function indexDocument(options: {
    documentId: string;
    collectionId?: string;
    title: string;
    content: string;
    metadata?: Record<string, any>;
}): Promise<number>;
export declare function searchSimilar(options: {
    query: string;
    collectionId?: string;
    limit?: number;
}): Promise<SearchResult[]>;
export declare function deleteDocumentChunks(documentId: string): Promise<void>;
export declare function getIndexStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    lastIndexed: string | null;
}>;
export {};
//# sourceMappingURL=embeddings.d.ts.map