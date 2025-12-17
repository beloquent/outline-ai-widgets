export class EventBus {
    constructor() {
        this.handlers = new Map();
        this.allHandlers = new Set();
    }
    on(type, handler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type).add(handler);
        return () => {
            this.handlers.get(type)?.delete(handler);
        };
    }
    onAny(handler) {
        this.allHandlers.add(handler);
        return () => {
            this.allHandlers.delete(handler);
        };
    }
    off(type, handler) {
        this.handlers.get(type)?.delete(handler);
    }
    emit(type, data) {
        const event = {
            type,
            data,
            timestamp: Date.now(),
        };
        this.handlers.get(type)?.forEach(handler => {
            try {
                handler(event);
            }
            catch (error) {
                console.error(`[Widget Framework] Event handler error for ${type}:`, error);
            }
        });
        this.allHandlers.forEach(handler => {
            try {
                handler(event);
            }
            catch (error) {
                console.error(`[Widget Framework] Global event handler error:`, error);
            }
        });
    }
    clear() {
        this.handlers.clear();
        this.allHandlers.clear();
    }
}
export const globalEventBus = new EventBus();
//# sourceMappingURL=events.js.map