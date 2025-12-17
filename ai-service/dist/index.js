"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const settings_1 = require("./config/settings");
const logger_1 = require("./config/logger");
const connection_1 = require("./db/connection");
const builder_1 = __importDefault(require("./routes/builder"));
const copilot_1 = __importDefault(require("./routes/copilot"));
const rag_1 = __importDefault(require("./routes/rag"));
const workflow_1 = __importDefault(require("./routes/workflow"));
const indexing_1 = __importDefault(require("./routes/indexing"));
const admin_1 = __importDefault(require("./routes/admin"));
const documents_1 = __importDefault(require("./routes/documents"));
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.get('/ai/health', async (req, res) => {
    try {
        const { pool } = await Promise.resolve().then(() => __importStar(require('./db/connection')));
        await pool.query('SELECT 1');
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        });
    }
    catch (error) {
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: 'Database connection failed'
        });
    }
});
app.use('/ai/builder', auth_1.sessionAuthMiddleware, builder_1.default);
app.use('/ai/copilot', auth_1.sessionAuthMiddleware, copilot_1.default);
app.use('/ai/rag', auth_1.sessionAuthMiddleware, rag_1.default);
app.use('/ai/workflow', auth_1.authMiddleware, workflow_1.default);
app.use('/ai/indexing', auth_1.authMiddleware, indexing_1.default);
app.use('/ai/admin', admin_1.default);
app.use('/ai/documents', auth_1.sessionAuthMiddleware, documents_1.default);
app.use((err, req, res, next) => {
    logger_1.logger.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An internal error occurred'
        }
    });
});
let dbInitialized = false;
async function initDatabaseWithRetry(maxRetries = 3, delayMs = 5000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await (0, connection_1.initDatabase)();
            dbInitialized = true;
            logger_1.logger.info('Database initialized');
            return true;
        }
        catch (error) {
            logger_1.logger.warn(`Database connection attempt ${i + 1}/${maxRetries} failed:`, error);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    logger_1.logger.warn('Database initialization failed after all retries - AI service will run in limited mode');
    return false;
}
async function start() {
    app.listen(settings_1.config.port, '0.0.0.0', () => {
        logger_1.logger.info(`AI Service running on port ${settings_1.config.port}`);
    });
    initDatabaseWithRetry().then(success => {
        if (success) {
            logger_1.logger.info('AI Service fully operational with database');
        }
        else {
            logger_1.logger.warn('AI Service running without database - some features may be limited');
        }
    });
}
start();
//# sourceMappingURL=index.js.map