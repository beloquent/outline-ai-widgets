export declare class WidgetStorage {
    private prefix;
    constructor(widgetId: string);
    get<T>(key: string, defaultValue?: T): T | undefined;
    set<T>(key: string, value: T): void;
    remove(key: string): void;
    clear(): void;
    keys(): string[];
}
export declare class WidgetStorageFactory {
    private instances;
    getStorage(widgetId: string): WidgetStorage;
}
export declare const storageFactory: WidgetStorageFactory;
//# sourceMappingURL=storage.d.ts.map