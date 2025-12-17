"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const http_proxy_1 = __importDefault(require("http-proxy"));
const url_1 = require("url");
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '5000', 10);
const OUTLINE_URL = process.env.OUTLINE_URL || `http://localhost:${process.env.OUTLINE_PORT || '3000'}`;
const WIDGET_URL = process.env.WIDGET_URL || `http://localhost:${process.env.WIDGET_PORT || '3003'}`;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:3001';
const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY === 'true';
const ENABLE_CSP = process.env.ENABLE_CSP !== 'false';
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
    const integrityAttr = integrity ? ` integrity="${integrity}" crossorigin="anonymous"` : '';
    return `
<script>
(function() {
  var script = document.createElement('script');
  script.src = '/widget-framework/bootstrap.js';
  script.async = true;${integrity ? `
  script.integrity = '${integrity}';
  script.crossOrigin = 'anonymous';` : ''}
  script.onerror = function() {
    console.warn('[Widget Framework] Bootstrap failed to load');
  };
  document.head.appendChild(script);
})();
</script>
`;
}
function generateCspHeader(bootstrapHash) {
    const directives = [
        `default-src 'self'`,
        `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: blob: https:`,
        `font-src 'self' data:`,
        `connect-src 'self' wss: ws: https:`,
        `frame-ancestors 'self'`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
    ];
    return directives.join('; ');
}
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
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function checkServiceHealth(targetUrl) {
    return new Promise((resolve) => {
        const url = new url_1.URL(targetUrl);
        const isHttps = url.protocol === 'https:';
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: '/',
            method: 'HEAD',
            timeout: 2000,
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
async function waitForServiceWithRetry(targetUrl, serviceName, res) {
    let lastError = 'Unknown error';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const result = await checkServiceHealth(targetUrl);
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
const outlineProxy = http_proxy_1.default.createProxyServer({
    target: OUTLINE_URL,
    selfHandleResponse: true,
    ws: true,
});
const widgetProxy = http_proxy_1.default.createProxyServer({
    target: WIDGET_URL,
});
const aiProxy = http_proxy_1.default.createProxyServer({
    target: AI_SERVICE_URL,
});
outlineProxy.on('proxyReq', (proxyReq, req) => {
    const acceptHeader = req.headers['accept'] || '';
    const isHtmlRequest = acceptHeader.includes('text/html') || req.url === '/' || !req.url?.includes('.');
    if (isHtmlRequest && (req.method === 'GET' || req.method === 'HEAD')) {
        proxyReq.setHeader('Accept-Encoding', 'identity');
    }
});
outlineProxy.on('proxyRes', async (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || '';
    const isHtml = contentType.includes('text/html');
    const isGetRequest = req.method === 'GET' || req.method === 'HEAD';
    const headers = { ...proxyRes.headers };
    if (isHtml && isGetRequest) {
        delete headers['content-length'];
        delete headers['content-encoding'];
        const bootstrapHash = await fetchBootstrapHash();
        if (ENABLE_CSP) {
            const cspHeader = generateCspHeader(bootstrapHash);
            const cspHeaderName = CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
            headers[cspHeaderName] = cspHeader;
        }
        headers['X-Content-Type-Options'] = 'nosniff';
        headers['X-Frame-Options'] = 'SAMEORIGIN';
        headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
        res.writeHead(proxyRes.statusCode || 200, headers);
        let body = '';
        proxyRes.on('data', (chunk) => {
            body += chunk.toString();
        });
        proxyRes.on('end', () => {
            const widgetScript = getWidgetBootstrapScript(bootstrapHash);
            const injectedBody = body.replace('</head>', `${widgetScript}</head>`);
            res.end(injectedBody);
        });
    }
    else {
        res.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(res);
    }
});
outlineProxy.on('error', (err, _req, res) => {
    log('error', 'Outline proxy error', { error: err.message, stack: err.stack });
    if (res instanceof http_1.default.ServerResponse && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateErrorPage('Outline', err.message, MAX_RETRIES));
    }
});
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
const server = http_1.default.createServer(async (req, res) => {
    const url = req.url || '/';
    const startTime = Date.now();
    let target = 'Outline';
    if (url.startsWith('/widget-framework/')) {
        target = 'Widget Framework';
        const rewrittenUrl = url.replace('/widget-framework', '');
        req.url = rewrittenUrl || '/';
        const isReady = await waitForServiceWithRetry(WIDGET_URL, 'Widget Framework', res);
        if (isReady) {
            widgetProxy.web(req, res);
        }
    }
    else if (url.startsWith('/ai/')) {
        target = 'AI Service';
        const isReady = await waitForServiceWithRetry(AI_SERVICE_URL, 'AI Service', res);
        if (isReady) {
            aiProxy.web(req, res);
        }
    }
    else {
        const isReady = await waitForServiceWithRetry(OUTLINE_URL, 'Outline', res);
        if (isReady) {
            outlineProxy.web(req, res);
        }
    }
    res.on('finish', () => {
        logRequest(req, target, startTime, res.statusCode);
    });
});
server.on('upgrade', (req, socket, head) => {
    outlineProxy.ws(req, socket, head);
});
server.listen(GATEWAY_PORT, '0.0.0.0', () => {
    log('info', `Gateway started`, { port: GATEWAY_PORT, logLevel: CURRENT_LOG_LEVEL });
    log('info', `Proxying Outline from ${OUTLINE_URL}`);
    log('info', `Proxying Widget Framework from ${WIDGET_URL}`);
    log('info', `Proxying AI Service from ${AI_SERVICE_URL}`);
    log('info', `Retry policy: ${MAX_RETRIES} attempts with ${RETRY_DELAY_MS}ms delay`);
    log('debug', 'Injecting widget bootstrap into HTML responses');
});
process.on('SIGTERM', () => {
    log('info', 'Received SIGTERM, shutting down...');
    server.close(() => {
        log('info', 'Gateway shutdown complete');
        process.exit(0);
    });
});
