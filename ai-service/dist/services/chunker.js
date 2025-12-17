"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitIntoChunks = splitIntoChunks;
exports.extractSections = extractSections;
function splitIntoChunks(content, title, maxChunkSize = 1000) {
    const chunks = [];
    const lines = content.split('\n');
    let currentSection = title;
    let currentContent = [];
    let currentSize = 0;
    const flushChunk = () => {
        if (currentContent.length > 0) {
            const text = currentContent.join('\n').trim();
            if (text.length > 0) {
                chunks.push({
                    section: currentSection,
                    content: text
                });
            }
            currentContent = [];
            currentSize = 0;
        }
    };
    for (const line of lines) {
        const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headerMatch) {
            flushChunk();
            currentSection = headerMatch[2].trim();
            continue;
        }
        const lineSize = line.length + 1;
        if (currentSize + lineSize > maxChunkSize && currentContent.length > 0) {
            flushChunk();
        }
        currentContent.push(line);
        currentSize += lineSize;
    }
    flushChunk();
    return chunks;
}
function extractSections(content) {
    const sections = [];
    const headerRegex = /^#{1,3}\s+(.+)$/gm;
    let match;
    while ((match = headerRegex.exec(content)) !== null) {
        sections.push(match[1].trim());
    }
    return sections;
}
//# sourceMappingURL=chunker.js.map