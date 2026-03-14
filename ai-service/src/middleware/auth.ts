import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config/settings';

function isOriginAllowed(origin: string | undefined, referer: string | undefined): boolean {
  if (!config.enforceOriginCheck) {
    return true;
  }

  const checkUrl = origin || referer;
  if (!checkUrl) {
    return false;
  }

  try {
    const url = new URL(checkUrl);
    const originHost = url.origin;

    const outlineOrigin = new URL(config.outlineUrl).origin;
    if (originHost === outlineOrigin) {
      return true;
    }

    if (config.trustedOrigins.length > 0) {
      return config.trustedOrigins.some(trusted => {
        try {
          return new URL(trusted).origin === originHost;
        } catch {
          return trusted === originHost;
        }
      });
    }

    return false;
  } catch {
    return false;
  }
}

function validateCsrfToken(req: Request): boolean {
  if (!config.csrfSecret) {
    return true;
  }

  const csrfToken = req.headers['x-csrf-token'] as string;
  if (!csrfToken) {
    return true;
  }

  const cookies = req.headers.cookie || '';
  const sessionMatch = cookies.match(/accessToken=([^;]+)/);
  if (!sessionMatch) {
    return true;
  }

  const sessionId = sessionMatch[1].substring(0, 32);
  const expectedToken = crypto
    .createHmac('sha256', config.csrfSecret)
    .update(sessionId)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(csrfToken),
      Buffer.from(expectedToken)
    );
  } catch {
    return false;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
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

  (req as any).userToken = token;
  next();
}

export async function sessionAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  
  if (!isOriginAllowed(origin, referer)) {
    console.warn('[Auth] Origin validation failed:', { origin, referer, outlineUrl: config.outlineUrl });
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
    const csrfToken = req.headers['x-csrf-token'] as string;
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
    const outlineUrl = config.outlineUrl;
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
    
    const data = await response.json() as { data?: { user?: unknown; team?: unknown } };
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
    
    (req as any).user = data.data.user;
    (req as any).team = data.data.team;
    next();
  } catch (error) {
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

export async function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (authHeader && config.adminSecret) {
    const token = authHeader.replace('Bearer ', '');
    if (token === config.adminSecret) {
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

  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  
  if (!isOriginAllowed(origin, referer)) {
    console.warn('[AdminAuth] Origin validation failed:', { origin, referer, outlineUrl: config.outlineUrl });
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
    const csrfToken = req.headers['x-csrf-token'] as string;
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
    const outlineUrl = config.outlineUrl;
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
    
    const data = await response.json() as { data?: { user?: { isAdmin?: boolean; role?: string }; team?: unknown } };
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
    
    (req as any).user = user;
    (req as any).team = data.data.team;
    next();
  } catch (error) {
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
