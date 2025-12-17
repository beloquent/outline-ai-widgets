export class WidgetRegistry {
    constructor(config) {
        this.constraints = [];
        this.installedVersions = new Map();
        this.config = {
            validateSignatures: false,
            ...config,
        };
    }
    async fetchManifest() {
        const response = await fetch(`${this.config.baseUrl}/manifest.json`, {
            credentials: 'include',
            cache: 'no-cache',
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch manifest: ${response.status}`);
        }
        const manifest = await response.json();
        if (this.config.validateSignatures && manifest.signature) {
            const valid = await this.validateSignature(manifest);
            if (!valid) {
                throw new Error('Manifest signature validation failed');
            }
        }
        return manifest;
    }
    async validateSignature(manifest) {
        if (!this.config.publicKey || !manifest.signature) {
            return true;
        }
        try {
            const keyData = this.pemToArrayBuffer(this.config.publicKey);
            const publicKey = await crypto.subtle.importKey('spki', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
            const { signature, signedAt, ...payload } = manifest;
            const data = JSON.stringify(payload);
            const signatureBuffer = this.base64ToArrayBuffer(signature);
            return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signatureBuffer, new TextEncoder().encode(data));
        }
        catch (error) {
            console.error('[Widget Registry] Signature validation error:', error);
            return false;
        }
    }
    setVersionConstraints(constraints) {
        this.constraints = constraints;
    }
    isVersionAllowed(widgetId, version) {
        const constraint = this.constraints.find(c => c.widgetId === widgetId);
        if (!constraint)
            return true;
        if (constraint.blockedVersions.some(v => this.matchesVersion(version, v))) {
            return false;
        }
        if (constraint.allowedVersions.length > 0) {
            return constraint.allowedVersions.some(v => this.matchesVersion(version, v));
        }
        return true;
    }
    matchesVersion(version, pattern) {
        if (pattern === '*')
            return true;
        if (pattern.endsWith('.x')) {
            const prefix = pattern.slice(0, -2);
            return version.startsWith(prefix);
        }
        return version === pattern;
    }
    recordInstalled(widgetId, version) {
        this.installedVersions.set(widgetId, version);
    }
    getInstalledVersion(widgetId) {
        return this.installedVersions.get(widgetId);
    }
    validateEntry(entry) {
        const errors = [];
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
    pemToArrayBuffer(pem) {
        const base64 = pem
            .replace(/-----[^-]+-----/g, '')
            .replace(/\s/g, '');
        return this.base64ToArrayBuffer(base64);
    }
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
export function createRegistry(config) {
    return new WidgetRegistry(config);
}
//# sourceMappingURL=index.js.map