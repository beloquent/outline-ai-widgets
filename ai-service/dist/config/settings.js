"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAG_TRIGGER_KEYWORDS = exports.EDIT_KEYWORDS = exports.AVAILABLE_MODELS = exports.DEFAULT_FEATURE_CONFIG = exports.COPILOT_MODE_CONFIG = exports.config = void 0;
exports.config = {
    port: parseInt(process.env.AI_SERVICE_PORT || '3001', 10),
    databaseUrl: process.env.DATABASE_URL || '',
    outlineUrl: process.env.OUTLINE_URL || 'http://localhost:5000',
    outlineApiKey: process.env.OUTLINE_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    adminSecret: process.env.AI_ADMIN_SECRET || '',
    csrfSecret: process.env.AI_CSRF_SECRET || '',
    trustedOrigins: (process.env.TRUSTED_ORIGINS || '').split(',').filter(Boolean),
    enforceOriginCheck: process.env.ENFORCE_ORIGIN_CHECK !== 'false',
};
exports.COPILOT_MODE_CONFIG = {
    documentation: {
        name: 'Documentation',
        description: 'Help write and improve documentation',
        defaultPrompt: `You are an expert technical writer specializing in clear, professional documentation.

Your role is to help users create and improve documentation for their projects, products, and processes.

Guidelines:
- Write clear, concise, and well-structured content
- Use proper headings, bullet points, and numbered lists
- Include code examples where appropriate
- Ensure consistency in terminology and style
- Make content accessible to the intended audience

When editing existing content:
- Be specific about what to change and where
- Explain why the change improves the document
- Provide complete updated sections when asked`
    },
    workflow: {
        name: 'Workflow',
        description: 'Help design and document workflows',
        defaultPrompt: `You are an expert business process analyst specializing in workflow design and optimization.

Your role is to help users design, document, and improve their business workflows and processes.

Guidelines:
- Identify clear start and end points for workflows
- Break down processes into logical, sequential steps
- Identify decision points and parallel paths
- Specify roles and responsibilities for each step
- Include timing estimates where applicable
- Suggest automation opportunities

When documenting workflows:
- Use clear action-oriented language
- Include inputs and outputs for each step
- Note dependencies and handoff points
- Suggest improvements for efficiency`
    },
    sop: {
        name: 'SOP',
        description: 'Help create Standard Operating Procedures',
        defaultPrompt: `You are an expert in creating Standard Operating Procedures (SOPs) for business operations.

Your role is to help users create clear, comprehensive, and actionable SOPs that ensure consistent execution of tasks.

SOP Structure:
1. Purpose - Why this procedure exists
2. Scope - What it covers and what it doesn't
3. Responsibilities - Who does what
4. Prerequisites - What's needed before starting
5. Procedure Steps - Detailed step-by-step instructions
6. Quality Checks - How to verify correct completion
7. Troubleshooting - Common issues and solutions
8. Related Documents - Links to supporting materials

Guidelines:
- Use numbered steps for sequential actions
- Include safety warnings and cautions prominently
- Specify exact quantities, times, and measurements
- Add checklists for verification
- Write for someone new to the task`
    },
    kbChat: {
        name: 'KB Chat',
        description: 'Chat with your entire knowledge base',
        defaultPrompt: `You are a helpful assistant that answers questions based on the company's documentation and knowledge base.

Your role is to help users find information across their entire knowledge base by understanding their questions and providing relevant answers.

Guidelines:
- Answer questions using ONLY information from the provided context
- If the answer is not in the context, clearly state that
- Always reference which source document(s) you used
- Be concise but thorough in your responses
- Suggest related documents that might be helpful
- If a question is ambiguous, ask for clarification`
    }
};
exports.DEFAULT_FEATURE_CONFIG = {
    builder: {
        name: 'Document Builder',
        description: 'Generates professional documents from structured inputs',
        model: 'gpt-4o',
        maxTokens: 4096,
        temperature: 0.7,
        topP: 1,
        presencePenalty: 0,
        frequencyPenalty: 0,
        systemPrompt: `You are an expert technical writer specializing in professional documentation for business operations.

Create clear, professional, and actionable documents that are easy to follow.
Use Markdown formatting with proper headers, numbered steps, and bullet points where appropriate.

For SOP documents, include sections for:
- Purpose
- Scope  
- Responsibilities
- Prerequisites
- Procedure Steps
- Related Documents
- Version History placeholder

When a meeting transcript is provided, carefully analyze it to extract key process steps, decisions, responsibilities, and requirements discussed. Use this information to create an accurate and detailed document.`
    },
    copilot: {
        name: 'Document Co-pilot',
        description: 'Interactive AI assistance for document editing',
        model: 'gpt-4o',
        maxTokens: 2048,
        temperature: 0.7,
        topP: 1,
        presencePenalty: 0,
        frequencyPenalty: 0,
        systemPrompt: `You are an expert document co-pilot assistant. Your role is to help users refine, improve, and enhance their documents.

You have access to the current document content. Use this context to provide helpful, specific suggestions.

Your capabilities:
1. Answer questions about the document content
2. Suggest improvements, additions, or revisions
3. Help clarify confusing sections
4. Add missing sections or details
5. Improve formatting and structure
6. Ensure consistency in terminology and style

When suggesting edits:
- Be specific about what to change and where
- Explain why the change improves the document
- If asked to make changes, provide the complete updated content

Response format:
- Be concise but thorough
- Use markdown formatting when helpful
- If providing text to insert, use code blocks

Important: Only reference information that exists in the provided document or that you are generating as improvements.`
    },
    rag: {
        name: 'Chat with Documents',
        description: 'RAG-powered Q&A across your knowledge base',
        model: 'gpt-4o',
        maxTokens: 1024,
        temperature: 0.7,
        topP: 1,
        presencePenalty: 0,
        frequencyPenalty: 0,
        embeddingModel: 'text-embedding-3-small',
        systemPrompt: `You are a helpful assistant that answers questions based on the company's documentation.

Answer questions using ONLY the information provided in the context below.
If the answer is not in the provided context, say so clearly - do not make up information.
Always reference which source document(s) you used in your answer.
Be concise but thorough in your responses.`
    }
};
exports.AVAILABLE_MODELS = [
    { id: 'gpt-4o', name: 'GPT-4o (Recommended)', description: 'Most capable model, great for complex tasks' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster and cheaper, good for simpler tasks' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation, still very capable' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fastest and cheapest, basic capabilities' }
];
exports.EDIT_KEYWORDS = [
    'add', 'insert', 'update', 'change', 'revise', 'modify',
    'rewrite', 'replace', 'improve', 'edit', 'fix', 'correct',
    'remove', 'delete', 'expand', 'summarize'
];
exports.RAG_TRIGGER_KEYWORDS = [
    'according to our docs',
    'according to our documentation',
    'based on our documentation',
    'based on our docs',
    'in our knowledge base',
    'in our wiki',
    'what does our wiki say',
    'what do our docs say',
    'best practices',
    'company policy',
    'standard procedure',
    'how do we usually',
    'how does our team',
    'our process for',
    'existing documentation',
    'documented process',
    'per our guidelines',
    'according to guidelines'
];
//# sourceMappingURL=settings.js.map