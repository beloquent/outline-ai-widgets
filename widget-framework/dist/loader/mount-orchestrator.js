const DEFAULT_QUOTAS = {
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
    constructor(quotas = DEFAULT_QUOTAS) {
        this.slots = new Map();
        this.slotCounts = {
            floating: 0,
            sidebar: 0,
            toolbar: 0,
            modal: 0,
        };
        this.rootContainer = null;
        this.quotas = quotas;
    }
    initialize() {
        if (this.rootContainer)
            return;
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
    canMount(type) {
        return this.slotCounts[type] < this.quotas[type];
    }
    createSlot(widgetId, config) {
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
        this.rootContainer.appendChild(container);
        const slot = {
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
    releaseSlot(widgetId) {
        const slot = this.slots.get(widgetId);
        if (!slot)
            return;
        slot.element.remove();
        this.slots.delete(widgetId);
        this.slotCounts[slot.type]--;
    }
    getSlot(widgetId) {
        return this.slots.get(widgetId);
    }
    getSlotUsage() {
        return {
            floating: { used: this.slotCounts.floating, max: this.quotas.floating },
            sidebar: { used: this.slotCounts.sidebar, max: this.quotas.sidebar },
            toolbar: { used: this.slotCounts.toolbar, max: this.quotas.toolbar },
            modal: { used: this.slotCounts.modal, max: this.quotas.modal },
        };
    }
    getSlotStyles(config, zIndex) {
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
    getFloatingStyles(config) {
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
    getSidebarStyles(config) {
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
    getToolbarStyles(config) {
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
    getModalStyles(config) {
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
    destroy() {
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
//# sourceMappingURL=mount-orchestrator.js.map