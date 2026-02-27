// src/widgets/ai-settings/index.ts
var AI_SERVICE_URL = "/ai";
function getWidgetSDK() {
  return window.widgetSDK;
}
function getOutlineTheme() {
  const body = document.body;
  const bgColor = getComputedStyle(body).backgroundColor;
  const isDark = bgColor.includes("17, 19, 25") || bgColor.includes("8, 9, 12") || bgColor.includes("0, 0, 0") || body.classList.contains("dark");
  if (isDark) {
    return {
      isDark: true,
      background: "#181c25",
      backgroundSecondary: "#1f232e",
      text: "#E6E6E6",
      textSecondary: "#8a94a6",
      accent: "#0366d6",
      divider: "rgba(255,255,255,0.1)",
      inputBorder: "#394351",
      modalBackground: "#181c25",
      modalBackdrop: "rgba(0, 0, 0, 0.5)"
    };
  }
  return {
    isDark: false,
    background: "#FFFFFF",
    backgroundSecondary: "#EDF2F7",
    text: "#111319",
    textSecondary: "#66778F",
    accent: "#0366d6",
    divider: "#DAE1E9",
    inputBorder: "#DAE1E9",
    modalBackground: "#FFFFFF",
    modalBackdrop: "rgba(0, 0, 0, 0.25)"
  };
}
var AISettingsWidget = class {
  constructor() {
    this.container = null;
    this.config = null;
    this.isLoading = false;
    this.isSaving = false;
    this.isVisible = false;
    this.message = null;
    this.activeTab = "general";
    this.editedPrompts = {};
    this.eventUnsubscribe = null;
    this.isReindexing = false;
    this.reindexStatus = null;
  }
  async mount(container, context) {
    this.container = container;
    this.editedPrompts = {};
    this.isVisible = false;
    const sdk = getWidgetSDK();
    console.log("[AI Settings] Mounting, SDK:", !!sdk, "on:", !!sdk?.on);
    if (sdk?.on) {
      this.eventUnsubscribe = sdk.on("ai-settings:open", () => {
        console.log("[AI Settings] Received ai-settings:open event, showing modal");
        this.show();
      });
      console.log("[AI Settings] Subscribed to ai-settings:open event");
    } else {
      console.error("[AI Settings] SDK or on method not available");
    }
    window.__aiSettingsWidget = {
      show: () => this.show(),
      hide: () => this.hide()
    };
    console.log("[AI Settings] Exposed __aiSettingsWidget on window");
    this.render();
  }
  async show() {
    console.log("[AI Settings] show() called");
    console.log("[AI Settings] Container exists:", !!this.container);
    console.log("[AI Settings] Container:", this.container);
    this.isVisible = true;
    console.log("[AI Settings] isVisible set to true, calling loadConfig...");
    await this.loadConfig();
    console.log("[AI Settings] loadConfig complete, calling render...");
    this.render();
    console.log("[AI Settings] show() completed");
  }
  hide() {
    this.isVisible = false;
    this.render();
  }
  unmount() {
    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = null;
    }
    if (window.__aiSettingsWidget) {
      delete window.__aiSettingsWidget;
    }
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.container = null;
    this.editedPrompts = {};
  }
  async loadConfig() {
    this.isLoading = true;
    this.render();
    try {
      const response = await fetch(`${AI_SERVICE_URL}/admin/config`, {
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        this.config = data.config;
        this.editedPrompts = { ...this.config?.modePrompts };
      } else {
        this.config = {
          hasOpenAiKey: false,
          hasOutlineKey: false,
          features: {
            copilot: {
              model: "gpt-4o-mini",
              temperature: 0.7,
              maxTokens: 2048,
              systemPrompt: ""
            }
          },
          modePrompts: {
            documentation: "",
            workflow: "",
            sop: "",
            kbChat: ""
          },
          modes: {
            documentation: { name: "Documentation", description: "", defaultPrompt: "" },
            workflow: { name: "Workflow", description: "", defaultPrompt: "" },
            sop: { name: "SOP", description: "", defaultPrompt: "" },
            kbChat: { name: "KB Chat", description: "", defaultPrompt: "" }
          },
          availableModels: [
            { id: "gpt-4o", name: "GPT-4o", maxTokens: 4096 },
            { id: "gpt-4o-mini", name: "GPT-4o Mini", maxTokens: 4096 },
            { id: "gpt-4-turbo", name: "GPT-4 Turbo", maxTokens: 4096 },
            { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", maxTokens: 4096 }
          ]
        };
      }
    } catch (error) {
      console.error("[AI Settings] Failed to load config:", error);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }
  async saveConfig() {
    if (!this.container || this.isSaving)
      return;
    const form = this.container.querySelector("#ai-settings-form");
    if (!form)
      return;
    const formData = new FormData(form);
    const openaiKey = formData.get("openaiApiKey");
    const outlineKey = formData.get("outlineApiKey");
    const model = formData.get("model") || this.config?.features.copilot.model || "gpt-4o-mini";
    const temperatureStr = formData.get("temperature");
    const temperature = temperatureStr ? parseFloat(temperatureStr) : this.config?.features.copilot.temperature || 0.7;
    const maxTokensStr = formData.get("maxTokens");
    const maxTokens = maxTokensStr ? parseInt(maxTokensStr, 10) : this.config?.features.copilot.maxTokens || 2048;
    this.isSaving = true;
    this.message = null;
    this.render();
    try {
      const payload = {
        copilot: { model, temperature, maxTokens },
        modePrompts: this.editedPrompts
      };
      if (openaiKey && openaiKey.trim()) {
        payload.openaiApiKey = openaiKey.trim();
      }
      if (outlineKey && outlineKey.trim()) {
        payload.outlineApiKey = outlineKey.trim();
      }
      const response = await fetch(`${AI_SERVICE_URL}/admin/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        this.message = { type: "success", text: "Settings saved successfully!" };
        if (openaiKey && openaiKey.trim()) {
          this.config.hasOpenAiKey = true;
        }
        if (outlineKey && outlineKey.trim()) {
          this.config.hasOutlineKey = true;
        }
        if (this.config) {
          this.config.features.copilot.model = model;
          this.config.features.copilot.temperature = temperature;
          this.config.features.copilot.maxTokens = maxTokens;
          this.config.modePrompts = { ...this.config.modePrompts, ...this.editedPrompts };
        }
      } else {
        this.message = { type: "error", text: data.error?.message || "Failed to save settings" };
      }
    } catch (error) {
      console.error("[AI Settings] Save failed:", error);
      this.message = { type: "error", text: "Failed to save settings. Please try again." };
    } finally {
      this.isSaving = false;
      this.render();
    }
  }
  close() {
    this.hide();
  }
  async startReindex() {
    if (this.isReindexing)
      return;
    this.isReindexing = true;
    this.reindexStatus = { status: "starting" };
    this.message = null;
    this.render();
    try {
      const response = await fetch(`${AI_SERVICE_URL}/indexing/reindex-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({})
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || `Server error (${response.status})`;
        } catch {
          errorMessage = `Server error (${response.status})`;
        }
        throw new Error(errorMessage);
      }
      const data = await response.json();
      if (data.success && data.job?.jobId) {
        this.reindexStatus = {
          jobId: data.job.jobId,
          status: "running",
          documentsQueued: data.job.documentsQueued || 0,
          documentsIndexed: 0
        };
        this.render();
        this.pollReindexStatus(data.job.jobId);
      } else {
        throw new Error(data.error?.message || "Failed to start reindex");
      }
    } catch (error) {
      console.error("[AI Settings] Reindex failed:", error);
      this.isReindexing = false;
      this.reindexStatus = null;
      this.message = { type: "error", text: `Reindex failed: ${error instanceof Error ? error.message : "Unknown error"}` };
      this.render();
    }
  }
  async pollReindexStatus(jobId) {
    const maxAttempts = 120;
    let attempts = 0;
    let consecutiveErrors = 0;
    const poll = async () => {
      if (!this.isReindexing) {
        return;
      }
      if (attempts >= maxAttempts) {
        this.isReindexing = false;
        this.reindexStatus = null;
        this.message = {
          type: "error",
          text: "Reindex timed out. The job may still be running in the background."
        };
        this.render();
        return;
      }
      attempts++;
      try {
        const response = await fetch(`${AI_SERVICE_URL}/indexing/jobs/${jobId}`, {
          credentials: "include"
        });
        if (!response.ok) {
          throw new Error(`Server error (${response.status})`);
        }
        const data = await response.json();
        consecutiveErrors = 0;
        if (data.success && data.job) {
          this.reindexStatus = {
            jobId,
            status: data.job.status,
            documentsQueued: data.job.documentsQueued,
            documentsIndexed: data.job.documentsIndexed
          };
          if (data.job.status === "completed") {
            this.isReindexing = false;
            this.message = {
              type: "success",
              text: `Reindex complete! Indexed ${data.job.documentsIndexed} documents.`
            };
            this.render();
            return;
          } else if (data.job.status === "failed") {
            this.isReindexing = false;
            this.reindexStatus = null;
            this.message = { type: "error", text: "Reindex job failed. Check server logs." };
            this.render();
            return;
          }
          this.render();
          setTimeout(poll, 1e3);
        } else {
          setTimeout(poll, 1e3);
        }
      } catch (error) {
        console.error("[AI Settings] Poll failed:", error);
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          this.isReindexing = false;
          this.reindexStatus = null;
          this.message = {
            type: "error",
            text: "Lost connection to server. Please check if the service is running."
          };
          this.render();
          return;
        }
        setTimeout(poll, 2e3);
      }
    };
    poll();
  }
  switchTab(tabId) {
    this.activeTab = tabId;
    this.render();
  }
  updatePrompt(mode, value) {
    this.editedPrompts[mode] = value;
  }
  render() {
    console.log("[AI Settings] render() called");
    console.log("[AI Settings] this.container:", this.container);
    console.log("[AI Settings] this.isVisible:", this.isVisible);
    if (!this.container) {
      console.error("[AI Settings] Container is null, cannot render!");
      return;
    }
    if (!this.isVisible) {
      console.log("[AI Settings] isVisible is false, clearing container");
      this.container.innerHTML = "";
      return;
    }
    console.log("[AI Settings] Rendering modal content...");
    const theme = getOutlineTheme();
    const modelOptions = this.config?.availableModels.map((m) => `<option value="${m.id}" ${this.config?.features.copilot.model === m.id ? "selected" : ""}>${m.name}</option>`).join("") || "";
    const tabs = [
      { id: "general", label: "General", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>' },
      { id: "documentation", label: "Documentation", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>' },
      { id: "workflow", label: "Workflow", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7zM7 9H4V5h3v4zm10 6h3v4h-3v-4zm0-10h3v4h-3V5z"/></svg>' },
      { id: "sop", label: "SOP", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>' },
      { id: "kbChat", label: "KB Chat", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>' }
    ];
    this.container.innerHTML = `
      <style>
        .ai-settings-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: ${theme.modalBackdrop};
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9400;
          pointer-events: auto;
          overflow: hidden;
          overscroll-behavior: contain;
          touch-action: none;
        }
        .ai-settings-modal {
          background: ${theme.modalBackground};
          border-radius: 8px;
          width: 90%;
          max-width: 680px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: ${theme.isDark ? "0 0 0 1px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.3)" : "0 4px 8px rgb(0 0 0 / 8%), 0 30px 40px rgb(0 0 0 / 8%)"};
          font-family: -apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', Roboto, Oxygen, sans-serif;
        }
        #ai-settings-form {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .ai-settings-header {
          padding: 16px 20px;
          background: ${theme.backgroundSecondary};
          color: ${theme.text};
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid ${theme.divider};
        }
        .ai-settings-header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 500;
        }
        .ai-settings-close {
          background: none;
          border: none;
          color: ${theme.textSecondary};
          cursor: pointer;
          padding: 6px;
          opacity: 0.8;
          transition: opacity 0.2s;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ai-settings-close:hover {
          opacity: 1;
          background: ${theme.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"};
        }
        .ai-settings-content {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .ai-settings-tabs {
          width: 160px;
          background: ${theme.backgroundSecondary};
          border-right: 1px solid ${theme.divider};
          padding: 12px 0;
          flex-shrink: 0;
        }
        .ai-settings-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 16px;
          border: none;
          background: none;
          color: ${theme.textSecondary};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }
        .ai-settings-tab:hover {
          color: ${theme.text};
          background: ${theme.isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"};
        }
        .ai-settings-tab.active {
          color: ${theme.accent};
          background: ${theme.isDark ? "rgba(3, 102, 214, 0.15)" : "rgba(3, 102, 214, 0.08)"};
          border-right: 2px solid ${theme.accent};
        }
        .ai-settings-tab svg {
          flex-shrink: 0;
        }
        .ai-settings-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
          background: ${theme.background};
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
        .ai-settings-section {
          margin-bottom: 24px;
        }
        .ai-settings-section:last-child {
          margin-bottom: 0;
        }
        .ai-settings-section h3 {
          margin: 0 0 12px;
          font-size: 11px;
          font-weight: 600;
          color: ${theme.textSecondary};
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ai-settings-section-description {
          font-size: 13px;
          color: ${theme.textSecondary};
          margin-bottom: 16px;
          line-height: 1.5;
        }
        .ai-settings-field {
          margin-bottom: 16px;
        }
        .ai-settings-field:last-child {
          margin-bottom: 0;
        }
        .ai-settings-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: ${theme.text};
          margin-bottom: 6px;
        }
        .ai-settings-hint {
          font-size: 12px;
          color: ${theme.textSecondary};
          margin-top: 4px;
        }
        .ai-settings-input,
        .ai-settings-select,
        .ai-settings-textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid ${theme.inputBorder};
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
          background: ${theme.background};
          color: ${theme.text};
        }
        .ai-settings-input:focus,
        .ai-settings-select:focus,
        .ai-settings-textarea:focus {
          outline: none;
          border-color: ${theme.accent};
          box-shadow: 0 0 0 3px ${theme.isDark ? "rgba(3, 102, 214, 0.2)" : "rgba(3, 102, 214, 0.1)"};
        }
        .ai-settings-textarea {
          min-height: 200px;
          resize: vertical;
          font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
          font-size: 13px;
          line-height: 1.5;
        }
        .ai-settings-range-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ai-settings-range {
          flex: 1;
          height: 4px;
          -webkit-appearance: none;
          background: ${theme.divider};
          border-radius: 2px;
          outline: none;
        }
        .ai-settings-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          background: ${theme.accent};
          border-radius: 50%;
          cursor: pointer;
        }
        .ai-settings-range-value {
          min-width: 36px;
          text-align: right;
          font-size: 14px;
          font-weight: 500;
          color: ${theme.text};
        }
        .ai-settings-footer {
          padding: 12px 20px;
          border-top: 1px solid ${theme.divider};
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          background: ${theme.backgroundSecondary};
        }
        .ai-settings-btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ai-settings-btn-secondary {
          background: ${theme.background};
          border: 1px solid ${theme.inputBorder};
          color: ${theme.text};
        }
        .ai-settings-btn-secondary:hover {
          background: ${theme.backgroundSecondary};
        }
        .ai-settings-btn-primary {
          background: ${theme.accent};
          border: none;
          color: white;
        }
        .ai-settings-btn-primary:hover {
          opacity: 0.9;
        }
        .ai-settings-btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ai-settings-message {
          padding: 10px 14px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        .ai-settings-message.success {
          background: ${theme.isDark ? "rgba(45, 164, 78, 0.2)" : "#d1fae5"};
          color: ${theme.isDark ? "#3ad984" : "#065f46"};
        }
        .ai-settings-message.error {
          background: ${theme.isDark ? "rgba(248, 81, 73, 0.2)" : "#fee2e2"};
          color: ${theme.isDark ? "#FF5C80" : "#991b1b"};
        }
        .ai-settings-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 10px;
        }
        .ai-settings-status.configured {
          background: ${theme.isDark ? "rgba(45, 164, 78, 0.2)" : "#d1fae5"};
          color: ${theme.isDark ? "#3ad984" : "#065f46"};
        }
        .ai-settings-status.not-configured {
          background: ${theme.isDark ? "rgba(245, 190, 49, 0.2)" : "#fef3c7"};
          color: ${theme.isDark ? "#F5BE31" : "#92400e"};
        }
        .ai-settings-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 60px;
          color: ${theme.textSecondary};
        }
        .ai-settings-mode-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .ai-settings-mode-badge.documentation {
          background: ${theme.isDark ? "rgba(59, 130, 246, 0.2)" : "#dbeafe"};
          color: ${theme.isDark ? "#60a5fa" : "#1d4ed8"};
        }
        .ai-settings-mode-badge.workflow {
          background: ${theme.isDark ? "rgba(168, 85, 247, 0.2)" : "#f3e8ff"};
          color: ${theme.isDark ? "#c084fc" : "#7c3aed"};
        }
        .ai-settings-mode-badge.sop {
          background: ${theme.isDark ? "rgba(34, 197, 94, 0.2)" : "#dcfce7"};
          color: ${theme.isDark ? "#4ade80" : "#15803d"};
        }
        .ai-settings-mode-badge.kbChat {
          background: ${theme.isDark ? "rgba(251, 146, 60, 0.2)" : "#ffedd5"};
          color: ${theme.isDark ? "#fb923c" : "#c2410c"};
        }
        .ai-settings-reindex-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ai-settings-btn-reindex {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: ${theme.isDark ? "rgba(59, 130, 246, 0.15)" : "#eff6ff"};
          border: 1px solid ${theme.isDark ? "rgba(59, 130, 246, 0.3)" : "#bfdbfe"};
          color: ${theme.isDark ? "#60a5fa" : "#2563eb"};
          padding: 10px 16px;
          font-weight: 500;
        }
        .ai-settings-btn-reindex:hover:not(:disabled) {
          background: ${theme.isDark ? "rgba(59, 130, 246, 0.25)" : "#dbeafe"};
        }
        .ai-settings-btn-reindex:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .ai-reindex-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid ${theme.isDark ? "rgba(96, 165, 250, 0.3)" : "rgba(37, 99, 235, 0.3)"};
          border-top-color: ${theme.isDark ? "#60a5fa" : "#2563eb"};
          border-radius: 50%;
          animation: ai-reindex-spin 0.8s linear infinite;
        }
        @keyframes ai-reindex-spin {
          to { transform: rotate(360deg); }
        }
        .ai-reindex-progress {
          padding: 8px 12px;
          background: ${theme.isDark ? "rgba(59, 130, 246, 0.1)" : "#f0f9ff"};
          border-radius: 6px;
          border: 1px solid ${theme.isDark ? "rgba(59, 130, 246, 0.2)" : "#e0f2fe"};
        }
        .ai-reindex-progress-text {
          font-size: 13px;
          color: ${theme.isDark ? "#93c5fd" : "#1d4ed8"};
        }
      </style>

      <div class="ai-settings-overlay" id="ai-settings-overlay">
        <div class="ai-settings-modal">
          <div class="ai-settings-header">
            <h2>AI Copilot Settings</h2>
            <button class="ai-settings-close" id="ai-settings-close" title="Close">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          
          ${this.isLoading ? `
            <div class="ai-settings-loading">Loading settings...</div>
          ` : `
            <form id="ai-settings-form">
              <div class="ai-settings-content">
                <div class="ai-settings-tabs">
                  ${tabs.map((tab) => `
                    <button type="button" class="ai-settings-tab ${this.activeTab === tab.id ? "active" : ""}" data-tab="${tab.id}">
                      ${tab.icon}
                      ${tab.label}
                    </button>
                  `).join("")}
                </div>
                
                <div class="ai-settings-body">
                  ${this.message ? `
                    <div class="ai-settings-message ${this.message.type}">${this.message.text}</div>
                  ` : ""}
                  
                  ${this.renderTabContent(theme, modelOptions)}
                </div>
              </div>
              
              <div class="ai-settings-footer">
                <button type="button" class="ai-settings-btn ai-settings-btn-secondary" id="ai-settings-cancel">Cancel</button>
                <button type="submit" class="ai-settings-btn ai-settings-btn-primary" ${this.isSaving ? "disabled" : ""}>
                  ${this.isSaving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          `}
        </div>
      </div>
    `;
    this.attachEventListeners();
  }
  renderTabContent(theme, modelOptions) {
    if (this.activeTab === "general") {
      return `
        <div class="ai-settings-section">
          <h3>API Configuration</h3>
          <div class="ai-settings-field">
            <label class="ai-settings-label">
              OpenAI API Key
              <span class="ai-settings-status ${this.config?.hasOpenAiKey ? "configured" : "not-configured"}">
                ${this.config?.hasOpenAiKey ? "Configured" : "Not configured"}
              </span>
            </label>
            <input 
              type="password" 
              name="openaiApiKey" 
              class="ai-settings-input" 
              placeholder="${this.config?.hasOpenAiKey ? "Enter new key to update" : "sk-..."}"
            />
            <p class="ai-settings-hint">Required for AI responses. Leave blank to keep existing key.</p>
          </div>

          <div class="ai-settings-field">
            <label class="ai-settings-label">
              Outline API Key
              <span class="ai-settings-status ${this.config?.hasOutlineKey ? "configured" : "not-configured"}">
                ${this.config?.hasOutlineKey ? "Configured" : "Not configured"}
              </span>
            </label>
            <input 
              type="password" 
              name="outlineApiKey" 
              class="ai-settings-input" 
              placeholder="${this.config?.hasOutlineKey ? "Enter new key to update" : "ol_api_..."}"
            />
            <p class="ai-settings-hint">Required for document access. Generate in Settings > API with Documents (read) and Collections (read) scopes.</p>
          </div>
        </div>

        <div class="ai-settings-section">
          <h3>Model Settings</h3>
          <div class="ai-settings-field">
            <label class="ai-settings-label">Model</label>
            <select name="model" class="ai-settings-select">
              ${modelOptions}
            </select>
          </div>
          
          <div class="ai-settings-field">
            <label class="ai-settings-label">Temperature</label>
            <div class="ai-settings-range-container">
              <input 
                type="range" 
                name="temperature" 
                class="ai-settings-range" 
                min="0" 
                max="2" 
                step="0.1" 
                value="${this.config?.features.copilot.temperature || 0.7}"
                id="temperature-range"
              />
              <span class="ai-settings-range-value" id="temperature-value">${this.config?.features.copilot.temperature || 0.7}</span>
            </div>
            <p class="ai-settings-hint">Lower = more focused, Higher = more creative</p>
          </div>
          
          <div class="ai-settings-field">
            <label class="ai-settings-label">Max Tokens</label>
            <input 
              type="number" 
              name="maxTokens" 
              class="ai-settings-input" 
              min="1" 
              max="16384" 
              value="${this.config?.features.copilot.maxTokens || 2048}"
            />
            <p class="ai-settings-hint">Maximum length of AI responses</p>
          </div>
        </div>

        <div class="ai-settings-section">
          <h3>Knowledge Base Indexing</h3>
          <p class="ai-settings-section-description">
            Reindex your documents to update the knowledge base for AI-powered search and chat. 
            This is needed after you create or edit documents.
          </p>
          <div class="ai-settings-reindex-container">
            <button 
              type="button" 
              class="ai-settings-btn ai-settings-btn-reindex" 
              id="ai-reindex-btn"
              ${this.isReindexing ? "disabled" : ""}
            >
              ${this.isReindexing ? `
                <span class="ai-reindex-spinner"></span>
                Reindexing...
              ` : `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
                Reindex Knowledge Base
              `}
            </button>
            ${this.reindexStatus?.status === "running" ? `
              <div class="ai-reindex-progress">
                <div class="ai-reindex-progress-text">
                  Indexed ${this.reindexStatus.documentsIndexed || 0} of ${this.reindexStatus.documentsQueued || "?"} documents
                </div>
              </div>
            ` : ""}
          </div>
        </div>
      `;
    }
    const modeKey = this.activeTab;
    const modeConfig = this.config?.modes?.[modeKey];
    const currentPrompt = this.editedPrompts[modeKey] || this.config?.modePrompts?.[modeKey] || "";
    return `
      <div class="ai-settings-section">
        <span class="ai-settings-mode-badge ${modeKey}">${modeConfig?.name || modeKey}</span>
        <h3>${modeConfig?.name || modeKey} Mode Prompt</h3>
        <p class="ai-settings-section-description">${modeConfig?.description || ""}</p>
        
        <div class="ai-settings-field">
          <label class="ai-settings-label">System Instructions</label>
          <textarea 
            class="ai-settings-textarea"
            data-mode="${modeKey}"
            placeholder="Enter the system prompt for ${modeConfig?.name || modeKey} mode..."
          >${currentPrompt}</textarea>
          <p class="ai-settings-hint">These instructions define how the AI behaves in ${modeConfig?.name || modeKey} mode. Be specific about the format, style, and focus areas.</p>
        </div>
      </div>
    `;
  }
  attachEventListeners() {
    const overlay = this.container?.querySelector("#ai-settings-overlay");
    const modal = this.container?.querySelector(".ai-settings-modal");
    const closeBtn = this.container?.querySelector("#ai-settings-close");
    const cancelBtn = this.container?.querySelector("#ai-settings-cancel");
    const form = this.container?.querySelector("#ai-settings-form");
    const temperatureRange = this.container?.querySelector("#temperature-range");
    const temperatureValue = this.container?.querySelector("#temperature-value");
    const tabs = this.container?.querySelectorAll(".ai-settings-tab");
    const modeTextareas = this.container?.querySelectorAll(".ai-settings-textarea[data-mode]");
    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay)
        this.close();
    });
    overlay?.addEventListener("wheel", (e) => {
      if (!modal?.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { passive: false });
    closeBtn?.addEventListener("click", () => this.close());
    cancelBtn?.addEventListener("click", () => this.close());
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveConfig();
    });
    temperatureRange?.addEventListener("input", () => {
      if (temperatureValue) {
        temperatureValue.textContent = temperatureRange.value;
      }
    });
    tabs?.forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabId = tab.getAttribute("data-tab");
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });
    modeTextareas?.forEach((textarea) => {
      textarea.addEventListener("input", (e) => {
        const target = e.target;
        const mode = target.getAttribute("data-mode");
        if (mode) {
          this.updatePrompt(mode, target.value);
        }
      });
    });
    const reindexBtn = this.container?.querySelector("#ai-reindex-btn");
    reindexBtn?.addEventListener("click", () => this.startReindex());
  }
};
var settingsWidget = new AISettingsWidget();
var definition = {
  id: "ai-settings",
  name: "AI Settings",
  version: "1.0.0",
  description: "Configure AI Copilot settings",
  mountPoint: {
    type: "modal",
    priority: 100
  },
  permissions: [],
  onMount: (container, context) => settingsWidget.mount(container, context),
  onUnmount: () => settingsWidget.unmount()
};
getWidgetSDK().register(definition);
var ai_settings_default = definition;
export {
  ai_settings_default as default
};
//# sourceMappingURL=ai-settings.js.map
