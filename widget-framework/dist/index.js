// src/sdk/events.ts
var EventBus = class {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
    this.allHandlers = /* @__PURE__ */ new Set();
  }
  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, /* @__PURE__ */ new Set());
    }
    this.handlers.get(type).add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }
  onAny(handler) {
    this.allHandlers.add(handler);
    return () => {
      this.allHandlers.delete(handler);
    };
  }
  off(type, handler) {
    this.handlers.get(type)?.delete(handler);
  }
  emit(type, data) {
    const event = {
      type,
      data,
      timestamp: Date.now()
    };
    this.handlers.get(type)?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`[Widget Framework] Event handler error for ${type}:`, error);
      }
    });
    this.allHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`[Widget Framework] Global event handler error:`, error);
      }
    });
  }
  clear() {
    this.handlers.clear();
    this.allHandlers.clear();
  }
};
var globalEventBus = new EventBus();

// src/sdk/context.ts
var ContextService = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.cacheTTL = 3e4;
    // 30 seconds
    this.currentContext = null;
  }
  async getContext() {
    const route = this.parseRoute(window.location.pathname);
    const context = {
      route,
      document: null,
      collection: null,
      user: await this.getUserContext()
    };
    if (route.type === "document" && route.id) {
      context.document = await this.getDocumentContext(route.id);
    }
    if (route.type === "collection" && route.id) {
      context.collection = await this.getCollectionContext(route.id);
    }
    this.currentContext = context;
    return context;
  }
  getCurrentContext() {
    return this.currentContext;
  }
  parseRoute(pathname) {
    let normalizedPath = pathname.replace(/\/$/, "");
    normalizedPath = normalizedPath.replace(/\/edit$/, "");
    const docMatch = normalizedPath.match(/^\/doc\/(.+)-([a-zA-Z0-9]+)$/);
    if (docMatch) {
      return { type: "document", id: docMatch[2], pathname };
    }
    const docMatchSimple = normalizedPath.match(/^\/doc\/([a-zA-Z0-9-]+)$/);
    if (docMatchSimple) {
      const parts = docMatchSimple[1].split("-");
      const id = parts[parts.length - 1];
      if (id && /^[a-zA-Z0-9]+$/.test(id)) {
        return { type: "document", id, pathname };
      }
    }
    const collectionMatch = normalizedPath.match(/^\/collection\/([a-zA-Z0-9-]+)$/);
    if (collectionMatch) {
      return { type: "collection", id: collectionMatch[1], pathname };
    }
    if (normalizedPath.startsWith("/search")) {
      return { type: "search", query: normalizedPath.split("/search/")[1] || "", pathname };
    }
    if (normalizedPath === "" || normalizedPath === "/" || normalizedPath === "/home") {
      return { type: "home", pathname };
    }
    return { type: "unknown", pathname };
  }
  async getDocumentContext(documentId) {
    const cached = this.cache.get(`doc:${documentId}`);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    try {
      const response = await fetch("/api/documents.info", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: documentId, includeText: true })
      });
      if (!response.ok)
        return null;
      const { data } = await response.json();
      const context = {
        id: data.id,
        title: data.title,
        text: data.text || "",
        collectionId: data.collectionId,
        parentDocumentId: data.parentDocumentId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };
      this.cache.set(`doc:${documentId}`, { data: context, timestamp: Date.now() });
      return context;
    } catch (error) {
      console.error("[Widget Framework] Failed to fetch document context:", error);
      return null;
    }
  }
  async getCollectionContext(collectionId) {
    const cached = this.cache.get(`collection:${collectionId}`);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    try {
      const response = await fetch("/api/collections.info", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: collectionId })
      });
      if (!response.ok)
        return null;
      const { data } = await response.json();
      this.cache.set(`collection:${collectionId}`, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error("[Widget Framework] Failed to fetch collection context:", error);
      return null;
    }
  }
  async getUserContext() {
    const cached = this.cache.get("user");
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 2) {
      return cached.data;
    }
    try {
      const response = await fetch("/api/auth.info", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok)
        return null;
      const { data } = await response.json();
      const user = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        avatarUrl: data.user.avatarUrl,
        isAdmin: data.user.isAdmin || false
      };
      this.cache.set("user", { data: user, timestamp: Date.now() });
      return user;
    } catch (error) {
      console.error("[Widget Framework] Failed to fetch user context:", error);
      return null;
    }
  }
  clearCache() {
    this.cache.clear();
  }
};
var contextService = new ContextService();

