import { WidgetManifest, WidgetManifestEntry } from '../sdk/types';
import { MountOrchestrator, mountOrchestrator } from './mount-orchestrator';
interface LoaderConfig {
    manifestUrl: string;
    autoLoad?: boolean;
    maxConcurrentLoads?: number;
}
export declare class WidgetLoader {
    private config;
    private manifest;
    private loadedScripts;
    private activeLoads;
    private loadQueue;
    private orchestrator;
    constructor(config: LoaderConfig);
    initialize(): Promise<void>;
    private loadManifest;
    private loadAllWidgets;
    private getPriority;
    private priorityOrder;
    private queueLoad;
    private processQueue;
    loadWidget(entry: WidgetManifestEntry): Promise<void>;
    private injectScript;
    private waitForRegistration;
    unloadWidget(widgetId: string): Promise<void>;
    getManifest(): WidgetManifest | null;
    getSlotUsage(): Record<string, {
        used: number;
        max: number;
    }>;
}
export { MountOrchestrator, mountOrchestrator };
//# sourceMappingURL=index.d.ts.map