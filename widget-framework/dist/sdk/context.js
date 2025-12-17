export class ContextService {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 30000; // 30 seconds
        this.currentContext = null;
    }
    async getContext() {
        const route = this.parseRoute(window.location.pathname);
        const context = {
            route,
            document: null,
            collection: null,
            user: await this.getUserContext(),
        };
        if (route.type === 'document' && route.id) {
            context.document = await this.getDocumentContext(route.id);
        }
        if (route.type === 'collection' && route.id) {
            context.collection = await this.getCollectionContext(route.id);
        }
        this.currentContext = context;
        return context;
    }
    getCurrentContext() {
        return this.currentContext;
    }
    parseRoute(pathname) {
        // Normalize: remove trailing slash and /edit suffix
        let normalizedPath = pathname.replace(/\/$/, '');
        normalizedPath = normalizedPath.replace(/\/edit$/, '');
        // Match /doc/slug-urlId format (most common)
        const docMatch = normalizedPath.match(/^\/doc\/(.+)-([a-zA-Z0-9]+)$/);
        if (docMatch) {
            return { type: 'document', id: docMatch[2], pathname };
        }
        // Fallback: try to extract ID from the last hyphen-separated segment
        const docMatchSimple = normalizedPath.match(/^\/doc\/([a-zA-Z0-9-]+)$/);
        if (docMatchSimple) {
            const parts = docMatchSimple[1].split('-');
            const id = parts[parts.length - 1];
            if (id && /^[a-zA-Z0-9]+$/.test(id)) {
                return { type: 'document', id, pathname };
            }
        }
        const collectionMatch = normalizedPath.match(/^\/collection\/([a-zA-Z0-9-]+)$/);
        if (collectionMatch) {
            return { type: 'collection', id: collectionMatch[1], pathname };
        }
        if (normalizedPath.startsWith('/search')) {
            return { type: 'search', query: normalizedPath.split('/search/')[1] || '', pathname };
        }
        if (normalizedPath === '' || normalizedPath === '/' || normalizedPath === '/home') {
            return { type: 'home', pathname };
        }
        return { type: 'unknown', pathname };
    }
    async getDocumentContext(documentId) {
        const cached = this.cache.get(`doc:${documentId}`);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }
        try {
            const response = await fetch('/api/documents.info', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: documentId, includeText: true }),
            });
            if (!response.ok)
                return null;
            const { data } = await response.json();
            const context = {
                id: data.id,
                title: data.title,
                text: data.text || '',
                collectionId: data.collectionId,
                parentDocumentId: data.parentDocumentId,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
            };
            this.cache.set(`doc:${documentId}`, { data: context, timestamp: Date.now() });
            return context;
        }
        catch (error) {
            console.error('[Widget Framework] Failed to fetch document context:', error);
            return null;
        }
    }
    async getCollectionContext(collectionId) {
        const cached = this.cache.get(`collection:${collectionId}`);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }
        try {
            const response = await fetch('/api/collections.info', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: collectionId }),
            });
            if (!response.ok)
                return null;
            const { data } = await response.json();
            this.cache.set(`collection:${collectionId}`, { data, timestamp: Date.now() });
            return data;
        }
        catch (error) {
            console.error('[Widget Framework] Failed to fetch collection context:', error);
            return null;
        }
    }
    async getUserContext() {
        const cached = this.cache.get('user');
        if (cached && Date.now() - cached.timestamp < this.cacheTTL * 2) {
            return cached.data;
        }
        try {
            const response = await fetch('/api/auth.info', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok)
                return null;
            const { data } = await response.json();
            const user = {
                id: data.user.id,
                name: data.user.name,
                email: data.user.email,
                avatarUrl: data.user.avatarUrl,
                isAdmin: data.user.isAdmin || false,
            };
            this.cache.set('user', { data: user, timestamp: Date.now() });
            return user;
        }
        catch (error) {
            console.error('[Widget Framework] Failed to fetch user context:', error);
            return null;
        }
    }
    clearCache() {
        this.cache.clear();
    }
}
export const contextService = new ContextService();
//# sourceMappingURL=context.js.map