# Code Review: Outline AI Widgets

## Context

This project is a zero-modification widget framework that adds AI capabilities (copilot, RAG, document generation, workflows) to Outline via a reverse proxy gateway. The architecture is clean: a gateway injects widget bootstrap scripts into Outline's HTML, a widget framework serves client-side bundles, and an AI service provides OpenAI-powered backend endpoints. All run in Docker with PostgreSQL (pgvector) and Redis.

The architectural approach is well-conceived. The findings below focus on what should be addressed before production use.

---

## Critical Issues

### 1. CSRF Protection is Effectively Disabled
**File:** `ai-service/src/middleware/auth.ts:40-70`

The `validateCsrfToken` function returns `true` (bypass) in three separate cases:
- No `csrfSecret` configured (line 41-43)
- No CSRF token header present (line 46-48)
- No session cookie found (line 52-54)

This means CSRF validation **only runs when the attacker supplies a token**. An attacker simply omits the `x-csrf-token` header and bypasses the check entirely. The calling code at lines 133-134 compounds this:
```typescript
if (csrfToken && !validateCsrfToken(req)) {
```
This only validates when a token is *provided* — the opposite of secure behavior. State-changing requests without a CSRF token should be rejected, not allowed.

### 2. CSP Headers Permit Script Injection
**File:** `gateway/src/index.ts:92-94`

