import { EventBus, globalEventBus } from './events';
import { ContextService, contextService } from './context';
import { WidgetStorage, storageFactory } from './storage';
export * from './types';
export { EventBus, ContextService, WidgetStorage };
export class WidgetSDK {
    constructor() {
        this.widgets = new Map();
        this.events = globalEventBus;
        this.context = contextService;
        this.setupNavigationListener();
    }
    register(definition) {
        if (this.widgets.has(definition.id)) {
            console.warn(`[Widget SDK] Widget ${definition.id} already registered`);
            return;
        }
        const instance = {
            id: definition.id,
            definition,
            container: null,
            state: 'loading',
        };
        this.widgets.set(definition.id, instance);
        this.events.emit('widget:registered', { widgetId: definition.id });
    }
    async mount(widgetId, container) {
        const instance = this.widgets.get(widgetId);
        if (!instance) {
            throw new Error(`Widget ${widgetId} not registered`);
        }
        try {
            const context = await this.context.getContext();
            instance.container = container;
            instance.state = 'mounted';
            instance.mountedAt = Date.now();
            await instance.definition.onMount(container, context);
            this.events.emit('widget:mounted', {
                widgetId,
                loadTimeMs: Date.now() - (instance.mountedAt || Date.now())
            });
        }
        catch (error) {
            instance.state = 'error';
            instance.error = error;
            this.events.emit('widget:error', { widgetId, error });
            throw error;
        }
    }
    async unmount(widgetId) {
        const instance = this.widgets.get(widgetId);
        if (!instance)
            return;
        try {
            if (instance.definition.onUnmount) {
                await instance.definition.onUnmount();
            }
            if (instance.container) {
                instance.container.innerHTML = '';
            }
            instance.state = 'unmounted';
            instance.container = null;
            this.events.emit('widget:unmounted', { widgetId });
        }
        catch (error) {
            console.error(`[Widget SDK] Error unmounting ${widgetId}:`, error);
        }
    }
    get(widgetId) {
        return this.widgets.get(widgetId);
    }
    getAll() {
        return Array.from(this.widgets.values());
    }
    on(type, handler) {
        return this.events.on(type, handler);
    }
    emit(type, data) {
        this.events.emit(type, data);
    }
    getStorage(widgetId) {
        return storageFactory.getStorage(widgetId);
    }
    async getContext() {
        return this.context.getContext();
    }
    setupNavigationListener() {
        let lastPathname = window.location.pathname;
        const checkNavigation = () => {
            if (window.location.pathname !== lastPathname) {
                lastPathname = window.location.pathname;
                this.context.clearCache();
                this.handleNavigationChange();
            }
        };
        window.addEventListener('popstate', checkNavigation);
        const originalPushState = history.pushState;
        history.pushState = function (...args) {
            originalPushState.apply(this, args);
            checkNavigation();
        };
        const originalReplaceState = history.replaceState;
        history.replaceState = function (...args) {
            originalReplaceState.apply(this, args);
            checkNavigation();
        };
        setInterval(checkNavigation, 1000);
    }
    async handleNavigationChange() {
        const context = await this.context.getContext();
        this.events.emit('context:changed', { context });
        for (const instance of this.widgets.values()) {
            if (instance.state === 'mounted' && instance.definition.onContextChange) {
                try {
                    instance.definition.onContextChange(context);
                }
                catch (error) {
                    console.error(`[Widget SDK] Context change error for ${instance.id}:`, error);
                }
            }
        }
    }
}
export const widgetSDK = new WidgetSDK();
if (typeof window !== 'undefined') {
    window.WidgetSDK = WidgetSDK;
    window.widgetSDK = widgetSDK;
}
//# sourceMappingURL=index.js.map