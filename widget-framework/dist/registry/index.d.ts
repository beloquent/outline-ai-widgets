import { WidgetManifest, WidgetManifestEntry } from '../sdk/types';
interface RegistryConfig {
    baseUrl: string;
    validateSignatures?: boolean;
    publicKey?: string;
}
interface VersionConstraint {
    widgetId: string;
    allowedVersions: string[];
    blockedVersions: string[];
}
export declare class WidgetRegistry {
    private config;
    private constraints;
    private installedVersions;
    constructor(config: RegistryConfig);
    fetchManifest(): Promise<WidgetManifest>;
    private validateSignature;
    setVersionConstraints(constraints: VersionConstraint[]): void;
    isVersionAllowed(widgetId: string, version: string): boolean;
    private matchesVersion;
    recordInstalled(widgetId: string, version: string): void;
    getInstalledVersion(widgetId: string): string | undefined;
    validateEntry(entry: WidgetManifestEntry): {
        valid: boolean;
        errors: string[];
    };
    private pemToArrayBuffer;
    private base64ToArrayBuffer;
}
export declare function createRegistry(config: RegistryConfig): WidgetRegistry;
export {};
//# sourceMappingURL=index.d.ts.map