import type { WidgetDefinition, WidgetContext } from '../../sdk/types';

const AI_SERVICE_URL = '/ai';
const WIDGET_VERSION = '1.3.0';

type CopilotMode = 'documentation' | 'workflow' | 'sop' | 'kbChat' | 'createDraft';

interface ModeInfo {
  id: CopilotMode;
  name: string;
  icon: string;
  description: string;
  placeholder: string;
}

const MODES: ModeInfo[] = [
  { 
    id: 'documentation', 
    name: 'Documentation', 
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    description: 'Help with documentation',
    placeholder: 'Ask about documentation...'
  },
  { 
    id: 'workflow', 
    name: 'Workflow', 
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7zM7 9H4V5h3v4zm10 6h3v4h-3v-4zm0-10h3v4h-3V5z"/></svg>',
    description: 'Design workflows',
    placeholder: 'Describe your workflow...'
  },
  { 
    id: 'sop', 
    name: 'SOP', 
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
    description: 'Create SOPs',
    placeholder: 'Describe the procedure...'
  },
  { 
    id: 'kbChat', 
    name: 'KB Chat', 
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>',
    description: 'Search knowledge base',
    placeholder: 'Ask about your knowledge base...'
  },
  { 
    id: 'createDraft', 
    name: 'New Draft', 
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    description: 'Create a new document with AI',
    placeholder: 'Describe the document you want to create...'
  }
];

interface WidgetStorageInterface {
  get<T>(key: string, defaultValue?: T): T | undefined;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

interface OutlineTheme {
  isDark: boolean;
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  divider: string;
  inputBorder: string;
  sidebarWidth: number;
}

function getOutlineTheme(): OutlineTheme {
  const body = document.body;
  const bgColor = getComputedStyle(body).backgroundColor;
  
  const isDark = bgColor.includes('17, 19, 25') || bgColor.includes('8, 9, 12') || 
                 bgColor.includes('0, 0, 0') || body.classList.contains('dark');
  
  if (isDark) {
    return {
      isDark: true,
      background: '#181c25',
      backgroundSecondary: '#1f232e',
      backgroundTertiary: '#262b38',
      text: '#E6E6E6',
      textSecondary: '#8a94a6',
      textTertiary: '#6b7280',
      accent: '#0366d6',
      divider: 'rgba(255,255,255,0.1)',
      inputBorder: '#394351',
      sidebarWidth: 380,
    };
  }
  
  return {
    isDark: false,
    background: '#FFFFFF',
    backgroundSecondary: '#F7F9FC',
    backgroundTertiary: '#EDF2F7',
    text: '#111319',
    textSecondary: '#66778F',
    textTertiary: '#8E99A4',
    accent: '#0366d6',
    divider: '#E2E8F0',
    inputBorder: '#DAE1E9',
    sidebarWidth: 380,
  };
}

function getWidgetSDK() {
  return (window as any).widgetSDK;
}

function getStorage(widgetId: string): WidgetStorageInterface {
  return getWidgetSDK().getStorage(widgetId);
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ title: string; url?: string }>;
  usedKBContext?: boolean;
}

interface ChatAttachment {
  id: string;
  filename: string;
  content: string;
  size: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB total
const ALLOWED_EXTENSIONS = ['.txt', '.doc', '.docx', '.vtt'];

function renderMarkdown(text: string, theme: OutlineTheme): string {
  const codeBlocks: string[] = [];
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre class="ai-md-code-block"><code class="language-${lang || 'text'}">${escapeHtmlChars(code.trim())}</code></pre>`);
    return placeholder;
  });
  
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code class="ai-md-inline-code">${escapeHtmlChars(code)}</code>`);
    return placeholder;
  });
  
  html = escapeHtmlChars(html);
  
  codeBlocks.forEach((block, i) => {
    html = html.replace(`__CODE_BLOCK_${i}__`, block);
  });
  inlineCodes.forEach((code, i) => {
    html = html.replace(`__INLINE_CODE_${i}__`, code);
  });
  
  html = html.replace(/^### (.+)$/gm, '<h4 class="ai-md-h3">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="ai-md-h2">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="ai-md-h1">$1</h2>');
  
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ai-md-ol-item">$1</li>');
  html = html.replace(/(<li class="ai-md-ol-item">.*<\/li>\n?)+/g, '<ol class="ai-md-ol">$&</ol>');
  
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li class="ai-md-ul-item">$1</li>');
  html = html.replace(/(<li class="ai-md-ul-item">.*<\/li>\n?)+/g, '<ul class="ai-md-ul">$&</ul>');
  
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="ai-md-link">$1</a>');
  
  const lines = html.split('\n');
  let result = '';
  let inParagraph = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (inParagraph) {
        result += '</p>';
        inParagraph = false;
      }
      result += '\n';
    } else if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<pre') || trimmed.startsWith('<li')) {
      if (inParagraph) {
        result += '</p>';
        inParagraph = false;
      }
      result += trimmed + '\n';
    } else {
      if (!inParagraph) {
        result += '<p class="ai-md-p">';
        inParagraph = true;
      } else {
        result += '<br>';
      }
      result += trimmed;
    }
  }
  if (inParagraph) {
    result += '</p>';
  }
  
  return result;
}

