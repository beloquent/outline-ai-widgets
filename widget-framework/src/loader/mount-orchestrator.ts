import { MountPointConfig } from '../sdk/types';

interface SlotQuotas {
  floating: number;
  sidebar: number;
  toolbar: number;
  modal: number;
}

interface MountSlot {
  id: string;
  type: 'floating' | 'sidebar' | 'toolbar' | 'modal';
  element: HTMLElement;
  occupied: boolean;
  widgetId?: string;
  zIndex: number;
}

const DEFAULT_QUOTAS: SlotQuotas = {
  floating: 6,
  sidebar: 2,
  toolbar: 3,
  modal: 2,
};

const Z_INDEX_RANGES = {
  toolbar: { min: 9000, max: 9099 },
  sidebar: { min: 9100, max: 9199 },
  floating: { min: 9200, max: 9299 },
  modal: { min: 9300, max: 9399 },
};

export class MountOrchestrator {
  private slots = new Map<string, MountSlot>();
  private quotas: SlotQuotas;
  private slotCounts: Record<string, number> = {
    floating: 0,
    sidebar: 0,
    toolbar: 0,
    modal: 0,
  };
  private rootContainer: HTMLElement | null = null;

  constructor(quotas: SlotQuotas = DEFAULT_QUOTAS) {
    this.quotas = quotas;
  }

  initialize(): void {
    if (this.rootContainer) return;

    this.rootContainer = document.createElement('div');
    this.rootContainer.id = 'widget-framework-root';
    this.rootContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 1000;
    `;
    document.body.appendChild(this.rootContainer);
  }

  canMount(type: keyof SlotQuotas): boolean {
    return this.slotCounts[type] < this.quotas[type];
  }

  createSlot(widgetId: string, config: MountPointConfig): HTMLElement | null {
    if (!this.canMount(config.type)) {
      console.warn(`[Mount Orchestrator] Slot quota exceeded for ${config.type}`);
      return null;
    }

    this.initialize();

    const zIndexRange = Z_INDEX_RANGES[config.type];
    const zIndex = zIndexRange.max - this.slotCounts[config.type];

    const container = document.createElement('div');
    container.id = `widget-slot-${widgetId}`;
    container.className = `widget-slot widget-slot-${config.type}`;
    container.style.cssText = this.getSlotStyles(config, zIndex);

    this.rootContainer!.appendChild(container);

    const slot: MountSlot = {
      id: `slot-${widgetId}`,
      type: config.type,
      element: container,
      occupied: true,
      widgetId,
      zIndex,
    };

    this.slots.set(widgetId, slot);
    this.slotCounts[config.type]++;

    return container;
  }

  releaseSlot(widgetId: string): void {
    const slot = this.slots.get(widgetId);
    if (!slot) return;

    slot.element.remove();
    this.slots.delete(widgetId);
    this.slotCounts[slot.type]--;
  }

  getSlot(widgetId: string): MountSlot | undefined {
    return this.slots.get(widgetId);
  }

  getSlotUsage(): Record<string, { used: number; max: number }> {
    return {
      floating: { used: this.slotCounts.floating, max: this.quotas.floating },
      sidebar: { used: this.slotCounts.sidebar, max: this.quotas.sidebar },
      toolbar: { used: this.slotCounts.toolbar, max: this.quotas.toolbar },
      modal: { used: this.slotCounts.modal, max: this.quotas.modal },
    };
  }

  private getSlotStyles(config: MountPointConfig, zIndex: number): string {
    const base = `
      position: fixed;
      z-index: ${zIndex};
      pointer-events: auto;
      box-sizing: border-box;
    `;

    switch (config.type) {
      case 'floating':
        return base + this.getFloatingStyles(config);
      case 'sidebar':
        return base + this.getSidebarStyles(config);
      case 'toolbar':
        return base + this.getToolbarStyles(config);
      case 'modal':
        return base + this.getModalStyles(config);
      default:
        return base;
    }
  }

  private getFloatingStyles(config: MountPointConfig): string {
    const position = config.position || 'bottom-right';
    const offset = this.slotCounts.floating * 60;

    let positionStyles = '';
    switch (position) {
      case 'bottom-right':
        positionStyles = `bottom: ${20 + offset}px; right: 20px;`;
        break;
      case 'bottom-left':
        positionStyles = `bottom: ${20 + offset}px; left: 20px;`;
        break;
      case 'top-right':
        positionStyles = `top: ${20 + offset}px; right: 20px;`;
        break;
      case 'top-left':
        positionStyles = `top: ${20 + offset}px; left: 20px;`;
        break;
    }

    return positionStyles;
  }

  private getSidebarStyles(config: MountPointConfig): string {
    const isRight = config.position !== 'bottom-left' && config.position !== 'top-left';
    return `
      top: 0;
      ${isRight ? 'right: 0;' : 'left: 0;'}
      width: ${config.width || 300}px;
      height: 100vh;
      background: white;
      box-shadow: ${isRight ? '-2px' : '2px'} 0 8px rgba(0,0,0,0.1);
    `;
  }

  private getToolbarStyles(config: MountPointConfig): string {
    return `
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      height: ${config.height || 48}px;
      background: white;
      border-radius: 0 0 8px 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
  }

  private getModalStyles(config: MountPointConfig): string {
    // Modal slots should be full-screen containers that allow the widget to render its own overlay
    // IMPORTANT: pointer-events: none so it doesn't block clicks when modal is hidden
    // The modal content itself will set pointer-events: auto on its overlay
    return `
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      pointer-events: none;
    `;
  }

  destroy(): void {
    for (const slot of this.slots.values()) {
      slot.element.remove();
    }
    this.slots.clear();
    this.rootContainer?.remove();
    this.rootContainer = null;
    this.slotCounts = { floating: 0, sidebar: 0, toolbar: 0, modal: 0 };
  }
}

export const mountOrchestrator = new MountOrchestrator();
