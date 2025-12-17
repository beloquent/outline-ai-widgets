export * from './sdk';
export * from './sdk/types';
export { WidgetLoader, MountOrchestrator, mountOrchestrator } from './loader';
export { WidgetRegistry, createRegistry } from './registry';
import { WidgetLoader } from './loader';
export interface FrameworkConfig {
    manifestUrl: string;
    autoLoad?: boolean;
}
export declare function initializeFramework(config: FrameworkConfig): Promise<WidgetLoader>;
declare global {
    interface Window {
        initializeWidgetFramework: typeof initializeFramework;
    }
}
//# sourceMappingURL=index.d.ts.map