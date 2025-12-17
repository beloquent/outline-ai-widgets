import { WidgetContext } from './types';
export declare class ContextService {
    private cache;
    private cacheTTL;
    private currentContext;
    getContext(): Promise<WidgetContext>;
    getCurrentContext(): WidgetContext | null;
    private parseRoute;
    private getDocumentContext;
    private getCollectionContext;
    private getUserContext;
    clearCache(): void;
}
export declare const contextService: ContextService;
//# sourceMappingURL=context.d.ts.map