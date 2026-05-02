"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const http_proxy_1 = __importDefault(require("http-proxy"));
const zlib_1 = __importDefault(require("zlib"));
const url_1 = require("url");
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '5000', 10);
const OUTLINE_URL = process.env.OUTLINE_URL || `http://localhost:${process.env.OUTLINE_PORT || '3000'}`;
const WIDGET_URL = process.env.WIDGET_URL || `http://localhost:${process.env.WIDGET_PORT || '3003'}`;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:3001';
const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY === 'true';
const ENABLE_CSP = process.env.ENABLE_CSP !== 'false';
const GATEWAY_DEFAULT_PROTO = process.env.GATEWAY_DEFAULT_PROTO || 'https';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL || 'info');
function log(level, message, meta) {
    if (LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        const levelStr = level.toUpperCase().padEnd(5);
        console.log(`${timestamp} [${levelStr}] [Gateway] ${message}${metaStr}`);
    }
}
function logRequest(req, target, startTime, statusCode) {
    const duration = Date.now() - startTime;
    const method = req.method || 'GET';
    const url = req.url || '/';
    const status = statusCode || 0;
    if (CURRENT_LOG_LEVEL === 'debug') {
        log('debug', `${method} ${url} -> ${target}`, { status, duration: `${duration}ms`, headers: req.headers });
    }
    else {
        log('info', `${method} ${url} -> ${target} [${status}] ${duration}ms`);
    }
}
// ---------------------------------------------------------------------------
// SRI hash for widget bootstrap script
// ---------------------------------------------------------------------------
let cachedBootstrapHash = '';
let lastHashFetch = 0;
const HASH_CACHE_TTL = 60000;
async function fetchBootstrapHash() {
    const now = Date.now();
    if (cachedBootstrapHash && (now - lastHashFetch) < HASH_CACHE_TTL) {
        return cachedBootstrapHash;
    }
    try {
        const response = await fetch(`${WIDGET_URL}/integrity`);
        if (response.ok) {
            const data = await response.json();
            if (data.bootstrapHash) {
                cachedBootstrapHash = data.bootstrapHash;
                lastHashFetch = now;
                log('debug', `Fetched bootstrap SRI hash: ${cachedBootstrapHash}`);
                return cachedBootstrapHash;
            }
        }
    }
    catch (error) {
        log('warn', 'Failed to fetch bootstrap hash', { error: String(error) });
    }
    return cachedBootstrapHash;
}
function getWidgetBootstrapScript(integrity) {
    return `
<script>
(function() {
  console.log('[Widget Framework] Injection active - loading bootstrap');
  var script = document.createElement('script');
  script.src = '/widget-framework/bootstrap.js';
  script.async = true;${integrity ? `
  script.integrity = '${integrity}';` : ''}
  script.onerror = function(e) {
    console.error('[Widget Framework] Bootstrap failed to load', e);
  };
  script.onload = function() {
    console.log('[Widget Framework] Bootstrap script loaded successfully');
  };
  document.head.appendChild(script);
})();
</script>
`;
}
// ---------------------------------------------------------------------------
// Content Security Policy
// ---------------------------------------------------------------------------
function generateCspHeader(bootstrapHash) {
    const directives = [
        `default-src 'self'`,
        `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: blob: https:`,
        `font-src 'self' data:`,
        `connect-src 'self' wss: ws: https:`,
        `frame-src 'self' https:`,
        `frame-ancestors 'self'`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self' https:`,
    ];
    return directives.join('; ');
}
// ---------------------------------------------------------------------------
// Auth-page widget-injection skip list
// ---------------------------------------------------------------------------
const WIDGET_INJECTION_SKIP_PREFIXES = ['/auth/', '/auth.', '/login', '/signup', '/logout'];
function shouldSkipWidgetInjection(url) {
    if (!url)
        return false;
    const path = url.split('?')[0];
    return WIDGET_INJECTION_SKIP_PREFIXES.some(prefix => path === prefix || path === prefix.replace(/\/$/, '') || path.startsWith(prefix));
}
// ---------------------------------------------------------------------------
// Passthrough path detection – these routes go to Outline WITHOUT response
// modification (no selfHandleResponse, no HTML injection, no CSP rewrite).
// ---------------------------------------------------------------------------
function isPassthroughPath(url) {
    const path = url.split('?')[0];
    return (path.startsWith('/api/') ||
        path === '/api' ||
        path.startsWith('/auth/') ||
        path === '/auth' ||
        path.startsWith('/static/') ||
        path.startsWith('/realtime'));
}
// ---------------------------------------------------------------------------
// Service-starting error page
// ---------------------------------------------------------------------------
function generateErrorPage(serviceName, errorMessage, retryCount) {
    const timestamp = new Date().toISOString();
    const refreshSeconds = 5;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="${refreshSeconds}">
  <title>Service Starting Up</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 500px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .spinner {
      width: 60px;
      height: 60px;
      border: 4px solid #e5e7eb;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h1 {
      color: #1f2937;
      font-size: 24px;
      margin-bottom: 12px;
    }
    .subtitle {
      color: #6b7280;
      font-size: 16px;
      margin-bottom: 32px;
    }
    .details {
      background: #f9fafb;
      border-radius: 8px;
      padding: 20px;
      text-align: left;
      margin-bottom: 24px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: #6b7280;
      font-weight: 500;
    }
    .detail-value {
      color: #1f2937;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .error-value {
      color: #dc2626;
    }
    .countdown {
      color: #667eea;
      font-weight: 600;
      font-size: 18px;
    }
    .countdown-label {
      color: #6b7280;
      font-size: 14px;
      margin-top: 4px;
    }
    .manual-refresh {
      margin-top: 20px;
    }
    .manual-refresh a {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
    }
    .manual-refresh a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Service Starting Up</h1>
    <p class="subtitle">Please wait while the application initializes...</p>

    <div class="details">
      <div class="detail-row">
        <span class="detail-label">Service</span>
        <span class="detail-value">${serviceName}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value error-value">${errorMessage}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Retry Attempts</span>
        <span class="detail-value">${retryCount} / ${MAX_RETRIES}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Timestamp</span>
        <span class="detail-value">${timestamp}</span>
      </div>
    </div>

    <div class="countdown" id="countdown">${refreshSeconds}</div>
    <div class="countdown-label">seconds until auto-refresh</div>

    <div class="manual-refresh">
      <a href="javascript:location.reload()">Refresh now</a>
    </div>
  </div>

  <script>
    (function() {
      var seconds = ${refreshSeconds};
      var countdownEl = document.getElementById('countdown');
      setInterval(function() {
        seconds--;
        if (seconds >= 0) {
          countdownEl.textContent = seconds;
        }
      }, 1000);
    })();
  </script>
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function checkServiceHealth(targetUrl, healthPath = '/health') {
    return new Promise((resolve) => {
        const url = new url_1.URL(targetUrl);
        const isHttps = url.protocol === 'https:';
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: healthPath,
            method: 'GET',
            timeout: 2000,
            headers: {
                'X-Forwarded-Proto': GATEWAY_DEFAULT_PROTO,
            },
        };
        const requestModule = isHttps ? https_1.default : http_1.default;
        const req = requestModule.request(options, (res) => {
            resolve({ healthy: true });
        });
        req.on('error', (err) => {
            resolve({ healthy: false, error: err.message });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ healthy: false, error: 'Connection timeout' });
        });
        req.end();
    });
}
async function waitForServiceWithRetry(targetUrl, serviceName, res, healthPath = '/health') {
    let lastError = 'Unknown error';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const result = await checkServiceHealth(targetUrl, healthPath);
        if (result.healthy) {
            log('debug', `${serviceName} health check passed`, { attempt });
            return true;
        }
        lastError = result.error || 'Connection failed';
        log('warn', `${serviceName} attempt ${attempt}/${MAX_RETRIES}: ${lastError}`, { service: serviceName, attempt, maxRetries: MAX_RETRIES });
        if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS);
        }
    }
    log('error', `${serviceName} unavailable after ${MAX_RETRIES} attempts`, { service: serviceName, lastError, attempts: MAX_RETRIES });
    if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateErrorPage(serviceName, lastError, MAX_RETRIES));
    }
    return false;
}
// Cached health state per service — avoids a health-check round-trip on every
// single request once the target has been confirmed reachable.
const healthCache = {};
const HEALTH_CACHE_TTL_OK = 30_000; // 30 s after a successful check
const HEALTH_CACHE_TTL_FAIL = 5_000; // 5 s after a failed check (retry sooner)
function invalidateHealth(targetUrl) {
    delete healthCache[targetUrl];
}
async function ensureServiceReady(targetUrl, serviceName, res, healthPath = '/health') {
    const cached = healthCache[targetUrl];
    if (cached) {
        const ttl = cached.healthy ? HEALTH_CACHE_TTL_OK : HEALTH_CACHE_TTL_FAIL;
        if (Date.now() - cached.ts < ttl) {
            if (cached.healthy)
                return true;
            if (!res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(generateErrorPage(serviceName, 'Service unavailable (cached)', 0));
            }
            return false;
        }
    }
    const ok = await waitForServiceWithRetry(targetUrl, serviceName, res, healthPath);
    healthCache[targetUrl] = { healthy: ok, ts: Date.now() };
    return ok;
}
// ---------------------------------------------------------------------------
// Proxy instances
// ---------------------------------------------------------------------------
// Passthrough proxy — for /api, /auth, /static, and WebSocket.
// No selfHandleResponse: http-proxy handles the full request+response lifecycle
// untouched, which is critical for POST bodies (API calls) and auth redirects.
const outlinePassthroughProxy = http_proxy_1.default.createProxyServer({
    target: OUTLINE_URL,
    ws: true,
    changeOrigin: true,
});
// HTML injection proxy — for document pages (/, /doc/*, /collection/*, etc.)
// selfHandleResponse lets us buffer the HTML, strip CSP meta tags, and inject
// the widget bootstrap script before sending.
const outlineHtmlProxy = http_proxy_1.default.createProxyServer({
    target: OUTLINE_URL,
    selfHandleResponse: true,
    changeOrigin: true,
});
const widgetProxy = http_proxy_1.default.createProxyServer({
    target: WIDGET_URL,
    changeOrigin: true,
});
const aiProxy = http_proxy_1.default.createProxyServer({
    target: AI_SERVICE_URL,
    changeOrigin: true,
});
// ---------------------------------------------------------------------------
// Shared helper — sets X-Forwarded-* headers on proxied requests so Outline
// sees the correct protocol/host (critical with FORCE_HTTPS=true).
// ---------------------------------------------------------------------------
function setForwardedHeaders(proxyReq, req) {
    proxyReq.setHeader('X-Forwarded-Proto', req.headers['x-forwarded-proto'] || GATEWAY_DEFAULT_PROTO);
    proxyReq.setHeader('X-Forwarded-Host', req.headers['host'] || '');
    proxyReq.setHeader('X-Forwarded-For', req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
}
// ---------------------------------------------------------------------------
// Passthrough proxy events
// ---------------------------------------------------------------------------
outlinePassthroughProxy.on('proxyReq', (proxyReq, req) => {
    setForwardedHeaders(proxyReq, req);
    log('debug', `[passthrough] proxying ${req.method} ${req.url}`);
});
outlinePassthroughProxy.on('error', (err, req, res) => {
    invalidateHealth(OUTLINE_URL);
    log('error', 'Outline passthrough proxy error', { error: err.message, url: req.url, stack: err.stack });
    if (res instanceof http_1.default.ServerResponse && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateErrorPage('Outline', err.message, MAX_RETRIES));
    }
});
// ---------------------------------------------------------------------------
// HTML injection proxy events
// ---------------------------------------------------------------------------
outlineHtmlProxy.on('proxyReq', (proxyReq, req) => {
    setForwardedHeaders(proxyReq, req);
    // Always request uncompressed so we can modify the HTML body
    proxyReq.setHeader('Accept-Encoding', 'identity');
    log('debug', `[html] proxying ${req.method} ${req.url}`);
});
outlineHtmlProxy.on('proxyRes', async (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || '';
    const contentEncoding = proxyRes.headers['content-encoding'] || '';
    const statusCode = proxyRes.statusCode || 200;
    const isHtml = contentType.includes('text/html');
    const isGetRequest = req.method === 'GET' || req.method === 'HEAD';
    log('debug', `Outline response for ${req.url}`, {
        statusCode,
        contentType,
        contentEncoding: contentEncoding || 'none',
        isHtml,
        isGetRequest,
    });
    const headers = { ...proxyRes.headers };
    if (isHtml && isGetRequest) {
        delete headers['content-length'];
        delete headers['content-encoding'];
        delete headers['content-security-policy'];
        delete headers['content-security-policy-report-only'];
        const bootstrapHash = await fetchBootstrapHash();
        log('debug', 'Bootstrap hash for injection', { hash: bootstrapHash || '(none)' });
        if (ENABLE_CSP) {
            const cspHeader = generateCspHeader(bootstrapHash);
            const cspHeaderName = CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
            headers[cspHeaderName] = cspHeader;
        }
        headers['X-Content-Type-Options'] = 'nosniff';
        headers['X-Frame-Options'] = 'SAMEORIGIN';
        headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
        res.writeHead(statusCode, headers);
        let stream = proxyRes;
        if (contentEncoding === 'gzip') {
            log('info', 'Decompressing gzip response from Outline');
            stream = proxyRes.pipe(zlib_1.default.createGunzip());
        }
        else if (contentEncoding === 'deflate') {
            log('info', 'Decompressing deflate response from Outline');
            stream = proxyRes.pipe(zlib_1.default.createInflate());
        }
        else if (contentEncoding === 'br') {
            log('info', 'Decompressing brotli response from Outline');
            stream = proxyRes.pipe(zlib_1.default.createBrotliDecompress());
        }
        let body = '';
        stream.on('data', (chunk) => {
            body += chunk.toString();
        });
        stream.on('end', () => {
            const hasHeadTag = body.includes('</head>');
            log('debug', 'HTML body analysis', {
                bodyLength: body.length,
                hasHeadTag,
                firstChars: body.substring(0, 100),
            });
            if (!hasHeadTag) {
                log('warn', 'No </head> tag found in HTML response - widget injection skipped');
                res.end(body);
                return;
            }
            if (shouldSkipWidgetInjection(req.url)) {
                log('info', `Skipping widget injection on auth path ${req.url}`);
                res.end(body);
                return;
            }
            const cspMetaRegex = /<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi;
            const strippedBody = body.replace(cspMetaRegex, '<!-- CSP meta removed by Gateway -->');
            const cspMetaRemoved = strippedBody !== body;
            log('info', 'CSP meta tag handling', { removed: cspMetaRemoved });
            const widgetScript = getWidgetBootstrapScript(bootstrapHash);
            const injectedBody = strippedBody.replace('</head>', `${widgetScript}</head>`);
            log('info', `Widget bootstrap injected into ${req.url}`);
            res.end(injectedBody);
        });
        stream.on('error', (err) => {
            log('error', 'Failed to decompress response from Outline', { error: err.message });
            res.end();
        });
    }
    else {
        // Non-HTML response (redirect, JSON, etc.) — pipe through unmodified
        log('debug', `Non-HTML response via HTML proxy, piping through`, { contentType, statusCode });
        res.writeHead(statusCode, headers);
        proxyRes.pipe(res);
    }
});
outlineHtmlProxy.on('error', (err, req, res) => {
    invalidateHealth(OUTLINE_URL);
    log('error', 'Outline HTML proxy error', { error: err.message, url: req.url, stack: err.stack });
    if (res instanceof http_1.default.ServerResponse && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateErrorPage('Outline', err.message, MAX_RETRIES));
    }
});
// ---------------------------------------------------------------------------
// Widget + AI proxy events
// ---------------------------------------------------------------------------
widgetProxy.on('error', (err, _req, res) => {
    log('error', 'Widget proxy error', { error: err.message, stack: err.stack });
    if (res instanceof http_1.default.ServerResponse && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateErrorPage('Widget Framework', err.message, MAX_RETRIES));
    }
});
aiProxy.on('error', (err, _req, res) => {
    log('error', 'AI Service proxy error', { error: err.message, stack: err.stack });
    if (res instanceof http_1.default.ServerResponse && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateErrorPage('AI Service', err.message, MAX_RETRIES));
    }
});
// ---------------------------------------------------------------------------
// HTTP request handler
// ---------------------------------------------------------------------------
const server = http_1.default.createServer(async (req, res) => {
    const url = req.url || '/';
    const startTime = Date.now();
    let target = 'Outline';
    // -----------------------------------------------------------------------
    // Gateway diagnostic endpoint — use this to verify requests reach the
    // Gateway and to inspect its routing/configuration.
    // -----------------------------------------------------------------------
    if (url === '/_gateway/health' || url === '/_gateway/health/') {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.round(process.uptime()),
            config: {
                port: GATEWAY_PORT,
                outlineUrl: OUTLINE_URL,
                widgetUrl: WIDGET_URL,
                aiServiceUrl: AI_SERVICE_URL,
                defaultProto: GATEWAY_DEFAULT_PROTO,
                cspEnabled: ENABLE_CSP,
                logLevel: CURRENT_LOG_LEVEL,
            },
            routing: {
                '/widget-framework/*': 'Widget Framework',
                '/ai/*': 'AI Service',
                '/api/*': 'Outline (passthrough)',
                '/auth/*': 'Outline (passthrough)',
                '/static/*': 'Outline (passthrough)',
                '/realtime': 'Outline (passthrough)',
                '/*': 'Outline (HTML injection)',
            },
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
        logRequest(req, 'Gateway', startTime, 200);
        return;
    }
    // -----------------------------------------------------------------------
    // Route to the appropriate backend
    // -----------------------------------------------------------------------
    if (url.startsWith('/widget-framework/')) {
        target = 'Widget Framework';
        const rewrittenUrl = url.replace('/widget-framework', '');
        req.url = rewrittenUrl || '/';
        const isReady = await ensureServiceReady(WIDGET_URL, 'Widget Framework', res);
        if (isReady) {
            widgetProxy.web(req, res);
        }
    }
    else if (url.startsWith('/ai/')) {
        target = 'AI Service';
        const isReady = await ensureServiceReady(AI_SERVICE_URL, 'AI Service', res, '/ai/health');
        if (isReady) {
            aiProxy.web(req, res);
        }
    }
    else if (isPassthroughPath(url)) {
        // API, auth, static, realtime — passthrough to Outline without any
        // response modification.  This avoids selfHandleResponse which can
        // interfere with POST bodies and non-HTML response lifecycles.
        target = 'Outline (passthrough)';
        log('debug', `Routing to passthrough proxy`, { method: req.method, url });
        const isReady = await ensureServiceReady(OUTLINE_URL, 'Outline', res, '/');
        if (isReady) {
            outlinePassthroughProxy.web(req, res);
        }
    }
    else {
        // Document pages and everything else — HTML injection proxy
        target = 'Outline (HTML)';
        log('debug', `Routing to HTML injection proxy`, { method: req.method, url });
        const isReady = await ensureServiceReady(OUTLINE_URL, 'Outline', res, '/');
        if (isReady) {
            outlineHtmlProxy.web(req, res);
        }
    }
    res.on('finish', () => {
        logRequest(req, target, startTime, res.statusCode);
    });
});
// ---------------------------------------------------------------------------
// WebSocket upgrade — uses the passthrough proxy (ws: true)
// ---------------------------------------------------------------------------
server.on('upgrade', (req, socket, head) => {
    if (!req.headers['x-forwarded-proto']) {
        req.headers['x-forwarded-proto'] = GATEWAY_DEFAULT_PROTO;
    }
    if (!req.headers['x-forwarded-host'] && req.headers['host']) {
        req.headers['x-forwarded-host'] = req.headers['host'];
    }
    log('debug', `WebSocket upgrade: ${req.url}`, { proto: req.headers['x-forwarded-proto'] });
    outlinePassthroughProxy.ws(req, socket, head);
});
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(GATEWAY_PORT, '0.0.0.0', () => {
    log('info', `Gateway started`, { port: GATEWAY_PORT, logLevel: CURRENT_LOG_LEVEL });
    log('info', `Proxying Outline from ${OUTLINE_URL}`);
    log('info', `  passthrough paths: /api/*, /auth/*, /static/*, /realtime`);
    log('info', `  HTML injection:    all other paths`);
    log('info', `Proxying Widget Framework from ${WIDGET_URL}`);
    log('info', `Proxying AI Service from ${AI_SERVICE_URL}`);
    log('info', `Default protocol: ${GATEWAY_DEFAULT_PROTO}`);
    log('info', `Retry policy: ${MAX_RETRIES} attempts with ${RETRY_DELAY_MS}ms delay`);
    log('info', `Diagnostic endpoint: /_gateway/health`);
});
process.on('SIGTERM', () => {
    log('info', 'Received SIGTERM, shutting down...');
    server.close(() => {
        log('info', 'Gateway shutdown complete');
        process.exit(0);
    });
});
