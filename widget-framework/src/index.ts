export * from './sdk';
export * from './sdk/types';
export { WidgetLoader, MountOrchestrator, mountOrchestrator } from './loader';
export { WidgetRegistry, createRegistry } from './registry';

import { widgetSDK } from './sdk';
import { WidgetLoader } from './loader';

export interface FrameworkConfig {
  manifestUrl: string;
  autoLoad?: boolean;
}

export async function initializeFramework(config: FrameworkConfig): Promise<WidgetLoader> {
  console.log('[Widget Framework] Initializing...');
  
  const loader = new WidgetLoader({
    manifestUrl: config.manifestUrl,
    autoLoad: config.autoLoad ?? true,
  });

  await loader.initialize();

  console.log('[Widget Framework] Initialized');
  return loader;
}

declare global {
  interface Window {
    initializeWidgetFramework: typeof initializeFramework;
  }
}

if (typeof window !== 'undefined') {
  window.initializeWidgetFramework = initializeFramework;
}
