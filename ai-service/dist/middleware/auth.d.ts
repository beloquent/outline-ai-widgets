import { Request, Response, NextFunction } from 'express';
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function sessionAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.d.ts.map