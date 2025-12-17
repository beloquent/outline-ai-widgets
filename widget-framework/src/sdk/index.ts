import { EventBus, globalEventBus } from './events';
import { ContextService, contextService } from './context';
import { WidgetStorage, storageFactory } from './storage';
import { 
  WidgetDefinition, 
  WidgetInstance, 
  WidgetContext,
  WidgetEventType,
  WidgetEvent,
  MountPointConfig 
} from './types';

export * from './types';
export { EventBus, ContextService, WidgetStorage };

export class WidgetSDK {
  private widgets = new Map<string, WidgetInstance>();
  private events: EventBus;
  private context: ContextService;

  constructor() {
    this.events = globalEventBus;
    this.context = contextService;
    this.setupNavigationListener();
  }

  register(definition: WidgetDefinition): void {
    if (this.widgets.has(definition.id)) {
      console.warn(`[Widget SDK] Widget ${definition.id} already registered`);
      return;
    }

    const instance: WidgetInstance = {
      id: definition.id,
      definition,
      container: null,
      state: 'loading',
    };

    this.widgets.set(definition.id, instance);
    this.events.emit('widget:registered', { widgetId: definition.id });
  }

  async mount(widgetId: string, container: HTMLElement): Promise<void> {
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
    } catch (error) {
      instance.state = 'error';
      instance.error = error as Error;
      this.events.emit('widget:error', { widgetId, error });
      throw error;
    }
  }

  async unmount(widgetId: string): Promise<void> {
    const instance = this.widgets.get(widgetId);
    if (!instance) return;

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
    } catch (error) {
      console.error(`[Widget SDK] Error unmounting ${widgetId}:`, error);
    }
  }

  get(widgetId: string): WidgetInstance | undefined {
    return this.widgets.get(widgetId);
  }

  getAll(): WidgetInstance[] {
    return Array.from(this.widgets.values());
  }

  on(type: WidgetEventType, handler: (event: WidgetEvent) => void): () => void {
    return this.events.on(type, handler);
  }

  emit(type: WidgetEventType, data?: any): void {
    this.events.emit(type, data);
  }

  getStorage(widgetId: string): WidgetStorage {
    return storageFactory.getStorage(widgetId);
  }

  async getContext(): Promise<WidgetContext> {
    return this.context.getContext();
  }

  private setupNavigationListener(): void {
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
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      checkNavigation();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      checkNavigation();
    };

    setInterval(checkNavigation, 1000);
  }

  private async handleNavigationChange(): Promise<void> {
    const context = await this.context.getContext();
    
    this.events.emit('context:changed', { context });

    for (const instance of this.widgets.values()) {
      if (instance.state === 'mounted' && instance.definition.onContextChange) {
        try {
          instance.definition.onContextChange(context);
        } catch (error) {
          console.error(`[Widget SDK] Context change error for ${instance.id}:`, error);
        }
      }
    }
  }
}

export const widgetSDK = new WidgetSDK();

declare global {
  interface Window {
    WidgetSDK: typeof WidgetSDK;
    widgetSDK: WidgetSDK;
  }
}

if (typeof window !== 'undefined') {
  window.WidgetSDK = WidgetSDK;
  window.widgetSDK = widgetSDK;
}