```typescript
`script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
`style-src 'self' 'unsafe-inline'`,
```

`unsafe-inline` and `unsafe-eval` effectively nullify CSP's script injection protection. The project already computes SRI hashes for the bootstrap script — these should be used in the CSP directive instead of `unsafe-inline`. The `unsafe-eval` directive should be removed unless a specific dependency requires it.

### 3. Admin Secret Vulnerable to Timing Attack
**File:** `ai-service/src/middleware/auth.ts:201`

```typescript
if (token === config.adminSecret) {
```

Direct string comparison leaks timing information. The codebase already uses `crypto.timingSafeEqual` for CSRF tokens (line 63) — the same approach should be applied here.

### 4. API Keys Stored in Plaintext
**File:** `ai-service/src/routes/admin.ts:60-65`

```typescript
await query(
  `INSERT INTO ai_settings (key, value, updated_at)
   VALUES ('openai_api_key', $1, NOW())
   ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
  [JSON.stringify({ key: body.openaiApiKey })]
);
```

OpenAI and Outline API keys are stored as plaintext JSON in the database. If the database is compromised, all keys are immediately exposed. These should be encrypted at rest using a server-side encryption key (e.g., AES-256-GCM with a key from environment variables).

### 5. No Test Coverage
There are zero test files in the entire project — no unit tests, no integration tests, no test configuration. For a project handling authentication, authorization, API key management, and AI service orchestration, this is a significant risk. Any refactoring or bug fix could introduce regressions silently.

---

## High-Severity Issues

### 6. `innerHTML` Used Without Sanitization
**Files:**
- `widget-framework/src/widgets/ai-copilot/index.ts` (lines 423, 428, 564, 613, etc.)
- `widget-framework/src/widgets/ai-settings/index.ts` (lines 161, 454, 473)

All widget rendering uses `innerHTML` with template literals. If any user-supplied content (document titles, collection names, API responses) is interpolated without escaping, this creates XSS vectors. The CSP issue (#2) makes this worse since inline scripts would execute. A sanitization library (e.g., DOMPurify) or DOM API-based rendering should be used.

### 7. No Rate Limiting on Any Endpoint
None of the API routes implement rate limiting. Endpoints like `POST /ai/indexing/reindex-all` and `POST /ai/copilot/chat` could be abused to:
- Exhaust OpenAI API credits
- Overload the database with indexing operations
- Create denial-of-service conditions

Express middleware like `express-rate-limit` should be applied, at minimum to AI and indexing endpoints.

### 8. Memory Leaks: Polling and Event Listeners Not Cleaned Up
**File:** `widget-framework/src/widgets/ai-settings/index.ts`

The reindex polling uses recursive `setTimeout` with no cancellation mechanism. If the widget unmounts during polling, the timers continue running. Similarly, event listeners attached in the copilot widget have no cleanup on `onUnmount`.

### 9. Widget Components Are Monolithic
- `ai-copilot/index.ts`: ~900 lines — handles rendering, state management, API calls, file upload, markdown rendering, theme detection, and breadcrumb navigation in a single class
- `ai-settings/index.ts`: ~1070 lines — handles modal rendering, form state, tab navigation, API calls, and polling

These are difficult to maintain, test, or reason about. Extracting concerns (rendering, API calls, state management) into separate modules would improve maintainability.

---

## Medium-Severity Issues

### 10. Theme Detection is Brittle
**File:** `widget-framework/src/widgets/ai-copilot/index.ts`

```typescript
const isDark = bgColor.includes('17, 19, 25') || bgColor.includes('8, 9, 12') ||
               bgColor.includes('0, 0, 0') || body.classList.contains('dark');
```

Detecting dark mode by matching specific RGB strings is fragile. Any theme customization or browser extension that changes background colors will break this. A more robust approach would be checking `prefers-color-scheme` media query or looking for a documented Outline theme class/attribute.

### 11. Route Parsing is Fragile
**File:** `widget-framework/src/sdk/context.ts`

Document and collection IDs are extracted from URL paths via regex matching patterns like `/doc/{slug}-{id}`. If Outline changes its URL structure, the widget framework silently breaks. This should at minimum log warnings on parse failures, and ideally use Outline's API to resolve the current document context rather than URL parsing.

### 12. Duplicate Code in Auth Middleware
**File:** `ai-service/src/middleware/auth.ts`

`sessionAuthMiddleware` (lines 103-194) and `adminAuthMiddleware` (lines 196-310) share nearly identical logic for cookie extraction, origin validation, CSRF checking, and Outline API calls. The admin middleware adds a role check but is otherwise copy-pasted. This should be refactored into a shared base with the admin check as an extension.

### 13. Document Chunking Doesn't Account for Code Blocks
**File:** `ai-service/src/services/chunker.ts`

The chunker splits on markdown headers (h1-h3) but doesn't handle fenced code blocks. A header-like pattern inside a code block (e.g., `# comment` in a Python snippet) could cause incorrect splitting. The chunker should skip content within ``` fences.

### 14. `any` Type Casts on Request Objects
**File:** `ai-service/src/middleware/auth.ts:99, 181-182, 297-298`

```typescript
(req as any).userToken = token;
(req as any).user = data.data.user;
```

These lose type safety. Express supports declaration merging to extend the Request type properly, which would catch type errors at compile time.

### 15. No Backoff on Outline API Calls
The AI service calls Outline's API for session validation on every authenticated request but has no retry or backoff logic. If Outline is slow or temporarily unavailable, all widget requests fail immediately. The gateway has retry logic (3 retries with 1s delay) but the AI service does not.

---

## Low-Severity Issues

### 16. Inconsistent Logging
- Gateway: Custom `log()` function with manual formatting
- AI Service: Winston logger with JSON format
- Widget Framework: `console.log` / `console.error`
- Auth middleware: Raw `console.warn` / `console.error`

This makes log aggregation and monitoring difficult. A consistent logging approach across all services would be preferable.

### 17. No Accessibility Attributes
The widget UI components contain zero `aria-*` attributes, `role` attributes, or `alt` text on SVG icons. Interactive elements (buttons, inputs, modals, tabs) have no keyboard navigation support. This makes the widgets unusable for assistive technology users.

### 18. Health Endpoint Exposes Configuration State
**File:** `ai-service/src/routes/admin.ts:208-230`

The `/health` endpoint (no auth required) reveals whether OpenAI and Outline keys are configured. While not a direct vulnerability, this is information leakage that helps attackers understand the deployment.

### 19. Hardcoded Magic Numbers
Constants like `MAX_FILE_SIZE = 10 * 1024 * 1024`, `HASH_CACHE_TTL = 60000`, `MAX_RETRIES = 3`, chunk size of 1000 chars, search limit of 5 results, and polling max of 120 attempts are scattered across files. These should be centralized configuration values.

### 20. TypeScript Strict Mode Inconsistency
- Gateway: `strict: false`
- Widget Framework: `strict: true`
- AI Service: `strict: true`

The gateway should use `strict: true` to match the rest of the project and catch type errors.

---

## Positive Observations

- **Parameterized SQL queries throughout** — no SQL injection risk detected
- **SRI hashes** computed for widget scripts
- **Zod validation** on all API input
- **Network isolation** in Docker (internal bridge network)
- **Graceful shutdown** handlers on all services
- **Environment-based configuration** with sensible defaults
- **Manifest-driven widget loading** — extensible architecture
- **Priority-based widget loading** with concurrency control

---

## Recommended Priority Order

If addressing these findings incrementally:

1. **Fix CSRF validation** (#1) — currently provides no protection
2. **Add rate limiting** (#7) — prevents API credit exhaustion
3. **Fix CSP headers** (#2) — use SRI hashes instead of unsafe-inline
4. **Use timingSafeEqual for admin secret** (#3) — one-line fix
5. **Sanitize innerHTML usage** (#6) — prevent XSS
6. **Add test infrastructure** (#5) — enables safe refactoring
7. **Encrypt API keys at rest** (#4) — protect credentials
8. **Clean up memory leaks** (#8) — polling and event listeners
9. **Refactor auth middleware** (#12) — reduce duplication
10. **Everything else** — incremental improvements
