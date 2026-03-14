"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = require("../config/logger");
const router = (0, express_1.Router)();
const extractDocumentLinks = (text, allDocIds, docUrlToId) => {
    const linkedIds = new Set();
    if (!text)
        return [];
    const patterns = [
        /\[([^\]]*)\]\(\/doc\/([a-zA-Z0-9-]+)\)/g,
        /href="\/doc\/([a-zA-Z0-9-]+)"/g,
        /\/doc\/([a-zA-Z0-9-]+)/g,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const slug = match[2] || match[1];
            if (slug) {
                if (allDocIds.has(slug)) {
                    linkedIds.add(slug);
                }
                const idFromUrl = docUrlToId.get(slug);
                if (idFromUrl) {
                    linkedIds.add(idFromUrl);
                }
            }
        }
    }
    const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
    let uuidMatch;
    while ((uuidMatch = uuidPattern.exec(text)) !== null) {
        const uuid = uuidMatch[0].toLowerCase();
        if (allDocIds.has(uuid)) {
            linkedIds.add(uuid);
        }
    }
    return Array.from(linkedIds);
};
const getOutlineUrl = () => {
    return process.env.OUTLINE_URL || 'http://localhost:3000';
};
router.get('/documents', async (req, res) => {
    try {
        const cookies = req.headers.cookie;
        if (!cookies) {
            return res.status(401).json({
                error: 'Session required',
                message: 'Please log in to Outline first'
            });
        }
        const outlineUrl = getOutlineUrl();
        const collectionsResponse = await fetch(`${outlineUrl}/api/collections.list`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        if (!collectionsResponse.ok) {
            throw new Error(`Failed to fetch collections: ${collectionsResponse.status}`);
        }
        const collectionsData = await collectionsResponse.json();
        const collections = collectionsData.data || [];
        const collectionMap = new Map();
        for (const col of collections) {
            collectionMap.set(col.id, col);
        }
        const documentsResponse = await fetch(`${outlineUrl}/api/documents.list`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ limit: 100 })
        });
        if (!documentsResponse.ok) {
            throw new Error(`Failed to fetch documents: ${documentsResponse.status}`);
        }
        const documentsData = await documentsResponse.json();
        let allDocuments = documentsData.data || [];
        let offset = 100;
        while (documentsData.pagination?.nextPath) {
            const moreResponse = await fetch(`${outlineUrl}/api/documents.list`, {
                method: 'POST',
                headers: {
                    'Cookie': cookies,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ limit: 100, offset })
            });
            if (!moreResponse.ok)
                break;
            const moreData = await moreResponse.json();
            if (!moreData.data || moreData.data.length === 0)
                break;
            allDocuments = allDocuments.concat(moreData.data);
            offset += 100;
            if (offset > 1000)
                break;
        }
        const documents = allDocuments.filter(doc => doc.publishedAt);
        logger_1.logger.debug('Graph view: Filtered out drafts', {
            total: allDocuments.length,
            published: documents.length,
            draftsExcluded: allDocuments.length - documents.length
        });
        const allDocIds = new Set();
        const docUrlToId = new Map();
        for (const doc of documents) {
            allDocIds.add(doc.id);
            if (doc.url) {
                const slug = doc.url.split('/').pop();
                if (slug) {
                    docUrlToId.set(slug, doc.id);
                }
            }
        }
        const nodes = [];
        const edges = [];
        const linkCounts = new Map();
        for (const doc of documents) {
            const linkedIds = extractDocumentLinks(doc.text || '', allDocIds, docUrlToId);
            for (const targetId of linkedIds) {
                if (targetId !== doc.id) {
                    edges.push({
                        source: doc.id,
                        target: targetId,
                        type: 'link'
                    });
                    linkCounts.set(doc.id, (linkCounts.get(doc.id) || 0) + 1);
                    linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1);
                }
            }
            if (doc.parentDocumentId && allDocIds.has(doc.parentDocumentId)) {
                edges.push({
                    source: doc.parentDocumentId,
                    target: doc.id,
                    type: 'hierarchy'
                });
                linkCounts.set(doc.id, (linkCounts.get(doc.id) || 0) + 1);
                linkCounts.set(doc.parentDocumentId, (linkCounts.get(doc.parentDocumentId) || 0) + 1);
            }
        }
        for (const doc of documents) {
            const collection = collectionMap.get(doc.collectionId);
            nodes.push({
                id: doc.id,
                title: doc.title,
                collectionId: doc.collectionId,
                collectionName: collection?.name || null,
                linkCount: linkCounts.get(doc.id) || 0,
                url: doc.url
            });
        }
        const graphData = { nodes, edges };
        logger_1.logger.info('Graph data generated', {
            nodeCount: nodes.length,
            edgeCount: edges.length
        });
        res.json(graphData);
    }
    catch (error) {
        logger_1.logger.error('Failed to generate graph data', { error });
        res.status(500).json({
            error: 'Failed to generate graph data',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/local/:documentId', async (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    try {
        const { documentId } = req.params;
        const depth = Math.min(parseInt(req.query.depth) || 2, 3);
        const cookies = req.headers.cookie;
        if (!cookies) {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Session required. Please log in to Outline first.' }
            });
        }
        const outlineUrl = getOutlineUrl();
        const docResponse = await fetch(`${outlineUrl}/api/documents.info`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: documentId })
        });
        if (!docResponse.ok) {
            logger_1.logger.error('Failed to fetch center document', { documentId, status: docResponse.status });
            return res.status(404).json({ error: 'Document not found' });
        }
        const docData = await docResponse.json();
        const centerDoc = docData.data;
        if (!centerDoc) {
            logger_1.logger.error('Center document data is null', { documentId });
            return res.status(404).json({ error: 'Document not found' });
        }
        const centerDocId = centerDoc.id;
        logger_1.logger.info('Local graph request', { documentId, centerDocId, depth });
        const collectionsResponse = await fetch(`${outlineUrl}/api/collections.list`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        const collectionsData = await collectionsResponse.json();
        const collections = collectionsData.data || [];
        const collectionMap = new Map();
        for (const col of collections) {
            collectionMap.set(col.id, col);
        }
        const documentsResponse = await fetch(`${outlineUrl}/api/documents.list`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ limit: 100 })
        });
        if (!documentsResponse.ok) {
            logger_1.logger.error('Failed to fetch documents list', { status: documentsResponse.status });
        }
        const documentsData = await documentsResponse.json();
        let allDocuments = documentsData.data || [];
        let offset = 100;
        while (documentsData.pagination?.nextPath && offset < 500) {
            const moreResponse = await fetch(`${outlineUrl}/api/documents.list`, {
                method: 'POST',
                headers: {
                    'Cookie': cookies,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ limit: 100, offset })
            });
            if (!moreResponse.ok)
                break;
            const moreData = await moreResponse.json();
            if (!moreData.data || moreData.data.length === 0)
                break;
            allDocuments = allDocuments.concat(moreData.data);
            offset += 100;
        }
        if (!allDocuments.find(d => d.id === centerDocId)) {
            allDocuments.push(centerDoc);
        }
        const publishedDocuments = allDocuments.filter(doc => doc.publishedAt || doc.id === centerDocId);
        logger_1.logger.debug('Local graph: Filtered out drafts', {
            total: allDocuments.length,
            published: publishedDocuments.length,
            centerDocIsDraft: !centerDoc.publishedAt
        });
        const allDocIds = new Set();
        const docUrlToId = new Map();
        const docMap = new Map();
        for (const doc of publishedDocuments) {
            allDocIds.add(doc.id);
            docMap.set(doc.id, doc);
            if (doc.url) {
                const slug = doc.url.split('/').pop();
                if (slug) {
                    docUrlToId.set(slug, doc.id);
                }
            }
        }
        const documentLinks = new Map();
        const parentChildMap = new Map();
        const childParentMap = new Map();
        for (const doc of publishedDocuments) {
            const linkedIds = extractDocumentLinks(doc.text || '', allDocIds, docUrlToId);
            documentLinks.set(doc.id, linkedIds.filter(id => id !== doc.id));
            if (doc.parentDocumentId && allDocIds.has(doc.parentDocumentId)) {
                childParentMap.set(doc.id, doc.parentDocumentId);
                const children = parentChildMap.get(doc.parentDocumentId) || [];
                children.push(doc.id);
                parentChildMap.set(doc.parentDocumentId, children);
            }
        }
        const includedDocs = new Set();
        const toProcess = [centerDocId];
        includedDocs.add(centerDocId);
        for (let d = 0; d < depth; d++) {
            const nextLevel = [];
            for (const docId of toProcess) {
                const outgoing = documentLinks.get(docId) || [];
                for (const linkedId of outgoing) {
                    if (!includedDocs.has(linkedId)) {
                        includedDocs.add(linkedId);
                        nextLevel.push(linkedId);
                    }
                }
                for (const [sourceId, links] of documentLinks.entries()) {
                    if (links.includes(docId) && !includedDocs.has(sourceId)) {
                        includedDocs.add(sourceId);
                        nextLevel.push(sourceId);
                    }
                }
                const parentId = childParentMap.get(docId);
                if (parentId && !includedDocs.has(parentId)) {
                    includedDocs.add(parentId);
                    nextLevel.push(parentId);
                }
                const children = parentChildMap.get(docId) || [];
                for (const childId of children) {
                    if (!includedDocs.has(childId)) {
                        includedDocs.add(childId);
                        nextLevel.push(childId);
                    }
                }
            }
            toProcess.length = 0;
            toProcess.push(...nextLevel);
        }
        const nodes = [];
        const edges = [];
        const linkCounts = new Map();
        for (const docId of includedDocs) {
            const links = documentLinks.get(docId) || [];
            for (const targetId of links) {
                if (includedDocs.has(targetId)) {
                    edges.push({ source: docId, target: targetId, type: 'link' });
                    linkCounts.set(docId, (linkCounts.get(docId) || 0) + 1);
                    linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1);
                }
            }
            const doc = docMap.get(docId);
            if (doc?.parentDocumentId && includedDocs.has(doc.parentDocumentId)) {
                edges.push({ source: doc.parentDocumentId, target: docId, type: 'hierarchy' });
                linkCounts.set(docId, (linkCounts.get(docId) || 0) + 1);
                linkCounts.set(doc.parentDocumentId, (linkCounts.get(doc.parentDocumentId) || 0) + 1);
            }
        }
        for (const docId of includedDocs) {
            const doc = docMap.get(docId);
            if (doc) {
                const collection = collectionMap.get(doc.collectionId);
                nodes.push({
                    id: doc.id,
                    title: doc.title,
                    collectionId: doc.collectionId,
                    collectionName: collection?.name || null,
                    linkCount: linkCounts.get(doc.id) || 0,
                    url: doc.url
                });
            }
        }
        logger_1.logger.info('Local graph data generated', {
            centerDocId,
            nodeCount: nodes.length,
            edgeCount: edges.length,
            depth
        });
        res.json({
            nodes,
            edges,
            centerId: centerDocId
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to generate local graph data', { error });
        res.status(500).json({
            error: 'Failed to generate local graph data',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/collections', async (req, res) => {
    try {
        const cookies = req.headers.cookie;
        if (!cookies) {
            return res.status(401).json({
                error: 'Session required',
                message: 'Please log in to Outline first'
            });
        }
        const outlineUrl = getOutlineUrl();
        const response = await fetch(`${outlineUrl}/api/collections.list`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch collections: ${response.status}`);
        }
        const data = await response.json();
        res.json({
            collections: (data.data || []).map((c) => ({
                id: c.id,
                name: c.name,
                color: c.color
            }))
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to fetch collections', { error });
        res.status(500).json({ error: 'Failed to fetch collections' });
    }
});
exports.default = router;
//# sourceMappingURL=graph.js.map