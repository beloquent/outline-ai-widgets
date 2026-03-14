import { Network, DataSet } from 'vis-network/standalone';
const COLLECTION_COLORS = [
    '#4A90D9', '#50C878', '#FF6B6B', '#FFB347', '#DDA0DD',
    '#87CEEB', '#F0E68C', '#98FB98', '#DEB887', '#E6E6FA'
];
class GraphViewWidget {
    constructor() {
        this.id = 'graph-view';
        this.name = 'Graph View';
        this.version = '1.0.0';
        this.mountPoint = {
            type: 'floating',
            position: 'bottom-right',
            priority: 85
        };
        this.container = null;
        this.isVisible = false;
        this.overlay = null;
        this.graphContainer = null;
        this.network = null;
        this.collections = [];
        this.collectionColorMap = new Map();
        this.currentDocumentId = null;
        this.isLocalMode = false;
        this.depth = 2;
        this.keyboardListenerAttached = false;
    }
    onMount(container, context) {
        this.container = container;
        console.log('[Graph View] Mounted');
        if (!this.keyboardListenerAttached) {
            document.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
                    e.preventDefault();
                    this.toggleGraph();
                }
                if (e.key === 'Escape' && this.isVisible) {
                    this.hideGraph();
                }
            });
            this.keyboardListenerAttached = true;
        }
        this.render();
    }
    onUnmount() {
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
    render() {
        if (!this.container)
            return;
        this.container.innerHTML = `
      <button id="graph-view-btn" style="
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      ">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <circle cx="5" cy="5" r="2"/>
          <circle cx="19" cy="5" r="2"/>
          <circle cx="12" cy="12" r="2"/>
          <circle cx="5" cy="19" r="2"/>
          <circle cx="19" cy="19" r="2"/>
          <line x1="7" y1="5" x2="10" y2="10"/>
          <line x1="17" y1="5" x2="14" y2="10"/>
          <line x1="7" y1="19" x2="10" y2="14"/>
          <line x1="17" y1="19" x2="14" y2="14"/>
        </svg>
      </button>
    `;
        const btn = this.container.querySelector('#graph-view-btn');
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.5)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
        });
        btn.addEventListener('click', () => this.toggleGraph());
        btn.title = 'Graph View (Ctrl+G)';
    }
    toggleGraph() {
        if (this.isVisible) {
            this.hideGraph();
        }
        else {
            this.showGraph();
        }
    }
    async showGraph() {
        this.isVisible = true;
        this.currentDocumentId = this.getCurrentDocumentId();
        this.createOverlay();
        await this.loadCollections();
        await this.loadGraphData();
    }
    hideGraph() {
        this.isVisible = false;
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }
    getCurrentDocumentId() {
        const match = window.location.pathname.match(/\/doc\/([a-zA-Z0-9-]+)/);
        return match ? match[1] : null;
    }
    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'graph-view-overlay';
        this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 10000;
      display: flex;
      flex-direction: column;
    `;
        const isDark = document.documentElement.classList.contains('dark') ||
            document.body.classList.contains('dark') ||
            window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.overlay.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        background: ${isDark ? '#1a1a2e' : '#f8f9fa'};
        border-bottom: 1px solid ${isDark ? '#2d2d44' : '#e0e0e0'};
      ">
        <div style="display: flex; align-items: center; gap: 16px;">
          <h2 style="margin: 0; color: ${isDark ? '#fff' : '#333'}; font-size: 18px;">Graph View</h2>
          <div style="display: flex; gap: 8px;">
            <button id="graph-mode-global" style="
              padding: 6px 12px;
              border-radius: 6px;
              border: 1px solid ${isDark ? '#444' : '#ccc'};
              background: ${!this.isLocalMode ? '#6366f1' : 'transparent'};
              color: ${!this.isLocalMode ? '#fff' : (isDark ? '#ccc' : '#666')};
              cursor: pointer;
              font-size: 13px;
            ">Global</button>
            <button id="graph-mode-local" style="
              padding: 6px 12px;
              border-radius: 6px;
              border: 1px solid ${isDark ? '#444' : '#ccc'};
              background: ${this.isLocalMode ? '#6366f1' : 'transparent'};
              color: ${this.isLocalMode ? '#fff' : (isDark ? '#ccc' : '#666')};
              cursor: pointer;
              font-size: 13px;
              ${!this.currentDocumentId ? 'opacity: 0.5; cursor: not-allowed;' : ''}
            ">Local</button>
          </div>
          ${this.isLocalMode ? `
            <div style="display: flex; align-items: center; gap: 8px;">
              <label style="color: ${isDark ? '#ccc' : '#666'}; font-size: 13px;">Depth:</label>
              <input id="graph-depth" type="range" min="1" max="3" value="${this.depth}" style="width: 80px;">
              <span id="graph-depth-value" style="color: ${isDark ? '#ccc' : '#666'}; font-size: 13px;">${this.depth}</span>
            </div>
          ` : ''}
          <select id="graph-collection-filter" style="
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid ${isDark ? '#444' : '#ccc'};
            background: ${isDark ? '#2d2d44' : '#fff'};
            color: ${isDark ? '#fff' : '#333'};
            font-size: 13px;
          ">
            <option value="">All Collections</option>
          </select>
          <label style="display: flex; align-items: center; gap: 6px; color: ${isDark ? '#ccc' : '#666'}; font-size: 13px;">
            <input type="checkbox" id="graph-show-orphans" checked>
            Show orphans
          </label>
          <div style="display: flex; align-items: center; gap: 16px; margin-left: 24px; padding-left: 24px; border-left: 1px solid ${isDark ? '#444' : '#ccc'};">
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg width="30" height="10">
                <line x1="0" y1="5" x2="30" y2="5" stroke="${isDark ? 'rgba(147, 112, 219, 0.9)' : 'rgba(128, 0, 128, 0.8)'}" stroke-width="3"/>
              </svg>
              <span style="color: ${isDark ? '#ccc' : '#666'}; font-size: 12px;">Explicit link</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <svg width="30" height="10">
                <line x1="0" y1="5" x2="30" y2="5" stroke="${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'}" stroke-width="1" stroke-dasharray="4,4"/>
              </svg>
              <span style="color: ${isDark ? '#ccc' : '#666'}; font-size: 12px;">Parent-child</span>
            </div>
          </div>
        </div>
        <button id="graph-close-btn" style="
          background: none;
          border: none;
          cursor: pointer;
          color: ${isDark ? '#fff' : '#333'};
          font-size: 24px;
          padding: 4px 8px;
        ">&times;</button>
      </div>
      <div id="graph-container" style="flex: 1; position: relative; width: 100%; height: calc(100vh - 70px);">
        <div id="graph-loading" style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #fff;
          font-size: 16px;
        ">Loading graph...</div>
      </div>
    `;
        document.body.appendChild(this.overlay);
        this.overlay.querySelector('#graph-close-btn')?.addEventListener('click', () => this.hideGraph());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay)
                this.hideGraph();
        });
        this.overlay.querySelector('#graph-mode-global')?.addEventListener('click', () => {
            if (!this.isLocalMode)
                return;
            this.isLocalMode = false;
            this.hideGraph();
            this.showGraph();
        });
        this.overlay.querySelector('#graph-mode-local')?.addEventListener('click', () => {
            if (this.isLocalMode || !this.currentDocumentId)
                return;
            this.isLocalMode = true;
            this.hideGraph();
            this.showGraph();
        });
        const depthInput = this.overlay.querySelector('#graph-depth');
        if (depthInput) {
            depthInput.addEventListener('input', (e) => {
                this.depth = parseInt(e.target.value);
                const depthValue = this.overlay?.querySelector('#graph-depth-value');
                if (depthValue)
                    depthValue.textContent = String(this.depth);
                this.loadGraphData();
            });
        }
        this.overlay.querySelector('#graph-collection-filter')?.addEventListener('change', () => {
            this.loadGraphData();
        });
        this.overlay.querySelector('#graph-show-orphans')?.addEventListener('change', () => {
            this.loadGraphData();
        });
        this.graphContainer = this.overlay.querySelector('#graph-container');
    }
    async loadCollections() {
        try {
            const response = await fetch('/ai/graph/collections', {
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                this.collections = data.collections || [];
                this.collections.forEach((col, index) => {
                    this.collectionColorMap.set(col.id, col.color || COLLECTION_COLORS[index % COLLECTION_COLORS.length]);
                });
                const select = this.overlay?.querySelector('#graph-collection-filter');
                if (select) {
                    this.collections.forEach(col => {
                        const option = document.createElement('option');
                        option.value = col.id;
                        option.textContent = col.name;
                        select.appendChild(option);
                    });
                }
            }
        }
        catch (error) {
            console.error('[Graph View] Failed to load collections:', error);
        }
    }
    async loadGraphData() {
        const loading = this.overlay?.querySelector('#graph-loading');
        if (loading)
            loading.textContent = 'Loading graph...';
        try {
            let url = '/ai/graph/documents';
            if (this.isLocalMode && this.currentDocumentId) {
                url = `/ai/graph/local/${this.currentDocumentId}?depth=${this.depth}`;
            }
            console.log('[Graph View] Fetching graph data from:', url, 'isLocalMode:', this.isLocalMode);
            const response = await fetch(url, {
                credentials: 'include',
                cache: 'no-store'
            });
            console.log('[Graph View] Response status:', response.status, 'ok:', response.ok);
            if (!response.ok) {
                const error = await response.json();
                console.error('[Graph View] API error:', error);
                if (loading)
                    loading.textContent = error.message || 'Failed to load graph';
                return;
            }
            const data = await response.json();
            console.log('[Graph View] Received data:', {
                nodeCount: data.nodes?.length,
                edgeCount: data.edges?.length,
                centerId: data.centerId
            });
            const collectionFilter = this.overlay?.querySelector('#graph-collection-filter')?.value;
            const showOrphans = this.overlay?.querySelector('#graph-show-orphans')?.checked ?? true;
            let filteredNodes = data.nodes;
            if (collectionFilter) {
                filteredNodes = filteredNodes.filter(n => n.collectionId === collectionFilter);
            }
            const nodeIds = new Set(filteredNodes.map(n => n.id));
            let filteredEdges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
            if (!showOrphans) {
                const connectedIds = new Set();
                filteredEdges.forEach(e => {
                    connectedIds.add(e.source);
                    connectedIds.add(e.target);
                });
                filteredNodes = filteredNodes.filter(n => connectedIds.has(n.id));
            }
            this.renderGraph(filteredNodes, filteredEdges, data.centerId);
        }
        catch (error) {
            console.error('[Graph View] Failed to load graph:', error);
            if (loading)
                loading.textContent = 'Failed to load graph';
        }
    }
    renderGraph(nodes, edges, centerId) {
        console.log('[Graph View] renderGraph called with', nodes.length, 'nodes,', edges.length, 'edges');
        if (!this.graphContainer) {
            console.error('[Graph View] No graph container found!');
            return;
        }
        console.log('[Graph View] Container dimensions:', this.graphContainer.offsetWidth, 'x', this.graphContainer.offsetHeight);
        const loading = this.overlay?.querySelector('#graph-loading');
        if (this.network) {
            this.network.destroy();
        }
        const isDark = document.documentElement.classList.contains('dark') ||
            document.body.classList.contains('dark') ||
            window.matchMedia('(prefers-color-scheme: dark)').matches;
        const visNodes = nodes.map(node => {
            const baseSize = 15 + Math.min(node.linkCount * 3, 30);
            const color = this.collectionColorMap.get(node.collectionId || '') || '#6366f1';
            const isCenter = node.id === centerId || node.url?.includes(centerId || '');
            return {
                id: node.id,
                label: node.title.length > 25 ? node.title.substring(0, 25) + '...' : node.title,
                title: `${node.title}\n${node.collectionName || 'No collection'}\n${node.linkCount} connections`,
                size: baseSize,
                color: {
                    background: color,
                    border: isCenter ? '#fff' : color,
                    highlight: { background: color, border: '#fff' },
                    hover: { background: color, border: '#fff' }
                },
                borderWidth: isCenter ? 3 : 1,
                font: {
                    color: isDark ? '#fff' : '#333',
                    size: 12
                },
                url: node.url
            };
        });
        const visEdges = edges.map((edge, index) => {
            const isHierarchy = edge.type === 'hierarchy';
            return {
                id: `edge-${index}`,
                from: edge.source,
                to: edge.target,
                color: {
                    color: isHierarchy
                        ? (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)')
                        : (isDark ? 'rgba(147, 112, 219, 0.85)' : 'rgba(128, 0, 128, 0.7)'),
                    highlight: isHierarchy
                        ? (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)')
                        : (isDark ? 'rgba(147, 112, 219, 1)' : 'rgba(128, 0, 128, 0.9)'),
                    hover: isHierarchy
                        ? (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)')
                        : (isDark ? 'rgba(147, 112, 219, 1)' : 'rgba(128, 0, 128, 0.9)')
                },
                dashes: isHierarchy ? [4, 4] : false,
                width: isHierarchy ? 1 : 3,
                arrows: { to: { enabled: true, scaleFactor: 0.5 } }
            };
        });
        const options = {
            nodes: {
                shape: 'dot',
                scaling: { min: 10, max: 50 }
            },
            edges: {
                smooth: { enabled: true, type: 'continuous', roundness: 0.5 }
            },
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -3000,
                    centralGravity: 0.3,
                    springLength: 150,
                    springConstant: 0.04,
                    damping: 0.09,
                    avoidOverlap: 0.5
                },
                stabilization: {
                    enabled: true,
                    iterations: 200,
                    updateInterval: 25
                }
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                zoomView: true,
                dragView: true
            }
        };
        try {
            console.log('[Graph View] Creating Network with bundled vis-network...');
            const nodesDataset = new DataSet(visNodes);
            const edgesDataset = new DataSet(visEdges);
            console.log('[Graph View] DataSets created, nodes:', nodesDataset.length, 'edges:', edgesDataset.length);
            if (loading)
                loading.remove();
            this.network = new Network(this.graphContainer, {
                nodes: nodesDataset,
                edges: edgesDataset
            }, options);
            console.log('[Graph View] Network created successfully');
            this.network.on('click', (params) => {
                if (params.nodes.length > 0) {
                    const nodeId = params.nodes[0];
                    const node = visNodes.find(n => n.id === nodeId);
                    if (node?.url) {
                        this.hideGraph();
                        window.location.href = node.url;
                    }
                }
            });
            this.network.on('stabilizationProgress', (params) => {
                const progress = Math.round((params.iterations / params.total) * 100);
                console.log('[Graph View] Stabilizing:', progress + '%');
            });
            this.network.once('stabilizationIterationsDone', () => {
                console.log('[Graph View] Stabilization complete');
                this.network.setOptions({ physics: { enabled: false } });
            });
            if (centerId) {
                const centerNode = visNodes.find(n => n.id === centerId || n.url?.includes(centerId));
                if (centerNode) {
                    setTimeout(() => {
                        this.network.focus(centerNode.id, { scale: 1.2, animation: true });
                    }, 500);
                }
            }
        }
        catch (err) {
            console.error('[Graph View] Error creating network:', err);
            if (loading)
                loading.textContent = 'Error rendering graph';
        }
    }
}
const graphViewWidget = new GraphViewWidget();
function getWidgetSDK() {
    return window.widgetSDK;
}
const definition = {
    id: 'graph-view',
    name: 'Graph View',
    version: '1.0.0',
    description: 'Visualize document relationships like Obsidian Graph View',
    mountPoint: {
        type: 'floating',
        position: 'bottom-right',
        priority: 85,
    },
    permissions: ['documents.read'],
    onMount: (container, context) => graphViewWidget.onMount(container, context),
    onUnmount: () => graphViewWidget.onUnmount(),
};
getWidgetSDK().register(definition);
export default definition;
//# sourceMappingURL=index.js.map