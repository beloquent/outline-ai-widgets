import { config } from '../config/settings';
import { logger } from '../config/logger';
import { getOutlineApiKey } from './settings';

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

class OutlineClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.outlineUrl;
  }

  private async getApiKey(): Promise<string> {
    const dbKey = await getOutlineApiKey();
    if (dbKey) {
      return dbKey;
    }
    
    if (config.outlineApiKey) {
      return config.outlineApiKey;
    }
    
    throw new Error('Outline API key not configured. Please set it in AI Copilot settings.');
  }

  private async request<T>(endpoint: string, body: Record<string, any> = {}, options?: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}/api/${endpoint}`;
    
    logger.debug('Outline API request', { endpoint, body: JSON.stringify(body).substring(0, 200), hasCookies: !!options?.cookies });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Forwarded-Proto': 'https',
    };

    if (options?.cookies) {
      headers['Cookie'] = options.cookies;
      logger.debug('Outline API using cookie auth');
    } else {
      const apiKey = await this.getApiKey();
      headers['Authorization'] = `Bearer ${apiKey}`;
      logger.debug('Outline API using API key auth');
    }

    logger.debug(`Outline API calling: ${url}`);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    logger.debug(`Outline API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Outline API error', { status: response.status, error: errorText });
      throw new Error(`Outline API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as { data: T };
    logger.debug(`Outline API response for ${endpoint}`, {
      dataKeys: result.data ? Object.keys(result.data as any) : [],
      isArray: Array.isArray(result.data),
    });
    return result.data;
  }

  async getDocument(documentId: string): Promise<OutlineDocument> {
    const doc = await this.request<OutlineDocument>('documents.info', { id: documentId });
    logger.info('getDocument result', {
      id: doc.id,
      title: doc.title,
      hasText: !!doc.text,
      textLength: doc.text?.length ?? 0,
      textType: typeof doc.text,
    });
    return doc;
  }

  async listDocuments(options: {
    collectionId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<OutlineDocument[]> {
    return this.request<OutlineDocument[]>('documents.list', {
      limit: options.limit || 100,
      offset: options.offset || 0,
      ...(options.collectionId && { collectionId: options.collectionId })
    });
  }

  async createDocument(options: {
    title: string;
    text: string;
    collectionId?: string;
    parentDocumentId?: string;
    publish?: boolean;
  }): Promise<OutlineDocument> {
    return this.request<OutlineDocument>('documents.create', {
      title: options.title,
      text: options.text,
      ...(options.collectionId && { collectionId: options.collectionId }),
      ...(options.parentDocumentId && { parentDocumentId: options.parentDocumentId }),
      publish: options.publish ?? true
    });
  }

  async updateDocument(options: {
    id: string;
    title?: string;
    text?: string;
    publish?: boolean;
  }): Promise<OutlineDocument> {
    return this.request<OutlineDocument>('documents.update', options);
  }

  async listCollections(options?: RequestOptions): Promise<OutlineCollection[]> {
    return this.request<OutlineCollection[]>('collections.list', {}, options);
  }

  async createCollection(options: {
    name: string;
    description?: string;
    color?: string;
    permission?: 'read' | 'read_write';
  }): Promise<OutlineCollection> {
    return this.request<OutlineCollection>('collections.create', {
      name: options.name,
      ...(options.description && { description: options.description }),
      ...(options.color && { color: options.color }),
      permission: options.permission || 'read_write'
    });
  }

  async getCollectionDocuments(collectionId: string): Promise<OutlineDocument[]> {
    const documents: OutlineDocument[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const batch = await this.listDocuments({ collectionId, limit, offset });
      documents.push(...batch);
      
      if (batch.length < limit) {
        break;
      }
      offset += limit;
    }

    return documents;
  }
}

export const outlineClient = new OutlineClient();
