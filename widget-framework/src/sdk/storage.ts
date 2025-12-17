export class WidgetStorage {
  private prefix: string;

  constructor(widgetId: string) {
    this.prefix = `widget:${widgetId}:`;
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const value = localStorage.getItem(this.prefix + key);
      if (value === null) return defaultValue;
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (error) {
      console.error(`[Widget Storage] Failed to save ${key}:`, error);
    }
  }

  remove(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  keys(): string[] {
    const result: string[] = [];
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
  private instances = new Map<string, WidgetStorage>();

  getStorage(widgetId: string): WidgetStorage {
    if (!this.instances.has(widgetId)) {
      this.instances.set(widgetId, new WidgetStorage(widgetId));
    }
    return this.instances.get(widgetId)!;
  }
}

export const storageFactory = new WidgetStorageFactory();
