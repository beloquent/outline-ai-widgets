import http, { IncomingMessage, ServerResponse } from 'http';
import https from 'https';
import httpProxy from 'http-proxy';
import crypto from 'crypto';
import zlib from 'zlib';
import { URL } from 'url';

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '5000', 10);
const OUTLINE_URL = process.env.OUTLINE_URL || `http://localhost:${process.env.OUTLINE_PORT || '3000'}`;
const WIDGET_URL = process.env.WIDGET_URL || `http://localhost:${process.env.WIDGET_PORT || '3003'}`;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:3001';
const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY === 'true';
const ENABLE_CSP = process.env.ENABLE_CSP !== 'false';
const GATEWAY_DEFAULT_PROTO = process.env.GATEWAY_DEFAULT_PROTO || 'https';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const levelStr = level.toUpperCase().padEnd(5);
    console.log(`${timestamp} [${levelStr}] [Gateway] ${message}${metaStr}`);
  }
}

function logRequest(req: IncomingMessage, target: string, startTime: number, statusCode?: number) {
  const duration = Date.now() - startTime;
  const method = req.method || 'GET';
  const url = req.url || '/';
  const status = statusCode || 0;
  
  if (CURRENT_LOG_LEVEL === 'debug') {
    log('debug', `${method} ${url} -> ${target}`, { status, duration: `${duration}ms`, headers: req.headers });
  } else {
    log('info', `${method} ${url} -> ${target} [${status}] ${duration}ms`);
  }
}

let cachedBootstrapHash = '';
let lastHashFetch = 0;
const HASH_CACHE_TTL = 60000;

async function fetchBootstrapHash(): Promise<string> {
  const now = Date.now();
  if (cachedBootstrapHash && (now - lastHashFetch) < HASH_CACHE_TTL) {
    return cachedBootstrapHash;
  }

  try {
    const response = await fetch(`${WIDGET_URL}/integrity`);
    if (response.ok) {
      const data = await response.json() as { bootstrapHash?: string };
      if (data.bootstrapHash) {
        cachedBootstrapHash = data.bootstrapHash;
        lastHashFetch = now;
        log('debug', `Fetched bootstrap SRI hash: ${cachedBootstrapHash}`);
        return cachedBootstrapHash;
      }
    }
  } catch (error) {
    log('warn', 'Failed to fetch bootstrap hash', { error: String(error) });
  }
  
  return cachedBootstrapHash;
}

function getWidgetBootstrapScript(integrity: string): string {
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

function generateCspHeader(bootstrapHash: string): string {
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
    // Allow form submissions to https: so OAuth providers (Google, Slack,
    // Microsoft, email magic-link callbacks) work. Without https:, the browser
    // silently blocks OAuth form submissions and only passkey auth works.
    `form-action 'self' https:`,
  ];

  return directives.join('; ');
}

// Paths where the widget bootstrap should NOT be injected — primarily auth
// flows, where injecting JS on unauthenticated pages can race with Outline's
// auth redirects and cause issues (e.g. only passkey offered for sign-in).
const WIDGET_INJECTION_SKIP_PREFIXES = ['/auth/', '/auth.', '/login', '/signup', '/logout'];
function shouldSkipWidgetInjection(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0];
  return WIDGET_INJECTION_SKIP_PREFIXES.some(prefix =>
    path === prefix || path === prefix.replace(/\/$/, '') || path.startsWith(prefix),
  );
}

function generateErrorPage(serviceName: string, errorMessage: string, retryCount: number): string {
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface HealthCheckResult {
  healthy: boolean;
  error?: string;
}

function checkServiceHealth(targetUrl: string): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const url = new URL(targetUrl);
    const isHttps = url.protocol === 'https:';
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: '/',
      method: 'HEAD',
      timeout: 2000,
    };
    
    const requestModule = isHttps ? https : http;
    const req = requestModule.request(options, (res) => {
      resolve({ healthy: true });
    });
    
    req.on('error', (err: Error) => {
      resolve({ healthy: false, error: err.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: 'Connection timeout' });
    });
    
    req.end();
  });
}

