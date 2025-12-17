import { WidgetEventType, WidgetEvent } from './types';
type EventHandler = (event: WidgetEvent) => void;
export declare class EventBus {
    private handlers;
    private allHandlers;
    on(type: WidgetEventType, handler: EventHandler): () => void;
    onAny(handler: EventHandler): () => void;
    off(type: WidgetEventType, handler: EventHandler): void;
    emit(type: WidgetEventType, data?: any): void;
    clear(): void;
}
export declare const globalEventBus: EventBus;
export {};
//# sourceMappingURL=events.d.ts.map