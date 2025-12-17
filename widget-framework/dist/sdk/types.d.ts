export interface WidgetDefinition {
    id: string;
    name: string;
    version: string;
    description?: string;
    mountPoint: MountPointConfig;
    permissions?: string[];
    onMount: (container: HTMLElement, context: WidgetContext) => void | Promise<void>;
    onUnmount?: () => void | Promise<void>;
    onContextChange?: (context: WidgetContext) => void;
    onEviction?: () => boolean | Promise<boolean>;
}
export interface MountPointConfig {
    type: 'floating' | 'sidebar' | 'toolbar' | 'modal';
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    width?: number;
    height?: number;
    priority?: number;
}
export interface WidgetContext {
    route: RouteInfo;
    document?: DocumentContext | null;
    collection?: CollectionContext | null;
    user?: UserContext | null;
}
export interface RouteInfo {
    type: 'document' | 'collection' | 'search' | 'home' | 'unknown';
    id?: string;
    query?: string;
    pathname: string;
}
export interface DocumentContext {
    id: string;
    title: string;
    text: string;
    collectionId?: string;
    parentDocumentId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface CollectionContext {
    id: string;
    name: string;
    description?: string;
    permission: string;
    documentCount: number;
}
export interface UserContext {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    isAdmin: boolean;
}
export interface WidgetManifest {
    version: string;
    widgets: WidgetManifestEntry[];
    signature?: string;
    signedAt?: string;
}
export interface WidgetManifestEntry {
    id: string;
    name: string;
    version: string;
    bundle: string;
    priority?: number;
    mountPoint: MountPointConfig;
    permissions?: string[];
    enabled?: boolean;
    featureGates?: string[];
}
export interface WidgetInstance {
    id: string;
    definition: WidgetDefinition;
    container: HTMLElement | null;
    state: 'loading' | 'mounted' | 'unmounted' | 'error';
    mountedAt?: number;
    error?: Error;
}
export type WidgetEventType = 'widget:registered' | 'widget:mounted' | 'widget:unmounted' | 'widget:error' | 'widget:crashed' | 'widget:loadFailed' | 'widget:evicted' | 'widget:evictionCancelled' | 'widget:autoRollback' | 'widget:autoDisabled' | 'widget:healthAlert' | 'widget:collapsed' | 'context:changed' | 'layout:viewportChanged' | 'ai-settings:open' | 'ai-settings:close';
export interface WidgetEvent {
    type: WidgetEventType;
    widgetId?: string;
    data?: any;
    timestamp: number;
}
//# sourceMappingURL=types.d.ts.map