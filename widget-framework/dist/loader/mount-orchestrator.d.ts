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
export declare class MountOrchestrator {
    private slots;
    private quotas;
    private slotCounts;
    private rootContainer;
    constructor(quotas?: SlotQuotas);
    initialize(): void;
    canMount(type: keyof SlotQuotas): boolean;
    createSlot(widgetId: string, config: MountPointConfig): HTMLElement | null;
    releaseSlot(widgetId: string): void;
    getSlot(widgetId: string): MountSlot | undefined;
    getSlotUsage(): Record<string, {
        used: number;
        max: number;
    }>;
    private getSlotStyles;
    private getFloatingStyles;
    private getSidebarStyles;
    private getToolbarStyles;
    private getModalStyles;
    destroy(): void;
}
export declare const mountOrchestrator: MountOrchestrator;
export {};
//# sourceMappingURL=mount-orchestrator.d.ts.map