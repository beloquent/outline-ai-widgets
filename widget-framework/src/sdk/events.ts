import { WidgetEventType, WidgetEvent } from './types';

type EventHandler = (event: WidgetEvent) => void;

export class EventBus {
  private handlers = new Map<WidgetEventType, Set<EventHandler>>();
  private allHandlers = new Set<EventHandler>();

  on(type: WidgetEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  onAny(handler: EventHandler): () => void {
    this.allHandlers.add(handler);
    return () => {
      this.allHandlers.delete(handler);
    };
  }

  off(type: WidgetEventType, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  emit(type: WidgetEventType, data?: any): void {
    const event: WidgetEvent = {
      type,
      data,
      timestamp: Date.now(),
    };

    this.handlers.get(type)?.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error(`[Widget Framework] Event handler error for ${type}:`, error);
      }
    });

    this.allHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error(`[Widget Framework] Global event handler error:`, error);
      }
    });
  }

  clear(): void {
    this.handlers.clear();
    this.allHandlers.clear();
  }
}

export const globalEventBus = new EventBus();
