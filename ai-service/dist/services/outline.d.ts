interface OutlineDocument {
    id: string;
    title: string;
    text: string;
    emoji?: string;
    collectionId: string;
    parentDocumentId?: string;
    createdAt: string;
    updatedAt: string;
    publishedAt?: string;
    url: string;
}
interface OutlineCollection {
    id: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    permission?: string;
    documentCount: number;
}
interface RequestOptions {
    cookies?: string;
}
declare class OutlineClient {
    private baseUrl;
    constructor();
    private getApiKey;
    private request;
    getDocument(documentId: string): Promise<OutlineDocument>;
    listDocuments(options?: {
        collectionId?: string;
        limit?: number;
        offset?: number;
    }): Promise<OutlineDocument[]>;
    createDocument(options: {
        title: string;
        text: string;
        collectionId?: string;
        parentDocumentId?: string;
        publish?: boolean;
    }): Promise<OutlineDocument>;
    updateDocument(options: {
        id: string;
        title?: string;
        text?: string;
        publish?: boolean;
    }): Promise<OutlineDocument>;
    listCollections(options?: RequestOptions): Promise<OutlineCollection[]>;
    createCollection(options: {
        name: string;
        description?: string;
        color?: string;
        permission?: 'read' | 'read_write';
    }): Promise<OutlineCollection>;
    getCollectionDocuments(collectionId: string): Promise<OutlineDocument[]>;
}
export declare const outlineClient: OutlineClient;
export {};
//# sourceMappingURL=outline.d.ts.map