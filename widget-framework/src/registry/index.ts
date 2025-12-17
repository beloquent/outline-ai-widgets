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

export class WidgetRegistry {
  private config: RegistryConfig;
  private constraints: VersionConstraint[] = [];
  private installedVersions = new Map<string, string>();

  constructor(config: RegistryConfig) {
    this.config = {
      validateSignatures: false,
      ...config,
    };
  }

  async fetchManifest(): Promise<WidgetManifest> {
    const response = await fetch(`${this.config.baseUrl}/manifest.json`, {
      credentials: 'include',
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }

    const manifest: WidgetManifest = await response.json();

    if (this.config.validateSignatures && manifest.signature) {
      const valid = await this.validateSignature(manifest);
      if (!valid) {
        throw new Error('Manifest signature validation failed');
      }
    }

    return manifest;
  }

  private async validateSignature(manifest: WidgetManifest): Promise<boolean> {
    if (!this.config.publicKey || !manifest.signature) {
      return true;
    }

    try {
      const keyData = this.pemToArrayBuffer(this.config.publicKey);
      const publicKey = await crypto.subtle.importKey(
        'spki',
        keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const { signature, signedAt, ...payload } = manifest;
      const data = JSON.stringify(payload);
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      return await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        signatureBuffer,
        new TextEncoder().encode(data)
      );
    } catch (error) {
      console.error('[Widget Registry] Signature validation error:', error);
      return false;
    }
  }

  setVersionConstraints(constraints: VersionConstraint[]): void {
    this.constraints = constraints;
  }

  isVersionAllowed(widgetId: string, version: string): boolean {
    const constraint = this.constraints.find(c => c.widgetId === widgetId);

    if (!constraint) return true;

    if (constraint.blockedVersions.some(v => this.matchesVersion(version, v))) {
      return false;
    }

    if (constraint.allowedVersions.length > 0) {
      return constraint.allowedVersions.some(v => this.matchesVersion(version, v));
    }

    return true;
  }

  private matchesVersion(version: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('.x')) {
      const prefix = pattern.slice(0, -2);
      return version.startsWith(prefix);
    }
    return version === pattern;
  }

  recordInstalled(widgetId: string, version: string): void {
    this.installedVersions.set(widgetId, version);
  }

  getInstalledVersion(widgetId: string): string | undefined {
    return this.installedVersions.get(widgetId);
  }

  validateEntry(entry: WidgetManifestEntry): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!entry.id || !/^[a-z][a-z0-9-]*$/.test(entry.id)) {
      errors.push('Invalid widget ID format');
    }

    if (!entry.version || !/^\d+\.\d+\.\d+$/.test(entry.version)) {
      errors.push('Invalid version format (must be semver)');
    }

    if (!entry.bundle) {
      errors.push('Bundle URL is required');
    }

    if (!entry.mountPoint?.type) {
      errors.push('Mount point type is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const base64 = pem
      .replace(/-----[^-]+-----/g, '')
      .replace(/\s/g, '');
    return this.base64ToArrayBuffer(base64);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export function createRegistry(config: RegistryConfig): WidgetRegistry {
  return new WidgetRegistry(config);
}
