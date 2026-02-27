import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.WIDGET_PORT || process.env.WIDGET_FRAMEWORK_PORT || 3003;
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL || 'info');
function log(level, message, meta) {
    if (LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL]) {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        const levelStr = level.toUpperCase().padEnd(5);
        console.log(`${timestamp} [${levelStr}] [Widget Framework] ${message}${metaStr}`);
    }
}
function computeSriHash(content) {
    const hash = crypto.createHash('sha384').update(content, 'utf8').digest('base64');
    return `sha384-${hash}`;
}
const bootstrapScript = `
(async function() {
  'use strict';
  
  if (window.__WIDGET_FRAMEWORK_LOADED__) return;
  window.__WIDGET_FRAMEWORK_LOADED__ = true;
  
  const FRAMEWORK_URL = window.location.origin + '/widget-framework';
  
  async function init() {
    try {
      const frameworkModule = await import(FRAMEWORK_URL + '/framework/index.js');
      
      const initFn = window.initializeWidgetFramework || frameworkModule.initializeFramework;
      
      if (initFn) {
        await initFn({
          manifestUrl: FRAMEWORK_URL + '/widgets/manifest.json',
          autoLoad: true,
        });
        console.log('[Widget Framework] Bootstrap complete');
      } else {
        console.error('[Widget Framework] initializeWidgetFramework not found');
      }
    } catch (error) {
      console.error('[Widget Framework] Bootstrap failed:', error);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
const bootstrapHash = computeSriHash(bootstrapScript);
log('debug', `Bootstrap SRI hash computed: ${bootstrapHash}`);
const integrityHashes = {
    'bootstrap.js': bootstrapHash,
};
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json());
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const method = req.method;
        const path = req.path;
        const status = res.statusCode;
        if (status >= 400) {
            log('warn', `${method} ${path} [${status}] ${duration}ms`);
        }
        else if (CURRENT_LOG_LEVEL === 'debug') {
            log('debug', `${method} ${path}`, { status, duration: `${duration}ms` });
        }
    });
    next();
});
app.use('/widgets', express.static(path.join(__dirname, 'widgets')));
app.use('/framework', express.static(__dirname));
app.get('/widgets/manifest.json', (req, res) => {
    const aiCopilotPath = path.join(__dirname, 'widgets', 'ai-copilot.js');
    const aiSettingsPath = path.join(__dirname, 'widgets', 'ai-settings.js');
    let aiCopilotHash = '';
    let aiSettingsHash = '';
    try {
        if (fs.existsSync(aiCopilotPath)) {
            const content = fs.readFileSync(aiCopilotPath, 'utf8');
            aiCopilotHash = computeSriHash(content);
        }
    }
    catch (e) { }
    try {
        if (fs.existsSync(aiSettingsPath)) {
            const content = fs.readFileSync(aiSettingsPath, 'utf8');
            aiSettingsHash = computeSriHash(content);
        }
    }
    catch (e) { }
    const manifest = {
        version: '1.0.0',
        widgets: [
            {
                id: 'ai-copilot',
                name: 'AI Copilot',
                version: '1.0.0',
                bundle: '/widget-framework/widgets/ai-copilot.js',
                integrity: aiCopilotHash,
                priority: 90,
                enabled: true,
                mountPoint: {
                    type: 'floating',
                    position: 'bottom-right',
                },
                permissions: ['documents.read'],
            },
            {
                id: 'ai-settings',
                name: 'AI Settings',
                version: '1.0.0',
                bundle: '/widget-framework/widgets/ai-settings.js',
                integrity: aiSettingsHash,
                priority: 100,
                enabled: true,
                autoLoad: true,
                mountPoint: {
                    type: 'modal',
                },
                permissions: [],
            },
        ],
        bootstrapIntegrity: bootstrapHash,
    };
    res.json(manifest);
});
app.get('/integrity', (req, res) => {
    res.json({
        success: true,
        hashes: integrityHashes,
        bootstrapHash,
    });
});
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'widget-framework',
        timestamp: new Date().toISOString(),
    });
});
app.get('/bootstrap.js', (req, res) => {
    res.type('application/javascript').send(bootstrapScript);
});
app.listen(Number(PORT), '0.0.0.0', () => {
    log('info', `Server started`, { port: PORT, logLevel: CURRENT_LOG_LEVEL });
    log('info', `Health check: http://localhost:${PORT}/health`);
    log('debug', `Bootstrap: http://localhost:${PORT}/bootstrap.js`);
    log('debug', `Manifest: http://localhost:${PORT}/widgets/manifest.json`);
});
//# sourceMappingURL=server.js.map