// src/sdk/storage.ts
var WidgetStorage = class {
  constructor(widgetId) {
    this.prefix = `widget:${widgetId}:`;
  }
  get(key, defaultValue) {
    try {
      const value = localStorage.getItem(this.prefix + key);
      if (value === null)
        return defaultValue;
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
  set(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (error) {
      console.error(`[Widget Storage] Failed to save ${key}:`, error);
    }
  }
  remove(key) {
    localStorage.removeItem(this.prefix + key);
  }
  clear() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }
  keys() {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        result.push(key.slice(this.prefix.length));
      }
    }
    return result;
  }
};
var WidgetStorageFactory = class {
  constructor() {
    this.instances = /* @__PURE__ */ new Map();
  }
  getStorage(widgetId) {
    if (!this.instances.has(widgetId)) {
      this.instances.set(widgetId, new WidgetStorage(widgetId));
    }
    return this.instances.get(widgetId);
  }
};
var storageFactory = new WidgetStorageFactory();

// src/sdk/index.ts
var WidgetSDK = class {
  constructor() {
    this.widgets = /* @__PURE__ */ new Map();
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
      state: "loading"
    };
    this.widgets.set(definition.id, instance);
    this.events.emit("widget:registered", { widgetId: definition.id });
  }
  async mount(widgetId, container) {
    const instance = this.widgets.get(widgetId);
    if (!instance) {
      throw new Error(`Widget ${widgetId} not registered`);
    }
    try {
      const context = await this.context.getContext();
      instance.container = container;
      instance.state = "mounted";
      instance.mountedAt = Date.now();
      await instance.definition.onMount(container, context);
      this.events.emit("widget:mounted", {
        widgetId,
        loadTimeMs: Date.now() - (instance.mountedAt || Date.now())
      });
    } catch (error) {
      instance.state = "error";
      instance.error = error;
      this.events.emit("widget:error", { widgetId, error });
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
        instance.container.innerHTML = "";
      }
      instance.state = "unmounted";
      instance.container = null;
      this.events.emit("widget:unmounted", { widgetId });
    } catch (error) {
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
    let pendingCheck = false;
    const checkNavigation = () => {
      if (window.location.pathname !== lastPathname) {
        lastPathname = window.location.pathname;
        this.context.clearCache();
        this.handleNavigationChange();
      }
    };
    const deferredCheck = () => {
      if (pendingCheck)
        return;
      pendingCheck = true;
      setTimeout(() => {
        pendingCheck = false;
        checkNavigation();
      }, 50);
    };
    window.addEventListener("popstate", deferredCheck);
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      deferredCheck();
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      deferredCheck();
    };
    setInterval(checkNavigation, 2e3);
  }
  async handleNavigationChange() {
    const context = await this.context.getContext();
    this.events.emit("context:changed", { context });
    for (const instance of this.widgets.values()) {
      if (instance.state === "mounted" && instance.definition.onContextChange) {
        try {
          instance.definition.onContextChange(context);
        } catch (error) {
          console.error(`[Widget SDK] Context change error for ${instance.id}:`, error);
        }
      }
    }
  }
};
var widgetSDK = new WidgetSDK();
if (typeof window !== "undefined") {
  window.WidgetSDK = WidgetSDK;
  window.widgetSDK = widgetSDK;
}

