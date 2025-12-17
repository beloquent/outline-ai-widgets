import { widgetSDK } from '../sdk';
import { 
  WidgetManifest, 
  WidgetManifestEntry, 
  WidgetDefinition,
  WidgetEventType 
} from '../sdk/types';
import { MountOrchestrator, mountOrchestrator } from './mount-orchestrator';

interface LoaderConfig {
  manifestUrl: string;
  autoLoad?: boolean;
  maxConcurrentLoads?: number;
}

type LoadPriority = 'critical' | 'high' | 'normal' | 'low';

interface PrioritizedEntry {
  entry: WidgetManifestEntry;
  priority: LoadPriority;
}

export class WidgetLoader {
  private config: LoaderConfig;
  private manifest: WidgetManifest | null = null;
  private loadedScripts = new Set<string>();
  private activeLoads = 0;
  private loadQueue: Array<{ entry: WidgetManifestEntry; priority: number }> = [];
  private orchestrator: MountOrchestrator;

  constructor(config: LoaderConfig) {
    this.config = {
      autoLoad: true,
      maxConcurrentLoads: 3,
      ...config,
    };
    this.orchestrator = mountOrchestrator;
  }

  async initialize(): Promise<void> {
    try {
      await this.loadManifest();

      if (this.config.autoLoad && this.manifest) {
        await this.loadAllWidgets();
      }
    } catch (error) {
      console.error('[Widget Loader] Initialization failed:', error);
    }
  }

  private async loadManifest(): Promise<void> {
    try {
      const response = await fetch(this.config.manifestUrl, {
        credentials: 'include',
        cache: 'no-cache',
      });

      if (!response.ok) {
        throw new Error(`Manifest fetch failed: ${response.status}`);
      }

      this.manifest = await response.json();
      console.log('[Widget Loader] Manifest loaded:', this.manifest);
    } catch (error) {
      console.error('[Widget Loader] Failed to load manifest:', error);
      throw error;
    }
  }

  private async loadAllWidgets(): Promise<void> {
    if (!this.manifest?.widgets) return;

    const enabledWidgets = this.manifest.widgets.filter(w => w.enabled !== false);

    const prioritized: PrioritizedEntry[] = enabledWidgets.map(entry => ({
      entry,
      priority: this.getPriority(entry),
    }));

    prioritized.sort((a, b) => this.priorityOrder(a.priority) - this.priorityOrder(b.priority));

    for (const { entry, priority } of prioritized) {
      if (priority === 'critical' || priority === 'high') {
        await this.loadWidget(entry);
      } else {
        this.queueLoad(entry, this.priorityOrder(priority));
      }
    }
  }

  private getPriority(entry: WidgetManifestEntry): LoadPriority {
    if (entry.priority !== undefined) {
      if (entry.priority >= 90) return 'critical';
      if (entry.priority >= 70) return 'high';
      if (entry.priority >= 30) return 'normal';
      return 'low';
    }
    return 'normal';
  }

  private priorityOrder(priority: LoadPriority): number {
    switch (priority) {
      case 'critical': return 0;
      case 'high': return 1;
      case 'normal': return 2;
      case 'low': return 3;
      default: return 2;
    }
  }

  private queueLoad(entry: WidgetManifestEntry, priority: number): void {
    this.loadQueue.push({ entry, priority });
    this.loadQueue.sort((a, b) => a.priority - b.priority);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.loadQueue.length === 0) return;
    if (this.activeLoads >= (this.config.maxConcurrentLoads || 3)) return;

    const next = this.loadQueue.shift();
    if (!next) return;

    this.activeLoads++;
    try {
      await this.loadWidget(next.entry);
    } finally {
      this.activeLoads--;
      this.processQueue();
    }
  }

  async loadWidget(entry: WidgetManifestEntry): Promise<void> {
    console.log(`[Widget Loader] Loading widget ${entry.id}...`);
    
    if (this.loadedScripts.has(entry.id)) {
      console.log(`[Widget Loader] Widget ${entry.id} already loaded`);
      return;
    }

    try {
      console.log(`[Widget Loader] Checking slot quota for ${entry.mountPoint.type}`);
      if (!this.orchestrator.canMount(entry.mountPoint.type)) {
        console.warn(`[Widget Loader] Cannot mount ${entry.id}: slot quota exceeded`);
        widgetSDK.emit('widget:loadFailed', { 
          widgetId: entry.id, 
          reason: 'Slot quota exceeded' 
        });
        return;
      }

      console.log(`[Widget Loader] Injecting script: ${entry.bundle}`);
      await this.injectScript(entry.bundle);
      this.loadedScripts.add(entry.id);
      console.log(`[Widget Loader] Script injected for ${entry.id}`);

      console.log(`[Widget Loader] Waiting for registration of ${entry.id}...`);
      await this.waitForRegistration(entry.id, 5000);
      console.log(`[Widget Loader] Widget ${entry.id} registered`);

      console.log(`[Widget Loader] Creating slot for ${entry.id}`);
      const container = this.orchestrator.createSlot(entry.id, entry.mountPoint);
      if (container) {
        console.log(`[Widget Loader] Mounting widget ${entry.id}`);
        await widgetSDK.mount(entry.id, container);
        console.log(`[Widget Loader] Widget ${entry.id} loaded and mounted`);
      } else {
        console.error(`[Widget Loader] Failed to create slot for ${entry.id}`);
      }
    } catch (error) {
      console.error(`[Widget Loader] Failed to load widget ${entry.id}:`, error);
      widgetSDK.emit('widget:loadFailed', { widgetId: entry.id, error });
    }
  }

  private async injectScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.type = 'module';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  private waitForRegistration(widgetId: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        if (widgetSDK.get(widgetId)) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Widget ${widgetId} did not register within ${timeout}ms`));
          return;
        }

        setTimeout(check, 50);
      };

      check();
    });
  }

  async unloadWidget(widgetId: string): Promise<void> {
    await widgetSDK.unmount(widgetId);
    this.orchestrator.releaseSlot(widgetId);
    this.loadedScripts.delete(widgetId);
  }

  getManifest(): WidgetManifest | null {
    return this.manifest;
  }

  getSlotUsage() {
    return this.orchestrator.getSlotUsage();
  }
}

export { MountOrchestrator, mountOrchestrator };
