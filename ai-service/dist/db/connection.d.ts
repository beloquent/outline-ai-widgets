import { Pool } from 'pg';
export declare const pool: Pool;
export declare function initDatabase(): Promise<void>;
export declare function query(text: string, params?: any[]): Promise<any>;
//# sourceMappingURL=connection.d.ts.map