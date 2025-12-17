declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }

  export interface QueryResult<R = any> {
    rows: R[];
    rowCount: number;
  }

  export interface PoolClient {
    query(text: string, values?: any[]): Promise<QueryResult>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query(text: string, values?: any[]): Promise<QueryResult>;
    connect(): Promise<PoolClient>;
    on(event: 'error', listener: (err: Error) => void): this;
  }
}

declare module 'pgvector' {
  export function registerType(client: any): Promise<void>;
}

declare module 'node-cron' {
  export function schedule(expression: string, func: () => void): any;
  export function validate(expression: string): boolean;
}
