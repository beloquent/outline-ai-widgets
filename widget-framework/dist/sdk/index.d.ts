import { EventBus } from './events';
import { ContextService } from './context';
import { WidgetStorage } from './storage';
import { WidgetDefinition, WidgetInstance, WidgetContext, WidgetEventType, WidgetEvent } from './types';
export * from './types';
export { EventBus, ContextService, WidgetStorage };
export declare class WidgetSDK {
    private widgets;
    private events;
    private context;
    constructor();
    register(definition: WidgetDefinition): void;
    mount(widgetId: string, container: HTMLElement): Promise<void>;
    unmount(widgetId: string): Promise<void>;
    get(widgetId: string): WidgetInstance | undefined;
    getAll(): WidgetInstance[];
    on(type: WidgetEventType, handler: (event: WidgetEvent) => void): () => void;
    emit(type: WidgetEventType, data?: any): void;
    getStorage(widgetId: string): WidgetStorage;
    getContext(): Promise<WidgetContext>;
    private setupNavigationListener;
    private handleNavigationChange;
}
export declare const widgetSDK: WidgetSDK;
declare global {
    interface Window {
        WidgetSDK: typeof WidgetSDK;
        widgetSDK: WidgetSDK;
    }
}
//# sourceMappingURL=index.d.ts.map