async function waitForServiceWithRetry(
  targetUrl: string,
  serviceName: string,
  res: ServerResponse
): Promise<boolean> {
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

const outlineProxy = httpProxy.createProxyServer({
  target: OUTLINE_URL,
  selfHandleResponse: true,
  ws: true,
  changeOrigin: true,
});

const widgetProxy = httpProxy.createProxyServer({
  target: WIDGET_URL,
  changeOrigin: true,
});

const aiProxy = httpProxy.createProxyServer({
  target: AI_SERVICE_URL,
  changeOrigin: true,
});

outlineProxy.on('proxyReq', (proxyReq: http.ClientRequest, req: IncomingMessage) => {
  // Forward proxy headers so Outline sees the original protocol/host
  // (critical when FORCE_HTTPS=true to prevent redirect loops)
  proxyReq.setHeader('X-Forwarded-Proto', req.headers['x-forwarded-proto'] || GATEWAY_DEFAULT_PROTO);
  proxyReq.setHeader('X-Forwarded-Host', req.headers['host'] || '');
  proxyReq.setHeader('X-Forwarded-For', req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');

  const acceptHeader = req.headers['accept'] || '';
  const isHtmlRequest = acceptHeader.includes('text/html') || req.url === '/' || !req.url?.includes('.');

  if (isHtmlRequest && (req.method === 'GET' || req.method === 'HEAD')) {
    proxyReq.setHeader('Accept-Encoding', 'identity');
  }
});

outlineProxy.on('proxyRes', async (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) => {
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

    // Remove any existing CSP headers from Outline to prevent conflicts
    // (Outline sends lowercase headers; browsers enforce the most restrictive
    // of multiple CSP headers, which would block our injected inline script)
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

    // Decompress response if Outline sent compressed content despite Accept-Encoding: identity
    let stream: NodeJS.ReadableStream = proxyRes;
    if (contentEncoding === 'gzip') {
      log('info', 'Decompressing gzip response from Outline');
      stream = proxyRes.pipe(zlib.createGunzip());
    } else if (contentEncoding === 'deflate') {
      log('info', 'Decompressing deflate response from Outline');
      stream = proxyRes.pipe(zlib.createInflate());
    } else if (contentEncoding === 'br') {
      log('info', 'Decompressing brotli response from Outline');
      stream = proxyRes.pipe(zlib.createBrotliDecompress());
    }

    let body = '';
    stream.on('data', (chunk: Buffer) => {
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

      // Skip injection on auth pages to avoid interfering with the OAuth flow
      if (shouldSkipWidgetInjection(req.url)) {
        log('info', `Skipping widget injection on auth path ${req.url}`);
        res.end(body);
        return;
      }

      // Remove Outline's CSP meta tag so our header-based CSP takes precedence
      // (Outline uses nonce-based CSP in meta tags which blocks our injected script)
      const cspMetaRegex = /<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi;
      const strippedBody = body.replace(cspMetaRegex, '<!-- CSP meta removed by Gateway -->');
      const cspMetaRemoved = strippedBody !== body;
      log('info', 'CSP meta tag handling', { removed: cspMetaRemoved });

      const widgetScript = getWidgetBootstrapScript(bootstrapHash);
      const injectedBody = strippedBody.replace(
        '</head>',
        `${widgetScript}</head>`
      );
      log('info', `Widget bootstrap injected into ${req.url}`);
      res.end(injectedBody);
    });
    stream.on('error', (err: Error) => {
      log('error', 'Failed to decompress response from Outline', { error: err.message });
      res.end();
    });
  } else {
    if (isGetRequest && !isHtml) {
      log('debug', `Non-HTML response from Outline, skipping injection`, { contentType, statusCode });
    }
    res.writeHead(statusCode, headers);
    proxyRes.pipe(res);
  }
});

outlineProxy.on('error', (err: Error, _req: IncomingMessage, res: ServerResponse | import('net').Socket) => {
  log('error', 'Outline proxy error', { error: err.message, stack: err.stack });
  if (res instanceof http.ServerResponse && !res.headersSent) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateErrorPage('Outline', err.message, MAX_RETRIES));
  }
});

widgetProxy.on('error', (err: Error, _req: IncomingMessage, res: ServerResponse | import('net').Socket) => {
  log('error', 'Widget proxy error', { error: err.message, stack: err.stack });
  if (res instanceof http.ServerResponse && !res.headersSent) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateErrorPage('Widget Framework', err.message, MAX_RETRIES));
  }
});

aiProxy.on('error', (err: Error, _req: IncomingMessage, res: ServerResponse | import('net').Socket) => {
  log('error', 'AI Service proxy error', { error: err.message, stack: err.stack });
  if (res instanceof http.ServerResponse && !res.headersSent) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateErrorPage('AI Service', err.message, MAX_RETRIES));
  }
});

const server = http.createServer(async (req, res) => {
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
  } else if (url.startsWith('/ai/')) {
    target = 'AI Service';
    const isReady = await waitForServiceWithRetry(AI_SERVICE_URL, 'AI Service', res);
    if (isReady) {
      aiProxy.web(req, res);
    }
  } else {
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
  // Forward X-Forwarded-Proto for WebSocket upgrades — the 'proxyReq' event
  // only fires for HTTP requests (web()), not WebSocket upgrades (ws()).
  // Without this header, Outline's FORCE_HTTPS middleware rejects the
  // WebSocket connection, breaking Yjs collaborative editing and making
  // the ProseMirror editor read-only.
  if (!req.headers['x-forwarded-proto']) {
    req.headers['x-forwarded-proto'] = GATEWAY_DEFAULT_PROTO;
  }
  if (!req.headers['x-forwarded-host'] && req.headers['host']) {
    req.headers['x-forwarded-host'] = req.headers['host'];
  }
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
