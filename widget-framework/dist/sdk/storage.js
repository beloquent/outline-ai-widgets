export class WidgetStorage {
    constructor(widgetId) {
        this.prefix = `widget:${widgetId}:`;
    }
    get(key, defaultValue) {
        try {
            const value = localStorage.getItem(this.prefix + key);
            if (value === null)
                return defaultValue;
            return JSON.parse(value);
        }
        catch {
            return defaultValue;
        }
    }
    set(key, value) {
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(value));
        }
        catch (error) {
            console.error(`[Widget Storage] Failed to save ${key}:`, error);
        }
    }
    remove(key) {
        localStorage.removeItem(this.prefix + key);
    }
    clear() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(this.prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
    keys() {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(this.prefix)) {
                result.push(key.slice(this.prefix.length));
            }
        }
        return result;
    }
}
export class WidgetStorageFactory {
    constructor() {
        this.instances = new Map();
    }
    getStorage(widgetId) {
        if (!this.instances.has(widgetId)) {
            this.instances.set(widgetId, new WidgetStorage(widgetId));
        }
        return this.instances.get(widgetId);
    }
}
export const storageFactory = new WidgetStorageFactory();
//# sourceMappingURL=storage.js.map