function escapeHtmlChars(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface OutlineCollectionInfo {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
}

interface OutlineDocumentInfo {
  id: string;
  title: string;
  parentDocumentId?: string;
  url: string;
}

class AICopilotWidget {
  private container: HTMLElement | null = null;
  private storage: WidgetStorageInterface;
  private isExpanded = false;
  private isLoading = false;
  private messages: ChatMessage[] = [];
  private attachments: ChatAttachment[] = [];
  private currentContext: WidgetContext | null = null;
  private currentMode: CopilotMode = 'documentation';
  private pendingInputValue: string = '';
  private breadcrumbPath: string[] = [];
  
  private collections: OutlineCollectionInfo[] = [];
  private selectedCollectionId: string = '';
  private collectionDocuments: OutlineDocumentInfo[] = [];
  private selectedParentDocId: string = '';
  private isCreatingDraft = false;
  private draftTitle: string = '';
  private draftDescription: string = '';
  private listenersAttached = false;

  constructor() {
    this.storage = getStorage('ai-copilot');
    this.isExpanded = this.storage.get('isExpanded', false) ?? false;
    this.currentMode = this.storage.get('mode', 'documentation') ?? 'documentation';
    this.messages = this.storage.get('chatMessages', []) ?? [];
    this.attachments = this.storage.get('chatAttachments', []) ?? [];
  }

  private saveMessages(): void {
    this.storage.set('chatMessages', this.messages);
  }

  private saveAttachments(): void {
    this.storage.set('chatAttachments', this.attachments);
  }

  private clearChat(): void {
    this.messages = [];
    this.attachments = [];
    this.pendingInputValue = '';
    this.saveMessages();
    this.saveAttachments();
    this.render();
  }

  private getTotalAttachmentSize(): number {
    return this.attachments.reduce((sum, att) => sum + att.size, 0);
  }

  private parseVTT(content: string): string {
    const lines = content.split('\n');
    const textLines: string[] = [];
    let skipNext = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'WEBVTT' || trimmed.startsWith('NOTE')) {
        continue;
      }
      if (trimmed.includes('-->')) {
        skipNext = false;
        continue;
      }
      if (/^\d+$/.test(trimmed)) {
        continue;
      }
      if (!skipNext && trimmed) {
        textLines.push(trimmed.replace(/<[^>]*>/g, ''));
      }
    }
    
    return textLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  private async parseDocx(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const mammoth = (window as any).mammoth;
          if (!mammoth) {
            const text = await this.extractTextFromDocxFallback(arrayBuffer);
            resolve(text);
            return;
          }
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value || '');
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  private async extractTextFromDocxFallback(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(arrayBuffer);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
      const extracted = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (extracted) {
        return extracted.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
      }
      return '[Unable to extract text from document]';
    } catch {
      return '[Unable to extract text from document]';
    }
  }

  private async handleFileUpload(files: FileList | null): Promise<void> {
    console.log('[AI Copilot] handleFileUpload called, files:', files?.length);
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        alert(`File type not supported: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert(`File too large: ${file.name}. Maximum size is 10MB.`);
        continue;
      }

      if (this.getTotalAttachmentSize() + file.size > MAX_TOTAL_SIZE) {
        alert('Total attachment size limit (20MB) exceeded.');
        break;
      }

      if (this.attachments.some(a => a.filename === file.name)) {
        alert(`File already attached: ${file.name}`);
        continue;
      }

      try {
        let content: string;
        
        if (ext === '.docx' || ext === '.doc') {
          content = await this.parseDocx(file);
        } else {
          content = await this.readFileAsText(file);
          if (ext === '.vtt') {
            content = this.parseVTT(content);
          }
        }

        this.attachments.push({
          id: Math.random().toString(36).substr(2, 9),
          filename: file.name,
          content,
          size: file.size
        });
        console.log('[AI Copilot] File added to attachments:', file.name, 'Total attachments:', this.attachments.length);
      } catch (error) {
        console.error('[AI Copilot] Failed to read file:', error);
        alert(`Failed to read file: ${file.name}`);
      }
    }

    console.log('[AI Copilot] After processing, attachments count:', this.attachments.length);
    this.saveAttachments();
    this.updateAttachmentUI();
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private removeAttachment(id: string): void {
    this.attachments = this.attachments.filter(a => a.id !== id);
    this.saveAttachments();
    this.updateAttachmentUI();
  }

  private updateAttachmentUI(): void {
    console.log('[AI Copilot] updateAttachmentUI called, attachments:', this.attachments.length);
    const previewContainer = this.container?.querySelector('#attachment-preview');
    if (previewContainer) {
      previewContainer.innerHTML = this.renderAttachmentChips();
      console.log('[AI Copilot] Updated #attachment-preview');
    }
    const draftPreviewContainer = this.container?.querySelector('#attachment-preview-draft');
    if (draftPreviewContainer) {
      draftPreviewContainer.innerHTML = this.renderAttachmentChips();
      console.log('[AI Copilot] Updated #attachment-preview-draft');
    }
    this.attachAttachmentListeners();
  }

  private renderAttachmentChips(): string {
    if (this.attachments.length === 0) return '';
    
    const theme = getOutlineTheme();
    return this.attachments.map(att => `
      <div class="ai-attachment-chip" data-id="${att.id}">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
        </svg>
        <span class="ai-attachment-name" title="${att.filename}">${att.filename.length > 15 ? att.filename.slice(0, 12) + '...' : att.filename}</span>
        <button class="ai-attachment-remove" data-id="${att.id}" title="Remove">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    `).join('');
  }

  private attachAttachmentListeners(): void {
    const removeButtons = this.container?.querySelectorAll('.ai-attachment-remove');
    removeButtons?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.removeAttachment(id);
      });
    });
  }

  async mount(container: HTMLElement, context: WidgetContext): Promise<void> {
    this.container = container;
    this.currentContext = context;
    this.injectGlobalStyles();
    this.render();
    this.buildBreadcrumb(); // Async - will update display when done
    
    // Restore state if panel was previously expanded
    if (this.isExpanded) {
      document.body.classList.add('ai-copilot-open');
      // Small delay to ensure DOM is ready before finding content element
      setTimeout(() => this.adjustContentMargin(true), 100);
    }
    
    // Load collections if already in createDraft mode (from saved state)
    // Note: loadCollections() is idempotent (checks collectionsLoading flag) and handles its own render()
    if (this.currentMode === 'createDraft' && this.collections.length === 0) {
      this.loadCollections();
    }
  }

  private injectGlobalStyles(): void {
    // Only inject once - we use JS-based approach now
    if (document.getElementById('ai-copilot-global-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'ai-copilot-global-styles';
    style.textContent = `
      /* Transition for smooth margin changes */
      .ai-copilot-content-shift {
        transition: margin-right 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
    `;
    document.head.appendChild(style);
  }

  private findContentElement(): HTMLElement | null {
    // Strategy 1: Find element with inline margin-left (set by Outline for left sidebar)
    const elementsWithMarginLeft = document.querySelectorAll('div[style*="margin-left"]');
    for (const el of elementsWithMarginLeft) {
      if (el instanceof HTMLElement) {
        // Check if this is the main content area (contains the editor or is in the layout)
        const parent = el.parentElement;
        if (parent && el.querySelector('.ProseMirror, [data-portal-root]')) {
          return el;
        }
        // Check if this is a flex container with centered content
        const style = getComputedStyle(el);
        if (style.display === 'flex' && style.justifyContent === 'center') {
          return el;
        }
      }
    }
    
    // Strategy 2: Find the flex container that holds the document content
    const root = document.getElementById('root');
    if (root) {
      // Navigate through: root > Container > Container > Content
      const containers = root.querySelectorAll(':scope > div > div > div');
      for (const container of containers) {
        if (container instanceof HTMLElement) {
          const style = getComputedStyle(container);
          // Content has justify-content: center and flex display
          if (style.display === 'flex' && style.justifyContent === 'center') {
            return container;
          }
        }
      }
    }
    
    return null;
  }

  private adjustContentMargin(expand: boolean): void {
    const content = this.findContentElement();
    if (content) {
      content.classList.add('ai-copilot-content-shift');
      if (expand) {
        content.style.marginRight = '380px';
      } else {
        content.style.marginRight = '';
      }
    }
  }

  onContextChange(context: WidgetContext): void {
    this.currentContext = context;
    this.buildBreadcrumb(); // Async - will update display when done
    if (this.isExpanded) {
      this.updateContextDisplay();
    }
  }

  unmount(): void {
    this.storage.set('isExpanded', this.isExpanded);
    this.storage.set('mode', this.currentMode);
    // Clean up: restore content margin and remove body class
    this.adjustContentMargin(false);
    document.body.classList.remove('ai-copilot-open');
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
    this.listenersAttached = false;
  }

  private getModeInfo(): ModeInfo {
    return MODES.find(m => m.id === this.currentMode) || MODES[0];
  }

  private getModeColor(mode: CopilotMode, theme: OutlineTheme): { bg: string; text: string } {
    const colors: Record<CopilotMode, { bg: string; text: string }> = {
      documentation: { 
        bg: theme.isDark ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe', 
        text: theme.isDark ? '#60a5fa' : '#1d4ed8' 
      },
      workflow: { 
        bg: theme.isDark ? 'rgba(168, 85, 247, 0.2)' : '#f3e8ff', 
        text: theme.isDark ? '#c084fc' : '#7c3aed' 
      },
      sop: { 
        bg: theme.isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7', 
        text: theme.isDark ? '#4ade80' : '#15803d' 
      },
      kbChat: { 
        bg: theme.isDark ? 'rgba(251, 146, 60, 0.2)' : '#ffedd5', 
        text: theme.isDark ? '#fb923c' : '#c2410c' 
      },
      createDraft: { 
        bg: theme.isDark ? 'rgba(20, 184, 166, 0.2)' : '#ccfbf1', 
        text: theme.isDark ? '#2dd4bf' : '#0d9488' 
      }
    };
    return colors[mode];
  }

  private render(): void {
    if (!this.container) return;

    // Save current input value before re-rendering (always save, even if empty)
    const currentInput = this.container.querySelector('#ai-input') as HTMLTextAreaElement;
    if (currentInput) {
      this.pendingInputValue = currentInput.value;
    }

    const theme = getOutlineTheme();
    const modeInfo = this.getModeInfo();
    const modeColor = this.getModeColor(this.currentMode, theme);
    
    this.container.innerHTML = `
      <style>
        /* Floating toggle button - high z-index to stay visible */
        .ai-copilot-fab {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: ${theme.accent};
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: ${theme.isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(3, 102, 214, 0.3)'};
          transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
          z-index: 9200;
        }
        .ai-copilot-fab:hover {
          transform: scale(1.05);
          box-shadow: ${theme.isDark ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(3, 102, 214, 0.4)'};
        }
        .ai-copilot-fab.hidden {
          opacity: 0;
          pointer-events: none;
          transform: scale(0.8);
        }
        .ai-copilot-fab svg {
          width: 24px;
          height: 24px;
          fill: white;
        }

        /* Right sidebar - matches Outline's RightSidebar z-index (900) */
        .ai-copilot-sidebar {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: ${theme.sidebarWidth}px;
          max-width: 80%;
          background: ${theme.background};
          border-left: 1px solid ${theme.divider};
          display: flex;
          flex-direction: column;
          z-index: 900;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          transform: translateX(100%);
          opacity: 0;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
          pointer-events: none;
        }
        .ai-copilot-sidebar.expanded {
          transform: translateX(0);
          opacity: 1;
          pointer-events: auto;
        }

        /* Header - matches Outline's SidebarLayout */
        .ai-copilot-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 12px 16px 16px;
          color: ${theme.text};
          flex-shrink: 0;
          border-bottom: 1px solid ${theme.divider};
          user-select: none;
        }
        .ai-copilot-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
          flex-grow: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ai-copilot-header-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .ai-copilot-header-btn {
          background: none;
          border: none;
          color: ${theme.textSecondary};
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
        }
        .ai-copilot-header-btn:hover {
          background: ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'};
          color: ${theme.text};
        }
        .ai-copilot-header-btn svg {
          width: 20px;
          height: 20px;
          fill: currentColor;
        }

        /* Mode tabs bar */
        .ai-copilot-mode-bar {
          display: flex;
          gap: 4px;
          padding: 10px 12px;
          background: ${theme.background};
          border-bottom: 1px solid ${theme.divider};
          overflow-x: auto;
          flex-shrink: 0;
        }
        .ai-copilot-mode-bar::-webkit-scrollbar {
          height: 0;
        }
        .ai-copilot-mode-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: none;
          border-radius: 16px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
          background: transparent;
          color: ${theme.textSecondary};
        }
        .ai-copilot-mode-btn:hover {
          background: ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'};
          color: ${theme.text};
        }
        .ai-copilot-mode-btn.active {
          background: ${modeColor.bg};
          color: ${modeColor.text};
        }
        .ai-copilot-mode-btn.documentation.active {
          background: ${theme.isDark ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe'};
          color: ${theme.isDark ? '#60a5fa' : '#1d4ed8'};
        }
        .ai-copilot-mode-btn.workflow.active {
          background: ${theme.isDark ? 'rgba(168, 85, 247, 0.2)' : '#f3e8ff'};
          color: ${theme.isDark ? '#c084fc' : '#7c3aed'};
        }
        .ai-copilot-mode-btn.sop.active {
          background: ${theme.isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7'};
          color: ${theme.isDark ? '#4ade80' : '#15803d'};
        }
        .ai-copilot-mode-btn.kbChat.active {
          background: ${theme.isDark ? 'rgba(251, 146, 60, 0.2)' : '#ffedd5'};
          color: ${theme.isDark ? '#fb923c' : '#c2410c'};
        }
        .ai-copilot-mode-btn.createDraft.active {
          background: ${theme.isDark ? 'rgba(20, 184, 166, 0.2)' : '#ccfbf1'};
          color: ${theme.isDark ? '#2dd4bf' : '#0d9488'};
        }
        .ai-copilot-mode-btn svg {
          width: 14px;
          height: 14px;
          fill: currentColor;
        }
        .ai-copilot-mode-btn.documentation svg {
          color: ${theme.isDark ? '#60a5fa' : '#2563eb'};
        }
        .ai-copilot-mode-btn.workflow svg {
          color: ${theme.isDark ? '#c084fc' : '#7c3aed'};
        }
        .ai-copilot-mode-btn.sop svg {
          color: ${theme.isDark ? '#4ade80' : '#16a34a'};
        }
        .ai-copilot-mode-btn.kbChat svg {
          color: ${theme.isDark ? '#fb923c' : '#ea580c'};
        }
        .ai-copilot-mode-btn.createDraft svg {
          color: ${theme.isDark ? '#2dd4bf' : '#0d9488'};
        }

        /* Context info bar */
        .ai-copilot-context {
          padding: 10px 16px;
          background: ${theme.backgroundSecondary};
          border-bottom: 1px solid ${theme.divider};
          font-size: 12px;
          color: ${theme.textSecondary};
          flex-shrink: 0;
        }
        .ai-copilot-context strong {
          color: ${theme.text};
          font-weight: 500;
        }

        /* Messages area - scrollable with shadow effects */
        .ai-copilot-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: ${theme.background};
          position: relative;
        }
        .ai-copilot-messages::before {
          content: '';
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          height: 8px;
          background: linear-gradient(to bottom, ${theme.background}, transparent);
          pointer-events: none;
          display: block;
          margin-top: -16px;
          margin-bottom: 8px;
        }

        /* Message bubbles */
        .ai-copilot-message {
          margin-bottom: 12px;
          padding: 12px 14px;
          border-radius: 8px;
          max-width: 90%;
          word-wrap: break-word;
          font-size: 14px;
          line-height: 1.5;
        }
        .ai-copilot-message.user {
          background: ${theme.accent};
          color: white;
          margin-left: auto;
          border-bottom-right-radius: 4px;
        }
        .ai-copilot-message.assistant {
          background: ${theme.backgroundSecondary};
          color: ${theme.text};
          border-bottom-left-radius: 4px;
        }

        /* Sources section */
        .ai-copilot-sources {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid ${theme.divider};
          font-size: 12px;
          color: ${theme.textSecondary};
        }
        .ai-copilot-sources strong {
          display: block;
          margin-bottom: 4px;
        }
        .ai-copilot-sources a {
          color: ${theme.accent};
          text-decoration: none;
        }
        .ai-copilot-sources a:hover {
          text-decoration: underline;
        }

        /* KB Context Badge */
        .ai-kb-context-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          margin-bottom: 8px;
          background: ${theme.isDark ? 'rgba(74, 144, 226, 0.15)' : 'rgba(74, 144, 226, 0.1)'};
          color: ${theme.accent};
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }
        .ai-kb-context-badge svg {
          flex-shrink: 0;
        }

        /* Create Draft Form */
        .ai-copilot-draft-form {
          padding: 16px;
          border-top: 1px solid ${theme.divider};
          background: ${theme.background};
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex-shrink: 0;
        }
        .ai-draft-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ai-draft-field label {
          font-size: 12px;
          font-weight: 500;
          color: ${theme.textSecondary};
        }
        .ai-draft-select,
        .ai-draft-input,
        .ai-draft-textarea {
          padding: 8px 12px;
          border: 1px solid ${theme.inputBorder};
          border-radius: 6px;
          font-size: 14px;
          background: ${theme.background};
          color: ${theme.text};
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .ai-draft-select:focus,
        .ai-draft-input:focus,
        .ai-draft-textarea:focus {
          border-color: ${theme.accent};
          box-shadow: 0 0 0 2px ${theme.isDark ? 'rgba(3, 102, 214, 0.2)' : 'rgba(3, 102, 214, 0.1)'};
        }
        .ai-draft-textarea {
          resize: vertical;
          min-height: 60px;
        }
        .ai-draft-submit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          background: ${theme.isDark ? 'rgba(20, 184, 166, 0.2)' : '#ccfbf1'};
          border: 1px solid ${theme.isDark ? 'rgba(20, 184, 166, 0.4)' : '#5eead4'};
          color: ${theme.isDark ? '#2dd4bf' : '#0d9488'};
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ai-draft-submit:hover:not(:disabled) {
          background: ${theme.isDark ? 'rgba(20, 184, 166, 0.3)' : '#99f6e4'};
        }
        .ai-draft-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ai-draft-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid ${theme.isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(13, 148, 136, 0.3)'};
          border-top-color: ${theme.isDark ? '#2dd4bf' : '#0d9488'};
          border-radius: 50%;
          animation: ai-draft-spin 0.8s linear infinite;
        }
        @keyframes ai-draft-spin {
          to { transform: rotate(360deg); }
        }
        .ai-draft-attach-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: ${theme.backgroundSecondary};
          border: 1px solid ${theme.inputBorder};
          color: ${theme.textSecondary};
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ai-draft-attach-btn:hover {
          background: ${theme.backgroundTertiary};
          color: ${theme.text};
          border-color: ${theme.accent};
        }
        .ai-draft-attach-btn svg {
          flex-shrink: 0;
        }

        /* Input area - Replit style */
        .ai-copilot-input-area {
          padding: 12px 16px;
          border-top: 1px solid ${theme.divider};
          background: ${theme.background};
          flex-shrink: 0;
        }
        .ai-copilot-input-box {
          border: 1px solid ${theme.inputBorder};
          border-radius: 12px;
          background: ${theme.backgroundSecondary};
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .ai-copilot-input-box:focus-within {
          border-color: ${theme.accent};
          box-shadow: 0 0 0 2px ${theme.isDark ? 'rgba(3, 102, 214, 0.3)' : 'rgba(3, 102, 214, 0.15)'};
        }
        .ai-copilot-input {
          width: 100%;
          padding: 12px 14px;
          border: none;
          font-size: 14px;
          line-height: 1.5;
          outline: none;
          background: transparent;
          color: ${theme.text};
          resize: none;
          min-height: 24px;
          max-height: 150px;
          overflow-y: auto;
          font-family: inherit;
          box-sizing: border-box;
          display: block;
        }
        .ai-copilot-input::placeholder {
          color: ${theme.textTertiary};
        }
        .ai-copilot-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 6px;
          background: ${theme.backgroundSecondary};
        }
        .ai-copilot-toolbar-left {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .ai-copilot-toolbar-right {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .ai-copilot-attach {
          width: 28px;
          height: 28px;
          background: none;
          border: none;
          border-radius: 6px;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.5;
          transition: opacity 0.15s, background 0.15s;
        }
        .ai-copilot-attach:hover {
          opacity: 1;
          background: ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
        }
        .ai-copilot-attach svg {
          width: 16px;
          height: 16px;
          fill: ${theme.textSecondary};
        }
        .ai-copilot-attach:hover svg {
          fill: ${theme.text};
        }
        .ai-copilot-send {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: ${theme.accent};
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s;
          flex-shrink: 0;
        }
        .ai-copilot-send:hover {
          opacity: 0.9;
        }
        .ai-copilot-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ai-copilot-send svg {
          width: 14px;
          height: 14px;
          fill: white;
        }

        /* Attachment styles */
        .ai-copilot-input-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        #ai-file-input {
          display: none;
        }
        .ai-attachment-preview {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ai-attachment-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          background: ${theme.backgroundSecondary};
          border: 1px solid ${theme.inputBorder};
          border-radius: 14px;
          font-size: 12px;
          color: ${theme.textSecondary};
          max-width: 150px;
        }
        .ai-attachment-chip svg {
          flex-shrink: 0;
        }
        .ai-attachment-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ai-attachment-remove {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background 0.2s;
        }
        .ai-attachment-remove:hover {
          background: ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
        }
        .ai-attachment-remove svg {
          fill: ${theme.textTertiary};
        }
        .ai-attachment-remove:hover svg {
          fill: ${theme.text};
        }

        /* Loading indicator */
        .ai-copilot-loading {
          display: flex;
          gap: 4px;
          padding: 12px 0;
        }
        .ai-copilot-loading span {
          width: 6px;
          height: 6px;
          background: ${theme.accent};
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .ai-copilot-loading span:nth-child(1) { animation-delay: -0.32s; }
        .ai-copilot-loading span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        /* Empty state */
        .ai-copilot-empty {
          text-align: center;
          color: ${theme.textSecondary};
          padding: 60px 24px;
        }
        .ai-copilot-empty svg {
          width: 48px;
          height: 48px;
          fill: ${theme.divider};
          margin-bottom: 16px;
        }
        .ai-copilot-empty p {
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
        }
        .ai-copilot-empty .mode-hint {
          margin-top: 8px;
          font-size: 13px;
          color: ${modeColor.text};
        }
        
        /* Markdown formatting styles */
        .ai-md-p { margin: 0 0 8px 0; }
        .ai-md-p:last-child { margin-bottom: 0; }
        .ai-md-h1, .ai-md-h2, .ai-md-h3 {
          margin: 12px 0 8px 0;
          font-weight: 600;
          line-height: 1.3;
        }
        .ai-md-h1 { font-size: 16px; }
        .ai-md-h2 { font-size: 15px; }
        .ai-md-h3 { font-size: 14px; }
        .ai-md-code-block {
          background: ${theme.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)'};
          border-radius: 6px;
          padding: 10px 12px;
          margin: 8px 0;
          overflow-x: auto;
          font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
          font-size: 12px;
          line-height: 1.5;
        }
        .ai-md-code-block code { color: ${theme.text}; }
        .ai-md-inline-code {
          background: ${theme.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)'};
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
          font-size: 12px;
        }
        .ai-md-ul, .ai-md-ol { margin: 8px 0; padding-left: 20px; }
        .ai-md-ul-item, .ai-md-ol-item { margin: 4px 0; }
        .ai-md-link { color: ${theme.accent}; text-decoration: none; }
        .ai-md-link:hover { text-decoration: underline; }
        
        /* Message action buttons */
        .ai-message-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};
        }
        .ai-action-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border: 1px solid ${theme.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'};
          border-radius: 6px;
          background: ${theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'};
          color: ${theme.textSecondary};
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ai-action-btn:hover {
          background: ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          color: ${theme.text};
          border-color: ${theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'};
        }
        .ai-action-btn.success {
          background: ${theme.isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7'};
          color: ${theme.isDark ? '#4ade80' : '#15803d'};
          border-color: ${theme.isDark ? 'rgba(34, 197, 94, 0.4)' : '#86efac'};
        }
        .ai-action-btn svg {
          width: 14px;
          height: 14px;
          fill: currentColor;
        }
        .ai-action-btn svg.spin {
          animation: spin 1s linear infinite;
        }
        .ai-action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Toast notification */
        .ai-toast {
          position: fixed;
          bottom: 80px;
          right: 24px;
          background: ${theme.isDark ? '#1f232e' : '#111319'};
          color: ${theme.isDark ? '#E6E6E6' : '#fff'};
          padding: 12px 18px;
          border-radius: 8px;
          font-size: 13px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 9500;
          animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Keyboard hint */
        .ai-keyboard-hint {
          font-size: 11px;
          color: ${theme.textTertiary};
          margin-left: 8px;
          padding: 2px 6px;
          background: ${theme.backgroundSecondary};
          border-radius: 4px;
        }
      </style>

      <!-- Floating toggle button -->
      <button class="ai-copilot-fab ${this.isExpanded ? 'hidden' : ''}" id="ai-fab" title="AI Copilot">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
      </button>

      <!-- Right sidebar panel -->
      <div class="ai-copilot-sidebar ${this.isExpanded ? 'expanded' : ''}" id="ai-sidebar">
        <div class="ai-copilot-header">
          <h2 class="ai-copilot-title">AI Copilot</h2>
          <div class="ai-copilot-header-actions">
            <button class="ai-copilot-header-btn" id="ai-clear-chat" title="Reset Chat">
              <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
            <button class="ai-copilot-header-btn" id="ai-settings" title="Settings">
              <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </button>
            <button class="ai-copilot-header-btn" id="ai-close" title="Close (Esc)">
              <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" transform="rotate(180 12 12)"/></svg>
            </button>
          </div>
        </div>

        <div class="ai-copilot-mode-bar">
          ${MODES.map(mode => `
            <button class="ai-copilot-mode-btn ${mode.id} ${mode.id === this.currentMode ? 'active' : ''}" data-mode="${mode.id}" title="${mode.description}">
              ${mode.icon}
              <span>${mode.name}</span>
            </button>
          `).join('')}
        </div>

        <div class="ai-copilot-context" id="ai-context">
          ${this.getContextLabel()}
        </div>

        <div class="ai-copilot-messages" id="ai-messages">
          ${this.renderMessages()}
        </div>

        ${this.currentMode === 'createDraft' ? `
        <div class="ai-copilot-draft-form">
          <div class="ai-draft-field">
            <label>Save Location</label>
            <select id="draft-collection" class="ai-draft-select">
              <option value="">Select where to save...</option>
              <option value="__drafts__" ${this.selectedCollectionId === '__drafts__' ? 'selected' : ''}>
                Save as Draft (review before publishing)
              </option>
              ${this.collectionsLoading ? `
                <option value="" disabled>Loading collections...</option>
              ` : this.collectionsError ? `
                <option value="" disabled>Error: ${escapeHtmlChars(this.collectionsError)}</option>
              ` : this.collections.length > 0 ? `
                <optgroup label="Publish to Collection">
                  ${this.collections.map(c => `
                    <option value="${c.id}" ${c.id === this.selectedCollectionId ? 'selected' : ''}>
                      ${escapeHtmlChars(c.name)} (${c.documentCount} docs)
                    </option>
                  `).join('')}
                </optgroup>
              ` : `
                <option value="" disabled>No collections available</option>
              `}
            </select>
          </div>
          
          ${this.selectedCollectionId && this.selectedCollectionId !== '__drafts__' && this.collectionDocuments.length > 0 ? `
          <div class="ai-draft-field">
            <label>Parent Folder (optional)</label>
            <select id="draft-parent" class="ai-draft-select">
              <option value="">Root of collection</option>
              ${this.collectionDocuments.map(d => `
                <option value="${d.id}" ${d.id === this.selectedParentDocId ? 'selected' : ''}>
                  ${escapeHtmlChars(d.title)}
                </option>
              `).join('')}
            </select>
          </div>
          ` : ''}
          
          <div class="ai-draft-field">
            <label>Document Title</label>
            <input 
              type="text" 
              id="draft-title" 
              class="ai-draft-input" 
              placeholder="Enter document title..."
              value="${escapeHtmlChars(this.draftTitle)}"
            >
          </div>
          
          <div class="ai-draft-field">
            <label>Description (optional)</label>
            <textarea 
              id="draft-description" 
              class="ai-draft-textarea" 
              placeholder="Describe what this document should contain..."
              rows="3"
            >${escapeHtmlChars(this.draftDescription)}</textarea>
          </div>
          
          <div class="ai-draft-field">
            <label>Reference Files (optional)</label>
            <input type="file" id="ai-file-input-draft" multiple accept=".txt,.doc,.docx,.vtt" style="display: none;">
            <div id="attachment-preview-draft" class="ai-attachment-preview">
              ${this.renderAttachmentChips()}
            </div>
            <button type="button" class="ai-draft-attach-btn" id="ai-attach-draft" title="Attach files (.txt, .doc, .docx, .vtt)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
              Attach Files
            </button>
          </div>
          
          <button 
            id="create-draft-btn" 
            class="ai-draft-submit"
            ${!this.selectedCollectionId || !this.draftTitle.trim() || this.isCreatingDraft ? 'disabled' : ''}
          >
            ${this.isCreatingDraft ? `
              <span class="ai-draft-spinner"></span>
              Creating...
            ` : this.selectedCollectionId === '__drafts__' ? `
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Save as Draft
            ` : `
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Create & Publish
            `}
          </button>
        </div>
        ` : `
        <div class="ai-copilot-input-area">
          <input type="file" id="ai-file-input" multiple accept=".txt,.doc,.docx,.vtt">
          <div id="attachment-preview" class="ai-attachment-preview">
            ${this.renderAttachmentChips()}
          </div>
          <div class="ai-copilot-input-box">
            <textarea 
              class="ai-copilot-input" 
              id="ai-input" 
              placeholder="${modeInfo.placeholder}"
              rows="1"
            ></textarea>
            <div class="ai-copilot-toolbar">
              <div class="ai-copilot-toolbar-left">
                <button class="ai-copilot-attach" id="ai-attach" title="Attach files (.txt, .doc, .docx, .vtt)">
                  <svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
                </button>
              </div>
              <div class="ai-copilot-toolbar-right">
                <button class="ai-copilot-send" id="ai-send" ${this.isLoading ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24"><path d="M5 12l14-7-7 14-2-5z" transform="rotate(45, 12, 12)"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        `}
      </div>
    `;

    this.attachEventListeners();
    
    // Restore input value after re-rendering (always restore, even if empty)
    const newInput = this.container?.querySelector('#ai-input') as HTMLTextAreaElement;
    if (newInput) {
      newInput.value = this.pendingInputValue;
      // Trigger auto-resize for multi-line content
      if (this.pendingInputValue) {
        newInput.style.height = 'auto';
        newInput.style.height = Math.min(newInput.scrollHeight, 150) + 'px';
      }
    }
  }

  private getContextLabel(): string {
    if (this.breadcrumbPath.length > 0) {
      return this.breadcrumbPath.join(' / ');
    }
    if (this.currentContext?.document) {
      return this.currentContext.document.title || this.currentContext.document.id;
    }
    if (this.currentContext?.route?.type === 'document' && this.currentContext.route.id) {
      return this.currentContext.route.id;
    }
    return 'unknown';
  }

  private async buildBreadcrumb(): Promise<void> {
    if (!this.currentContext?.document) {
      this.breadcrumbPath = [];
      this.updateContextDisplay();
      return;
    }

    const path: string[] = [];
    const doc = this.currentContext.document;
    const startingDocId = doc.id;
    
    // Add current document
    path.unshift(doc.title || doc.id);
    
    // Fetch parent documents recursively
    let parentId = doc.parentDocumentId;
    const visited = new Set<string>();
    
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      try {
        const response = await fetch('/api/documents.info', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: parentId }),
        });
        if (response.ok) {
          const { data } = await response.json();
          if (data?.title) {
            path.unshift(data.title);
          }
          parentId = data?.parentDocumentId;
        } else {
          break;
        }
      } catch {
        break;
      }
    }
    
    // Fetch collection name
    if (doc.collectionId) {
      try {
        const response = await fetch('/api/collections.info', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: doc.collectionId }),
        });
        if (response.ok) {
          const { data } = await response.json();
          if (data?.name) {
            path.unshift(data.name);
          }
        }
      } catch {
        // Ignore collection fetch errors
      }
    }
    
    // Guard against stale updates: only update if document context hasn't changed
    if (this.currentContext?.document?.id !== startingDocId) {
      return;
    }
    
    this.breadcrumbPath = path;
    this.updateContextDisplay();
  }

  private renderMessages(): string {
    const theme = getOutlineTheme();
    const modeInfo = this.getModeInfo();
    const modeColor = this.getModeColor(this.currentMode, theme);
    
    if (this.messages.length === 0 && !this.isLoading) {
      return `
        <div class="ai-copilot-empty">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
          <p>${modeInfo.description}</p>
          <p class="mode-hint">${modeInfo.placeholder}</p>
        </div>
      `;
    }

    let html = '';
    this.messages.forEach((msg, index) => {
      if (msg.role === 'assistant') {
        const renderedContent = renderMarkdown(msg.content, theme);
        const kbBadge = msg.usedKBContext ? `
          <div class="ai-kb-context-badge" title="This response includes context from your knowledge base">
            <svg viewBox="0 0 24 24" width="12" height="12"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>
            KB Enhanced
          </div>
        ` : '';
        html += `
          <div class="ai-copilot-message assistant">
            ${kbBadge}
            <div class="ai-message-content">${renderedContent}</div>
            ${msg.sources && msg.sources.length > 0 ? `
              <div class="ai-copilot-sources">
                <strong>Sources:</strong>
                ${msg.sources.map(s => s.url ? `<a href="${s.url}">${s.title}</a>` : s.title).join(', ')}
              </div>
            ` : ''}
            <div class="ai-message-actions">
              <button class="ai-action-btn" data-action="copy" data-index="${index}">
                <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                Copy
              </button>
              <button class="ai-action-btn" data-action="insert" data-index="${index}">
                <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Insert
              </button>
            </div>
          </div>
        `;
      } else {
        html += `<div class="ai-copilot-message user">${escapeHtmlChars(msg.content)}</div>`;
      }
    });

    if (this.isLoading) {
      html += `
        <div class="ai-copilot-message assistant">
          <div class="ai-copilot-loading">
            <span></span><span></span><span></span>
          </div>
        </div>
      `;
    }

    return html;
  }

  private attachEventListeners(): void {
    if (!this.container || this.listenersAttached) return;
    this.listenersAttached = true;
    
    // Use event delegation on container for all clicks - more robust for SPA navigation
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Check for specific buttons by matching closest with specific IDs
      if (target.closest('#ai-fab')) {
        this.togglePanel();
        return;
      }
      
      if (target.closest('#ai-close')) {
        this.togglePanel();
        return;
      }
      
      if (target.closest('#ai-settings')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[AI Copilot] Settings button clicked via delegation!');
        this.openSettings();
        return;
      }
      
      if (target.closest('#ai-send')) {
        this.sendMessage();
        return;
      }
      
      if (target.closest('#ai-attach')) {
        const fileInput = this.container?.querySelector('#ai-file-input') as HTMLInputElement;
        fileInput?.click();
        return;
      }
      
      if (target.closest('#ai-attach-draft')) {
        console.log('[AI Copilot] Draft attach button clicked');
        const fileInput = this.container?.querySelector('#ai-file-input-draft') as HTMLInputElement;
        console.log('[AI Copilot] Draft file input found:', !!fileInput);
        fileInput?.click();
        return;
      }
      
      // Handle mode buttons
      const modeBtn = target.closest('.ai-copilot-mode-btn') as HTMLElement;
      if (modeBtn) {
        const mode = modeBtn.dataset.mode as CopilotMode;
        if (mode && mode !== this.currentMode) {
          this.currentMode = mode;
          this.storage.set('mode', mode);
          
          // Load collections when switching to createDraft mode
          if (mode === 'createDraft' && this.collections.length === 0) {
            this.loadCollections();
          }
          
          this.render();
        }
      }
      
      // Handle clear chat button
      if (target.closest('#ai-clear-chat')) {
        this.clearChat();
        return;
      }
    });

    // Input keydown listener using delegation (survives re-renders)
    this.container.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'ai-input' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.togglePanel();
      }
    });

    // Draft form event listeners using event delegation (survives re-renders)
    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      
      if (target.id === 'ai-file-input' || target.id === 'ai-file-input-draft') {
        console.log('[AI Copilot] File input changed:', target.id);
        const fileInput = target as HTMLInputElement;
        console.log('[AI Copilot] Files selected:', fileInput.files?.length);
        this.handleFileUpload(fileInput.files);
        fileInput.value = '';
        return;
      }
      
      if (target.id === 'draft-collection') {
        const value = (target as HTMLSelectElement).value;
        this.selectedCollectionId = value;
        this.selectedParentDocId = '';
        this.collectionDocuments = [];
        
        // Only load documents for real collections (not __drafts__)
        if (value && value !== '__drafts__') {
          this.loadCollectionDocuments(value).then(() => this.render());
        } else {
          this.render();
        }
        return;
      }
      
      if (target.id === 'draft-parent') {
        this.selectedParentDocId = (target as HTMLSelectElement).value;
        return;
      }
    });
    
    this.container.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      
      if (target.id === 'ai-input') {
        const textarea = target as HTMLTextAreaElement;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        return;
      }
      
      if (target.id === 'draft-title') {
        this.draftTitle = (target as HTMLInputElement).value;
        // Immediately update button disabled state without full re-render
        this.updateCreateButtonState();
        return;
      }
      
      if (target.id === 'draft-description') {
        this.draftDescription = (target as HTMLTextAreaElement).value;
        return;
      }
    });

    // Create draft button handled by click delegation above, add to click handler
    // Appending to existing click handler via separate listener
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('#create-draft-btn')) {
        this.createDraft();
        return;
      }
    });

    this.attachActionListeners();
  }
  
  private openSettings(): void {
    console.log('[AI Copilot] openSettings() called');
    
    // Try direct call first (most reliable)
    const aiSettings = (window as any).__aiSettingsWidget;
    console.log('[AI Copilot] __aiSettingsWidget:', aiSettings);
    console.log('[AI Copilot] __aiSettingsWidget exists:', !!aiSettings, 'show:', !!aiSettings?.show);
    
    if (aiSettings?.show) {
      console.log('[AI Copilot] Calling aiSettings.show()...');
      try {
        aiSettings.show();
        console.log('[AI Copilot] aiSettings.show() completed');
      } catch (error) {
        console.error('[AI Copilot] Error calling show():', error);
      }
      return;
    }
    
    // Fallback to event system
    const sdk = getWidgetSDK();
    console.log('[AI Copilot] Fallback to SDK, emit:', !!sdk?.emit);
    if (sdk?.emit) {
      sdk.emit('ai-settings:open', {});
      console.log('[AI Copilot] Emitted ai-settings:open event');
    } else {
      console.error('[AI Copilot] SDK or emit not available, showing alert');
      alert('Settings not available. Please refresh the page.');
    }
  }

  private updateCreateButtonState(): void {
    const btn = this.container?.querySelector('#create-draft-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = !this.selectedCollectionId || !this.draftTitle.trim() || this.isCreatingDraft;
    }
  }

  private togglePanel(): void {
    this.isExpanded = !this.isExpanded;
    this.storage.set('isExpanded', this.isExpanded);

    const fab = this.container?.querySelector('#ai-fab');
    const sidebar = this.container?.querySelector('#ai-sidebar');

    if (this.isExpanded) {
      fab?.classList.add('hidden');
      sidebar?.classList.add('expanded');
      // Push content aside using JS-based margin adjustment
      this.adjustContentMargin(true);
      document.body.classList.add('ai-copilot-open');
      const input = this.container?.querySelector('#ai-input') as HTMLInputElement;
      setTimeout(() => input?.focus(), 300);
      
      // Load collections when opening panel in createDraft mode
      if (this.currentMode === 'createDraft' && this.collections.length === 0) {
        this.loadCollections();
      }
    } else {
      fab?.classList.remove('hidden');
      sidebar?.classList.remove('expanded');
      // Restore content width
      this.adjustContentMargin(false);
      document.body.classList.remove('ai-copilot-open');
    }
  }

  private updateContextDisplay(): void {
    const contextEl = this.container?.querySelector('#ai-context');
    if (contextEl) {
      contextEl.innerHTML = `${this.getContextLabel()}`;
    }
  }

  private async sendMessage(): Promise<void> {
    const input = this.container?.querySelector('#ai-input') as HTMLInputElement;
    const message = input?.value.trim();
    if (!message || this.isLoading) return;

    this.messages.push({ role: 'user', content: message });
    input.value = '';
    this.pendingInputValue = '';
    this.isLoading = true;
    this.updateMessages();

    try {
      if (this.currentMode === 'kbChat') {
        await this.handleKBChat(message);
      } else {
        await this.handleCopilotChat(message);
      }
    } catch (error) {
      console.error('[AI Copilot] Request failed:', error);
      this.messages.push({ 
        role: 'assistant', 
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your API key in settings.`
      });
    }

    this.isLoading = false;
    this.updateMessages();
  }

  private async handleCopilotChat(message: string): Promise<void> {
    const documentId = this.currentContext?.document?.id ||
                       (this.currentContext?.route?.type === 'document' ? this.currentContext.route.id : null);

    const attachmentsPayload = this.attachments.map(att => ({
      id: att.id,
      filename: att.filename,
      content: att.content
    }));

    // Get document content: try live editor DOM first, then cached context
    let documentContent = this.currentContext?.document?.text || '';
    const editorEl = document.querySelector('.ProseMirror');
    if (editorEl) {
      const editorText = editorEl.textContent?.trim() || '';
      if (editorText.length > documentContent.length) {
        // Editor has more content than cached API response — use it
        documentContent = editorText;
        console.log('[AI Copilot] Using live editor content:', documentContent.length, 'chars');
      }
    }
    console.log('[AI Copilot] Document content for chat:', {
      cachedLength: this.currentContext?.document?.text?.length ?? 0,
      finalLength: documentContent.length,
      documentId,
      preview: documentContent.substring(0, 100),
    });

    const response = await fetch(`${AI_SERVICE_URL}/copilot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: message,
        mode: this.currentMode,
        documentId,
        documentPath: this.breadcrumbPath.length > 0 ? this.breadcrumbPath.join(' / ') : undefined,
        documentContent,
        conversationHistory: this.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
        attachments: attachmentsPayload
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.answer) {
      const kbSources = data.usedKBContext && data.kbSources?.length > 0 
        ? data.kbSources.map((s: any) => ({ title: s.title, url: s.url }))
        : undefined;
      
      this.messages.push({ 
        role: 'assistant', 
        content: data.answer,
        sources: kbSources,
        usedKBContext: data.usedKBContext
      });
    } else {
      throw new Error(data.error?.message || 'No response received');
    }
  }

  private async handleKBChat(message: string): Promise<void> {
    const response = await fetch(`${AI_SERVICE_URL}/rag/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: message,
        limit: 5
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.answer) {
      const sources = data.sources?.map((s: any) => ({
        title: s.title,
        url: s.url
      })) || [];
      
      this.messages.push({ 
        role: 'assistant', 
        content: data.answer,
        sources: sources.length > 0 ? sources : undefined
      });
    } else {
      throw new Error(data.error?.message || 'No response received');
    }
  }

  private collectionsLoading = false;
  private collectionsError: string | null = null;

  private async loadCollections(): Promise<void> {
    if (this.collectionsLoading) return;
    
    this.collectionsLoading = true;
    this.collectionsError = null;
    console.log('[AI Copilot] Loading collections...');
    this.render(); // Show loading state immediately
    
    try {
      const response = await fetch(`${AI_SERVICE_URL}/documents/collections`, {
        credentials: 'include'
      });
      
      console.log('[AI Copilot] Collections response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[AI Copilot] Collections data:', data);
        if (data.success) {
          this.collections = data.collections || [];
          console.log('[AI Copilot] Loaded', this.collections.length, 'collections');
        } else {
          this.collectionsError = data.error?.message || 'Failed to load collections';
          console.error('[AI Copilot] Collections API error:', this.collectionsError);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        this.collectionsError = errorData.error?.message || `HTTP ${response.status}`;
        console.error('[AI Copilot] Collections HTTP error:', this.collectionsError);
      }
    } catch (error) {
      this.collectionsError = error instanceof Error ? error.message : 'Network error';
      console.error('[AI Copilot] Failed to load collections:', error);
    } finally {
      this.collectionsLoading = false;
      this.render();
    }
  }

  private async loadCollectionDocuments(collectionId: string): Promise<void> {
    try {
      const response = await fetch(`${AI_SERVICE_URL}/documents/collections/${collectionId}/documents`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          this.collectionDocuments = data.documents || [];
        }
      }
    } catch (error) {
      console.error('[AI Copilot] Failed to load documents:', error);
    }
  }

  private async createDraft(): Promise<void> {
    if (!this.draftTitle.trim() || !this.selectedCollectionId || this.isCreatingDraft) return;

    const isSavingAsDraft = this.selectedCollectionId === '__drafts__';
    this.isCreatingDraft = true;
    this.render();

    try {
      // First generate content with AI using the builder endpoint
      const aiResponse = await fetch(`${AI_SERVICE_URL}/builder/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: this.draftTitle,
          template: 'sop',
          inputs: {
            goal: this.draftDescription || `Create a well-structured, professional document about ${this.draftTitle}`
          },
          attachments: this.attachments.map(att => ({
            id: att.id,
            filename: att.filename,
            content: att.content
          })),
          publish: false
        })
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to generate content');
      }

      const aiData = await aiResponse.json();
      if (!aiData.success || !aiData.document?.markdown) {
        throw new Error('No content generated');
      }
      
      const generatedContent = aiData.document.markdown;

      // Build request body based on save location
      const requestBody: Record<string, any> = {
        title: this.draftTitle,
        text: generatedContent,
        publish: !isSavingAsDraft
      };

      // Only include collection/parent when publishing to a real collection
      if (!isSavingAsDraft) {
        requestBody.collectionId = this.selectedCollectionId;
        if (this.selectedParentDocId) {
          requestBody.parentDocumentId = this.selectedParentDocId;
        }
      }

      // Create the document
      const createResponse = await fetch(`${AI_SERVICE_URL}/documents/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create document');
      }

      const createData = await createResponse.json();
      if (createData.success && createData.document) {
        // Show success message based on save type
        const successMessage = isSavingAsDraft 
          ? `Draft "${this.draftTitle}" saved! You can find it in your Drafts section to review and publish later.\n\n[Open Draft](${createData.document.url})`
          : `Document "${this.draftTitle}" created and published!\n\n[Open Document](${createData.document.url})`;
        
        this.messages.push({
          role: 'assistant',
          content: successMessage
        });
        this.saveMessages();
        
        // Reset form
        this.draftTitle = '';
        this.draftDescription = '';
        this.selectedParentDocId = '';
      } else {
        throw new Error('Failed to create document');
      }
    } catch (error) {
      console.error('[AI Copilot] Create draft failed:', error);
      this.messages.push({
        role: 'assistant',
        content: `Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      this.saveMessages();
    } finally {
      this.isCreatingDraft = false;
      this.render();
    }
  }

  private updateMessages(): void {
    const messagesEl = this.container?.querySelector('#ai-messages');
    if (messagesEl) {
      messagesEl.innerHTML = this.renderMessages();
      messagesEl.scrollTop = messagesEl.scrollHeight;
      this.attachActionListeners();
    }

    const sendBtn = this.container?.querySelector('#ai-send') as HTMLButtonElement;
    if (sendBtn) {
      sendBtn.disabled = this.isLoading;
    }
    
    this.updateAttachmentUI();
    this.saveMessages();
  }

  private attachActionListeners(): void {
    const actionBtns = this.container?.querySelectorAll('.ai-action-btn');
    actionBtns?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const action = target.dataset.action;
        const index = parseInt(target.dataset.index || '0', 10);
        const message = this.messages[index];
        
        if (!message || message.role !== 'assistant') return;
        
        if (action === 'copy') {
          this.copyToClipboard(message.content, target);
        } else if (action === 'insert') {
          this.insertIntoDocument(message.content, target);
        }
      });
    });
  }

  private async copyToClipboard(content: string, button: HTMLElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      button.classList.add('success');
      button.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        Copied!
      `;
      setTimeout(() => {
        button.classList.remove('success');
        button.innerHTML = `
          <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          Copy
        `;
      }, 2000);
    } catch (error) {
      console.error('[AI Copilot] Copy failed:', error);
      this.showToast('Failed to copy to clipboard');
    }
  }

  private async insertIntoDocument(content: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.innerHTML = `
      <svg viewBox="0 0 24 24" class="spin"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
      Inserting...
    `;

    try {
      // Try direct editor insertion via paste event dispatch
      const pasteResult = await this.insertViaPasteEvent(content);

      if (pasteResult.success) {
        button.classList.add('success');
        button.innerHTML = `
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          Inserted!
        `;
        this.showToast('Content inserted into document!');

        setTimeout(() => {
          button.classList.remove('success');
          button.disabled = false;
          button.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Insert
          `;
        }, 2000);
      } else {
        console.log('[AI Copilot] Paste insert failed, trying ProseMirror fallback:', pasteResult.error);
        const yjsResult = await this.insertViaYjs(content);
        if (yjsResult.success) {
          button.classList.add('success');
          button.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            Inserted!
          `;
          this.showToast('Content inserted into document!');
          setTimeout(() => {
            button.classList.remove('success');
            button.disabled = false;
            button.innerHTML = `
              <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Insert
            `;
          }, 2000);
        } else {
          console.log('[AI Copilot] ProseMirror insert failed, using clipboard:', yjsResult.error);
          await this.clipboardFallback(content, button, 'Insert failed');
        }
      }
    } catch (error) {
      console.error('[AI Copilot] Insert failed:', error);
      await this.clipboardFallback(content, button, 'Insert failed');
    }
  }

  private async insertViaPasteEvent(content: string): Promise<{ success: boolean; error?: string }> {
    try {
      const editor = document.querySelector('.ProseMirror') as HTMLElement;
      if (!editor) {
        return { success: false, error: 'Editor not found' };
      }

      // Focus the editor and move cursor to end
      editor.focus();

      // Place cursor at the end of the document
      const selection = window.getSelection();
      if (selection) {
        selection.selectAllChildren(editor);
        selection.collapseToEnd();
      }

      // Prefix content with a newline separator
      const insertContent = '\n\n---\n\n## AI Copilot Response\n\n' + content;

      // Create and dispatch a paste event with the content
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', insertContent);

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      });

      const handled = !editor.dispatchEvent(pasteEvent);
      console.log('[AI Copilot] Paste event dispatched, prevented default:', handled);

      if (handled) {
        return { success: true };
      }

      return { success: false, error: 'Paste event was not handled by editor' };
    } catch (error) {
      console.error('[AI Copilot] insertViaPasteEvent error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async insertViaYjs(content: string): Promise<{ success: boolean; error?: string }> {
    const maxRetries = 3;
    const retryDelay = 500;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`[AI Copilot] Looking for ProseMirror editor (attempt ${attempt + 1}/${maxRetries})...`);
        const proseMirrorElement = document.querySelector('.ProseMirror');
        if (!proseMirrorElement) {
          console.log('[AI Copilot] No .ProseMirror element found in DOM');
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          return { success: false, error: 'Editor not found' };
        }
        console.log('[AI Copilot] Found .ProseMirror element');

        const view = this.findEditorView(proseMirrorElement);
        if (!view) {
          console.log('[AI Copilot] Could not find EditorView on element');
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          return { success: false, error: 'EditorView not found' };
        }

        console.log('[AI Copilot] Found EditorView, inserting via ProseMirror transaction');
        this.insertViaProseMirror(view, content);
        return { success: true };
      } catch (error) {
        console.error('[AI Copilot] insertViaYjs error:', error);
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  private insertViaProseMirror(view: any, content: string): void {
    console.log('[AI Copilot] insertViaProseMirror starting...');
    const state = view.state;
    const schema = state.schema;
    const doc = state.doc;
    
    console.log('[AI Copilot] Schema nodes available:', Object.keys(schema.nodes));
    console.log('[AI Copilot] Current doc size:', doc.content.size);
    
    const nodes: any[] = [];
    const headingType = schema.nodes.heading;
    const paragraphType = schema.nodes.paragraph;
    const bulletListType = schema.nodes.bullet_list || schema.nodes.bulletList;
    const orderedListType = schema.nodes.ordered_list || schema.nodes.orderedList;
    const listItemType = schema.nodes.list_item || schema.nodes.listItem;
    const codeBlockType = schema.nodes.code_block || schema.nodes.codeBlock;
    
    if (paragraphType) {
      nodes.push(paragraphType.create());
    }
    
    if (headingType) {
      nodes.push(headingType.create({ level: 2 }, schema.text('AI Copilot Response')));
    }

    const lines = content.split('\n');
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeLanguage = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = line.slice(3).trim();
          codeLines = [];
        } else {
          inCodeBlock = false;
          if (codeBlockType && codeLines.length > 0) {
            const codeText = codeLines.join('\n');
            nodes.push(codeBlockType.create(
              codeLanguage ? { language: codeLanguage } : {},
              codeText ? schema.text(codeText) : null
            ));
          }
          codeLines = [];
          codeLanguage = '';
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      if (line.trim() === '') {
        if (paragraphType) {
          nodes.push(paragraphType.create());
        }
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch && headingType) {
        const level = headingMatch[1].length;
        const text = this.parseInlineFormatting(headingMatch[2], schema);
        nodes.push(headingType.create({ level }, text));
        continue;
      }

      const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
      if (bulletMatch && bulletListType && listItemType && paragraphType) {
        const text = this.parseInlineFormatting(bulletMatch[2], schema);
        const listItem = listItemType.create({}, paragraphType.create({}, text));
        nodes.push(bulletListType.create({}, listItem));
        continue;
      }

      const numberedMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
      if (numberedMatch && orderedListType && listItemType && paragraphType) {
        const text = this.parseInlineFormatting(numberedMatch[2], schema);
        const listItem = listItemType.create({}, paragraphType.create({}, text));
        nodes.push(orderedListType.create({}, listItem));
        continue;
      }

      if (paragraphType) {
        const text = this.parseInlineFormatting(line, schema);
        nodes.push(paragraphType.create({}, text));
      }
    }

    if (nodes.length === 0) return;

    const Fragment = state.doc.constructor.prototype.constructor.prototype.constructor;
    const fragment = Fragment?.from ? Fragment.from(nodes) : nodes;

    const tr = state.tr;
    const endPos = doc.content.size;
    
    if (fragment.content !== undefined) {
      tr.insert(endPos, fragment);
    } else {
      let insertPos = endPos;
      for (const node of nodes) {
        tr.insert(insertPos, node);
        insertPos = tr.mapping.map(insertPos) + node.nodeSize;
      }
    }

    view.dispatch(tr);
    console.log('[AI Copilot] ProseMirror transaction dispatched with', nodes.length, 'nodes');
  }

  private parseInlineFormatting(text: string, schema: any): any[] | any {
    const result: any[] = [];
    
    const boldMark = schema.marks.strong || schema.marks.bold;
    const italicMark = schema.marks.em || schema.marks.italic;
    const codeMark = schema.marks.code;
    
    const patterns = [
      { regex: /\*\*(.+?)\*\*/g, mark: boldMark },
      { regex: /__(.+?)__/g, mark: boldMark },
      { regex: /\*(.+?)\*/g, mark: italicMark },
      { regex: /_(.+?)_/g, mark: italicMark },
      { regex: /`(.+?)`/g, mark: codeMark },
    ];
    
    let hasFormatting = false;
    for (const { regex } of patterns) {
      if (regex.test(text)) {
        hasFormatting = true;
        break;
      }
    }

    if (!hasFormatting) {
      return schema.text(text);
    }

    let lastIndex = 0;
    const segments: { text: string; marks: any[] }[] = [];
    
    const allMatches: { index: number; length: number; innerText: string; mark: any }[] = [];
    
    for (const { regex, mark } of patterns) {
      if (!mark) continue;
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        allMatches.push({
          index: match.index,
          length: match[0].length,
          innerText: match[1],
          mark
        });
      }
    }

    allMatches.sort((a, b) => a.index - b.index);

    for (const match of allMatches) {
      if (match.index < lastIndex) continue;
      
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), marks: [] });
      }
      
      segments.push({ text: match.innerText, marks: [match.mark] });
      lastIndex = match.index + match.length;
    }

    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), marks: [] });
    }

    for (const segment of segments) {
      if (segment.text) {
        let node = schema.text(segment.text);
        for (const mark of segment.marks) {
          node = node.mark(mark.create());
        }
        result.push(node);
      }
    }

    return result.length > 0 ? result : schema.text(text);
  }

  private findEditorView(element: Element): any | null {
    console.log('[AI Copilot] findEditorView called on element:', element.className);
    
    const checkNode = (node: any): any | null => {
      if (node?.pmViewDesc?.view) {
        return node.pmViewDesc.view;
      }
      if ((node as any)?.view?.state?.doc) {
        return (node as any).view;
      }
      return null;
    };

    let view = checkNode(element);
    if (view) {
      console.log('[AI Copilot] Found view on root element');
      return view;
    }

    if (element.firstElementChild) {
      view = checkNode(element.firstElementChild);
      if (view) {
        console.log('[AI Copilot] Found view on first child');
        return view;
      }
    }

    const allChildren = element.querySelectorAll('*');
    console.log('[AI Copilot] Checking', allChildren.length, 'descendant elements');
    
    for (let i = 0; i < Math.min(allChildren.length, 50); i++) {
      view = checkNode(allChildren[i]);
      if (view) {
        console.log('[AI Copilot] Found view on descendant', i);
        return view;
      }
    }

    let parent = element.parentElement;
    let parentDepth = 0;
    while (parent && parentDepth < 20) {
      parentDepth++;
      view = checkNode(parent);
      if (view) {
        console.log('[AI Copilot] Found view in parent at depth', parentDepth);
        return view;
      }
      parent = parent.parentElement;
    }
    console.log('[AI Copilot] Checked', parentDepth, 'parent nodes, no view found');

    console.log('[AI Copilot] Trying React DevTools or global references...');
    const win = window as any;
    
    if (win.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      try {
        const fiberRoot = (element as any)._reactRootContainer?._internalRoot;
        if (fiberRoot) {
          console.log('[AI Copilot] Found React fiber root');
        }
      } catch (e) {}
    }

    const editorElements = document.querySelectorAll('[data-editor]');
    console.log('[AI Copilot] Found', editorElements.length, 'elements with data-editor');
    for (const el of editorElements) {
      view = checkNode(el);
      if (view) {
        console.log('[AI Copilot] Found view via data-editor attribute');
        return view;
      }
    }

    return null;
  }

  private async insertViaApi(content: string, button: HTMLButtonElement): Promise<void> {
    const documentId = this.currentContext?.document?.id || 
                       (this.currentContext?.route?.type === 'document' ? this.currentContext.route.id : null);
    
    if (!documentId) {
      await this.clipboardFallback(content, button, 'No document selected');
      return;
    }

    try {
      const response = await fetch(`${AI_SERVICE_URL}/copilot/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, content })
      });

      const result = await response.json();

      if (result.success) {
        button.classList.add('success');
        button.innerHTML = `
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          Inserted!
        `;
        this.showRefreshPrompt();
        
        setTimeout(() => {
          button.classList.remove('success');
          button.disabled = false;
          button.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Insert
          `;
        }, 2000);
      } else {
        await this.clipboardFallback(content, button, result.error?.message || 'API failed');
      }
    } catch (error) {
      await this.clipboardFallback(content, button, 'Network error');
    }
  }

  private async clipboardFallback(content: string, button: HTMLButtonElement, reason: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      
      button.disabled = false;
      button.classList.add('success');
      button.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        Copied!
      `;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const shortcut = isMac ? 'Cmd+V' : 'Ctrl+V';
      this.showToast(`${reason}. Content copied - press ${shortcut} to paste.`);
      
      setTimeout(() => {
        button.classList.remove('success');
        button.innerHTML = `
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Insert
        `;
      }, 2000);
    } catch (clipboardError) {
      button.disabled = false;
      button.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        Insert
      `;
      this.showToast(`${reason}. Please copy the content manually.`);
    }
  }

  private showToast(message: string): void {
    const existingToast = document.querySelector('.ai-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'ai-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  private showRefreshPrompt(): void {
    const theme = getOutlineTheme();
    const existingPrompt = document.querySelector('.ai-refresh-prompt');
    if (existingPrompt) {
      existingPrompt.remove();
    }

    const prompt = document.createElement('div');
    prompt.className = 'ai-refresh-prompt';
    prompt.innerHTML = `
      <div style="
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: ${theme.isDark ? '#1f232e' : '#ffffff'};
        color: ${theme.text};
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        border: 1px solid ${theme.divider};
        z-index: 10001;
        max-width: 300px;
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <div style="font-weight: 600; margin-bottom: 8px;">Content Saved</div>
        <div style="font-size: 13px; color: ${theme.textSecondary}; margin-bottom: 12px;">
          The content has been added to your document. Click refresh to see the changes.
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="ai-refresh-btn" style="
            flex: 1;
            padding: 8px 16px;
            background: ${theme.accent};
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
          ">Refresh Now</button>
          <button id="ai-dismiss-btn" style="
            padding: 8px 12px;
            background: transparent;
            color: ${theme.textSecondary};
            border: 1px solid ${theme.divider};
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Later</button>
        </div>
      </div>
    `;
    document.body.appendChild(prompt);

    document.getElementById('ai-refresh-btn')?.addEventListener('click', () => {
      window.location.reload();
    });

    document.getElementById('ai-dismiss-btn')?.addEventListener('click', () => {
      prompt.remove();
    });

    setTimeout(() => {
      if (document.body.contains(prompt)) {
        prompt.remove();
      }
    }, 15000);
  }
}

const copilotWidget = new AICopilotWidget();

const definition: WidgetDefinition = {
  id: 'ai-copilot',
  name: 'AI Copilot',
  version: WIDGET_VERSION,
  description: 'AI-powered document assistant',
  mountPoint: {
    type: 'floating',
    position: 'bottom-right',
    priority: 90,
  },
  permissions: ['documents.read'],
  onMount: (container, context) => copilotWidget.mount(container, context),
  onUnmount: () => copilotWidget.unmount(),
  onContextChange: (context) => copilotWidget.onContextChange(context),
};

getWidgetSDK().register(definition);

export default definition;