// src/loader/mount-orchestrator.ts
var DEFAULT_QUOTAS = {
  floating: 6,
  sidebar: 2,
  toolbar: 3,
  modal: 2
};
var Z_INDEX_RANGES = {
  toolbar: { min: 9e3, max: 9099 },
  sidebar: { min: 9100, max: 9199 },
  floating: { min: 9200, max: 9299 },
  modal: { min: 9300, max: 9399 }
};
var MountOrchestrator = class {
  constructor(quotas = DEFAULT_QUOTAS) {
    this.slots = /* @__PURE__ */ new Map();
    this.slotCounts = {
      floating: 0,
      sidebar: 0,
      toolbar: 0,
      modal: 0
    };
    this.rootContainer = null;
    this.quotas = quotas;
  }
  initialize() {
    if (this.rootContainer)
      return;
    this.rootContainer = document.createElement("div");
    this.rootContainer.id = "widget-framework-root";
    this.rootContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      overflow: hidden;
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
    const container = document.createElement("div");
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
      zIndex
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
      modal: { used: this.slotCounts.modal, max: this.quotas.modal }
    };
  }
  getSlotStyles(config, zIndex) {
    const base = `
      position: fixed;
      z-index: ${zIndex};
      pointer-events: none;
      box-sizing: border-box;
    `;
    switch (config.type) {
      case "floating":
        return base + this.getFloatingStyles(config);
      case "sidebar":
        return base + this.getSidebarStyles(config);
      case "toolbar":
        return base + this.getToolbarStyles(config);
      case "modal":
        return base + this.getModalStyles(config);
      default:
        return base;
    }
  }
  getFloatingStyles(config) {
    const position = config.position || "bottom-right";
    const offset = this.slotCounts.floating * 60;
    let positionStyles = "";
    switch (position) {
      case "bottom-right":
        positionStyles = `bottom: ${20 + offset}px; right: 20px;`;
        break;
      case "bottom-left":
        positionStyles = `bottom: ${20 + offset}px; left: 20px;`;
        break;
      case "top-right":
        positionStyles = `top: ${20 + offset}px; right: 20px;`;
        break;
      case "top-left":
        positionStyles = `top: ${20 + offset}px; left: 20px;`;
        break;
    }
    return positionStyles;
  }
  getSidebarStyles(config) {
    const isRight = config.position !== "bottom-left" && config.position !== "top-left";
    return `
      top: 0;
      ${isRight ? "right: 0;" : "left: 0;"}
      width: ${config.width || 300}px;
      height: 100vh;
      background: white;
      box-shadow: ${isRight ? "-2px" : "2px"} 0 8px rgba(0,0,0,0.1);
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
};
var mountOrchestrator = new MountOrchestrator();

// src/loader/index.ts
var WidgetLoader = class {
  constructor(config) {
    this.manifest = null;
    this.loadedScripts = /* @__PURE__ */ new Set();
    this.activeLoads = 0;
    this.loadQueue = [];
    this.config = {
      autoLoad: true,
      maxConcurrentLoads: 3,
      ...config
    };
    this.orchestrator = mountOrchestrator;
  }
  async initialize() {
    try {
      await this.loadManifest();
      if (this.config.autoLoad && this.manifest) {
        await this.loadAllWidgets();
      }
    } catch (error) {
      console.error("[Widget Loader] Initialization failed:", error);
    }
  }
  async loadManifest() {
    try {
      const response = await fetch(this.config.manifestUrl, {
        credentials: "include",
        cache: "no-cache"
      });
      if (!response.ok) {
        throw new Error(`Manifest fetch failed: ${response.status}`);
      }
      this.manifest = await response.json();
      console.log("[Widget Loader] Manifest loaded:", this.manifest);
    } catch (error) {
      console.error("[Widget Loader] Failed to load manifest:", error);
      throw error;
    }
  }
  async loadAllWidgets() {
    if (!this.manifest?.widgets)
      return;
    const enabledWidgets = this.manifest.widgets.filter((w) => w.enabled !== false);
    const prioritized = enabledWidgets.map((entry) => ({
      entry,
      priority: this.getPriority(entry)
    }));
    prioritized.sort((a, b) => this.priorityOrder(a.priority) - this.priorityOrder(b.priority));
    for (const { entry, priority } of prioritized) {
      if (priority === "critical" || priority === "high") {
        await this.loadWidget(entry);
      } else {
        this.queueLoad(entry, this.priorityOrder(priority));
      }
    }
  }
  getPriority(entry) {
    if (entry.priority !== void 0) {
      if (entry.priority >= 90)
        return "critical";
      if (entry.priority >= 70)
        return "high";
      if (entry.priority >= 30)
        return "normal";
      return "low";
    }
    return "normal";
  }
  priorityOrder(priority) {
    switch (priority) {
      case "critical":
        return 0;
      case "high":
        return 1;
      case "normal":
        return 2;
      case "low":
        return 3;
      default:
        return 2;
    }
  }
  queueLoad(entry, priority) {
    this.loadQueue.push({ entry, priority });
    this.loadQueue.sort((a, b) => a.priority - b.priority);
    this.processQueue();
  }
  async processQueue() {
    if (this.loadQueue.length === 0)
      return;
    if (this.activeLoads >= (this.config.maxConcurrentLoads || 3))
      return;
    const next = this.loadQueue.shift();
    if (!next)
      return;
    this.activeLoads++;
    try {
      await this.loadWidget(next.entry);
    } finally {
      this.activeLoads--;
      this.processQueue();
    }
  }
  async loadWidget(entry) {
    console.log(`[Widget Loader] Loading widget ${entry.id}...`);
    if (this.loadedScripts.has(entry.id)) {
      console.log(`[Widget Loader] Widget ${entry.id} already loaded`);
      return;
    }
    try {
      console.log(`[Widget Loader] Checking slot quota for ${entry.mountPoint.type}`);
      if (!this.orchestrator.canMount(entry.mountPoint.type)) {
        console.warn(`[Widget Loader] Cannot mount ${entry.id}: slot quota exceeded`);
        widgetSDK.emit("widget:loadFailed", {
          widgetId: entry.id,
          reason: "Slot quota exceeded"
        });
        return;
      }
      console.log(`[Widget Loader] Injecting script: ${entry.bundle}`);
      await this.injectScript(entry.bundle);
      this.loadedScripts.add(entry.id);
      console.log(`[Widget Loader] Script injected for ${entry.id}`);
      console.log(`[Widget Loader] Waiting for registration of ${entry.id}...`);
      await this.waitForRegistration(entry.id, 5e3);
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
      widgetSDK.emit("widget:loadFailed", { widgetId: entry.id, error });
    }
  }
  async injectScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.type = "module";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }
  waitForRegistration(widgetId, timeout) {
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
  async unloadWidget(widgetId) {
    await widgetSDK.unmount(widgetId);
    this.orchestrator.releaseSlot(widgetId);
    this.loadedScripts.delete(widgetId);
  }
  getManifest() {
    return this.manifest;
  }
  getSlotUsage() {
    return this.orchestrator.getSlotUsage();
  }
};

// src/registry/index.ts
var WidgetRegistry = class {
  constructor(config) {
    this.constraints = [];
    this.installedVersions = /* @__PURE__ */ new Map();
    this.config = {
      validateSignatures: false,
      ...config
    };
  }
  async fetchManifest() {
    const response = await fetch(`${this.config.baseUrl}/manifest.json`, {
      credentials: "include",
      cache: "no-cache"
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }
    const manifest = await response.json();
    if (this.config.validateSignatures && manifest.signature) {
      const valid = await this.validateSignature(manifest);
      if (!valid) {
        throw new Error("Manifest signature validation failed");
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
      const publicKey = await crypto.subtle.importKey(
        "spki",
        keyData,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      const { signature, signedAt, ...payload } = manifest;
      const data = JSON.stringify(payload);
      const signatureBuffer = this.base64ToArrayBuffer(signature);
      return await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        publicKey,
        signatureBuffer,
        new TextEncoder().encode(data)
      );
    } catch (error) {
      console.error("[Widget Registry] Signature validation error:", error);
      return false;
    }
  }
  setVersionConstraints(constraints) {
    this.constraints = constraints;
  }
  isVersionAllowed(widgetId, version) {
    const constraint = this.constraints.find((c) => c.widgetId === widgetId);
    if (!constraint)
      return true;
    if (constraint.blockedVersions.some((v) => this.matchesVersion(version, v))) {
      return false;
    }
    if (constraint.allowedVersions.length > 0) {
      return constraint.allowedVersions.some((v) => this.matchesVersion(version, v));
    }
    return true;
  }
  matchesVersion(version, pattern) {
    if (pattern === "*")
      return true;
    if (pattern.endsWith(".x")) {
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
      errors.push("Invalid widget ID format");
    }
    if (!entry.version || !/^\d+\.\d+\.\d+$/.test(entry.version)) {
      errors.push("Invalid version format (must be semver)");
    }
    if (!entry.bundle) {
      errors.push("Bundle URL is required");
    }
    if (!entry.mountPoint?.type) {
      errors.push("Mount point type is required");
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }
  pemToArrayBuffer(pem) {
    const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
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
};
function createRegistry(config) {
  return new WidgetRegistry(config);
}

// src/index.ts
async function initializeFramework(config) {
  console.log("[Widget Framework] Initializing...");
  const loader = new WidgetLoader({
    manifestUrl: config.manifestUrl,
    autoLoad: config.autoLoad ?? true
  });
  await loader.initialize();
  console.log("[Widget Framework] Initialized");
  return loader;
}
if (typeof window !== "undefined") {
  window.initializeWidgetFramework = initializeFramework;
}
export {
  ContextService,
  EventBus,
  MountOrchestrator,
  WidgetLoader,
  WidgetRegistry,
  WidgetSDK,
  WidgetStorage,
  createRegistry,
  initializeFramework,
  mountOrchestrator,
  widgetSDK
};
//# sourceMappingURL=index.js.map
