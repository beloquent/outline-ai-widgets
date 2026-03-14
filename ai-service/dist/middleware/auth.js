"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.sessionAuthMiddleware = sessionAuthMiddleware;
exports.adminAuthMiddleware = adminAuthMiddleware;
const crypto_1 = __importDefault(require("crypto"));
const settings_1 = require("../config/settings");
function isOriginAllowed(origin, referer) {
    if (!settings_1.config.enforceOriginCheck) {
        return true;
    }
    const checkUrl = origin || referer;
    if (!checkUrl) {
        return false;
    }
    try {
        const url = new URL(checkUrl);
        const originHost = url.origin;
        const outlineOrigin = new URL(settings_1.config.outlineUrl).origin;
        if (originHost === outlineOrigin) {
            return true;
        }
        if (settings_1.config.trustedOrigins.length > 0) {
            return settings_1.config.trustedOrigins.some(trusted => {
                try {
                    return new URL(trusted).origin === originHost;
                }
                catch {
                    return trusted === originHost;
                }
            });
        }
        return false;
    }
    catch {
        return false;
    }
}
function validateCsrfToken(req) {
    if (!settings_1.config.csrfSecret) {
        return true;
    }
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken) {
        return true;
    }
    const cookies = req.headers.cookie || '';
    const sessionMatch = cookies.match(/accessToken=([^;]+)/);
    if (!sessionMatch) {
        return true;
    }
    const sessionId = sessionMatch[1].substring(0, 32);
    const expectedToken = crypto_1.default
        .createHmac('sha256', settings_1.config.csrfSecret)
        .update(sessionId)
        .digest('hex');
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(csrfToken), Buffer.from(expectedToken));
    }
    catch {
        return false;
    }
}
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authorization header required'
            }
        });
        return;
    }
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Bearer token required'
            }
        });
        return;
    }
    req.userToken = token;
    next();
}
async function sessionAuthMiddleware(req, res, next) {
    const cookies = req.headers.cookie;
    if (!cookies) {
        res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Session required. Please log in to Outline first.'
            }
        });
        return;
    }
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (!isOriginAllowed(origin, referer)) {
        console.warn('[Auth] Origin validation failed:', { origin, referer, outlineUrl: settings_1.config.outlineUrl });
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Request origin not allowed'
            }
        });
        return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        const csrfToken = req.headers['x-csrf-token'];
        if (csrfToken && !validateCsrfToken(req)) {
            console.warn('[Auth] CSRF validation failed - invalid token');
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Invalid CSRF token'
                }
            });
            return;
        }
    }
    try {
        const outlineUrl = settings_1.config.outlineUrl;
        const response = await fetch(`${outlineUrl}/api/auth.info`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json',
                'X-Forwarded-Proto': 'https',
            },
            body: JSON.stringify({}),
            redirect: 'follow',
        });
        if (!response.ok) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid session. Please log in to Outline first.'
                }
            });
            return;
        }
        const data = await response.json();
        if (!data.data?.user) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid session. Please log in to Outline first.'
                }
            });
            return;
        }
        req.user = data.data.user;
        req.team = data.data.team;
        next();
    }
    catch (error) {
        console.error('[Auth] Session validation failed:', error);
        res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Session validation failed. Please try again.'
            }
        });
    }
}
async function adminAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && settings_1.config.adminSecret) {
        const token = authHeader.replace('Bearer ', '');
        if (token === settings_1.config.adminSecret) {
            next();
            return;
        }
    }
    const cookies = req.headers.cookie;
    if (!cookies) {
        res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required. Please log in to Outline.'
            }
        });
        return;
    }
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (!isOriginAllowed(origin, referer)) {
        console.warn('[AdminAuth] Origin validation failed:', { origin, referer, outlineUrl: settings_1.config.outlineUrl });
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Request origin not allowed'
            }
        });
        return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        const csrfToken = req.headers['x-csrf-token'];
        if (csrfToken && !validateCsrfToken(req)) {
            console.warn('[AdminAuth] CSRF validation failed - invalid token');
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Invalid CSRF token'
                }
            });
            return;
        }
    }
    try {
        const outlineUrl = settings_1.config.outlineUrl;
        const response = await fetch(`${outlineUrl}/api/auth.info`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'Content-Type': 'application/json',
                'X-Forwarded-Proto': 'https',
            },
            body: JSON.stringify({}),
            redirect: 'follow',
        });
        if (!response.ok) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid session. Please log in to Outline first.'
                }
            });
            return;
        }
        const data = await response.json();
        if (!data.data?.user) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid session. Please log in to Outline first.'
                }
            });
            return;
        }
        const user = data.data.user;
        const isAdmin = user.isAdmin === true || user.role === 'admin' || user.role === 'owner';
        if (!isAdmin) {
            res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Admin access required. Please contact your team administrator.'
                }
            });
            return;
        }
        req.user = user;
        req.team = data.data.team;
        next();
    }
    catch (error) {
        console.error('[AdminAuth] Session validation failed:', error);
        res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Session validation failed. Please try again.'
            }
        });
    }
}
//# sourceMappingURL=auth.js.map