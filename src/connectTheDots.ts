import { app } from "./comfyApp";
import styles from "./connectTheDots.css";

const EXTENSION_NAME = "connect-the-dots";
const MENU_LABEL = "Connect The Dots";
const PANEL_ID = "connect-the-dots-panel";
const STYLE_ID = "ctd-connect-the-dots-style";
const PANEL_ROOT_CLASS = "ctd-panel";
const PANEL_CONTENT_CLASS = "ctd-panel-content";
const PANEL_MARGIN_PX = 16;
const PANEL_MAX_WIDTH_PX = 420;
const PANEL_COMPACT_BREAKPOINT_PX = 900;
const PREVIEW_HORIZONTAL_RATIO = 0.5;
const PREVIEW_VERTICAL_RATIO = 0.25;

type SlotDirection = "input" | "output";
type SlotTypeValue = string | number | null | undefined | SlotTypeValue[];

interface GraphSlot {
    label?: string;
    localized_name?: string;
    name?: string;
    type?: SlotTypeValue;
    link?: number | null;
    links?: number[];
    widget?: { name?: string };
}

interface GraphLink {
    origin_id: number | string;
    origin_slot: number;
    target_id: number | string;
    target_slot: number;
}

interface GraphLike {
    nodes?: GraphNode[];
    _nodes?: GraphNode[];
    links?: Record<number | string, GraphLink>;
    _links?: Record<number | string, GraphLink> | Map<number, GraphLink>;
    getNodeById?(id: number | string): GraphNode | null;
}

interface GraphNode {
    id: number | string;
    title?: string;
    type?: string;
    graph?: GraphLike | null;
    inputs?: GraphSlot[];
    outputs?: GraphSlot[];
    pos?: [number, number];
    size?: [number, number];
    boundingRect?: [number, number, number, number];
    getTitle?(): string;
    connect(originSlot: number, targetNode: GraphNode, targetSlot: number): unknown;
    canConnectTo(targetNode: GraphNode, targetSlot: GraphSlot, sourceSlot: GraphSlot): boolean;
}

interface CanvasView {
    graph?: GraphLike | null;
    offset: [number, number];
    scale: number;
}

interface PanelStatus {
    message: string;
    state: string;
}

interface HighlightOptions {
    strokeStyle: string;
    fillStyle: string;
    shadowColor: string;
    lineWidth?: number;
    radius?: number;
    shadowBlur?: number;
}

interface CandidateDescriptor {
    node: GraphNode;
    nodeName: string;
    slotIndex: number;
    slotName: string;
    typeName: string;
    connect(): unknown;
}

interface PropertyDescriptor {
    index: number;
    slot: GraphSlot;
    name: string;
}

interface CanvasDisplaySpace {
    offset: [number, number];
    scale: number;
}

interface CanvasLike {
    graph?: GraphLike | null;
    canvas?: (HTMLCanvasElement & { parentNode?: ParentNode | null }) | null;
    ds?: CanvasDisplaySpace;
    onDrawForeground?: (ctx: CanvasRenderingContext2D, visibleArea?: unknown) => void;
    __ctdDrawWrapped?: boolean;
    setDirty(foreground?: boolean, background?: boolean): void;
    createPanel(title: string, options: { closable: boolean }): PanelLike;
    centerOnNode?(node: GraphNode): void;
    setGraph?(graph: GraphLike): void;
}

interface AppLike {
    canvas?: CanvasLike;
    registerExtension(extension: {
        name: string;
        getNodeMenuItems?: (node: GraphNode) => (ContextMenuItem | null)[];
        setup?: () => void;
    }): void;
}

interface ContextMenuItem {
    content: string;
    callback?: () => void;
    disabled?: boolean;
}

interface PanelLike extends HTMLElement {
    content: HTMLElement;
    title_element: HTMLElement;
    footer?: HTMLElement;
    node?: GraphNode;
    graph?: GraphLike | null;
    close?(): void;
    onClose?: () => void;
    __ctdBaseView?: CanvasView | null;
    __ctdStatus?: PanelStatus | null;
    __ctdConnectionWatcher?: number | null;
    __ctdConnectionSignature?: string;
    __ctdHostObserver?: ResizeObserver | null;
}

declare const LiteGraph: {
    EVENT?: unknown;
    ACTION?: unknown;
};

const comfyApp = app as unknown as AppLike;

class ConnectTheDotsPanelAdapter {
    public mount(panel: PanelLike): boolean {
        const host = this.getHost();
        if (!host) {
            return false;
        }

        this.configurePanel(panel, host);
        host.append(panel);
        return true;
    }

    public disconnect(panel: PanelLike | null): void {
        if (!panel?.__ctdHostObserver) {
            return;
        }

        panel.__ctdHostObserver.disconnect();
        panel.__ctdHostObserver = null;
    }

    private configurePanel(panel: PanelLike, host: HTMLElement): void {
        panel.id = PANEL_ID;
        panel.classList.add("settings", PANEL_ROOT_CLASS);
        panel.content.classList.add(PANEL_CONTENT_CLASS);

        if (panel.footer) {
            panel.footer.style.setProperty("display", "none", "important");
        }

        const altContent = panel.querySelector<HTMLElement>(".dialog-alt-content");
        if (altContent) {
            altContent.style.setProperty("display", "none", "important");
        }

        this.disconnect(panel);
        this.applyPlacement(panel, host);

        if (typeof ResizeObserver !== "function") {
            return;
        }

        const observer = new ResizeObserver(() => this.applyPlacement(panel, host));
        observer.observe(host);
        panel.__ctdHostObserver = observer;
    }

    private applyPlacement(panel: PanelLike, host: HTMLElement): void {
        const isCompact = host.clientWidth < PANEL_COMPACT_BREAKPOINT_PX;
        panel.style.position = "absolute";
        panel.style.top = `${PANEL_MARGIN_PX}px`;
        panel.style.right = `${PANEL_MARGIN_PX}px`;
        panel.style.bottom = `${PANEL_MARGIN_PX}px`;
        panel.style.left = isCompact ? `${PANEL_MARGIN_PX}px` : "auto";
        panel.style.width = isCompact ? "auto" : `${PANEL_MAX_WIDTH_PX}px`;
        panel.style.maxWidth = `calc(100% - ${PANEL_MARGIN_PX * 2}px)`;
        panel.style.zIndex = "1300";
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.overflow = "hidden";
        panel.style.pointerEvents = "auto";
    }

    private getHost(): HTMLElement | null {
        const graphCanvasContainer = this.getGraphCanvasContainer();
        const graphCanvasPanel = graphCanvasContainer?.querySelector<HTMLElement>(".graph-canvas-panel");
        if (graphCanvasPanel) {
            return graphCanvasPanel;
        }

        if (graphCanvasContainer) {
            return graphCanvasContainer;
        }

        const host = comfyApp.canvas?.canvas?.parentElement;
        return host instanceof HTMLElement ? host : null;
    }

    private getGraphCanvasContainer(): HTMLElement | null {
        const container = document.getElementById("graph-canvas-container");
        return container instanceof HTMLElement ? container : null;
    }
}

class ConnectTheDotsExtension {
    private currentPanel: PanelLike | null = null;
    private previewNode: GraphNode | null = null;
    private sidebarTargetNode: GraphNode | null = null;
    private readonly panelAdapter = new ConnectTheDotsPanelAdapter();

    public register(): void {
        comfyApp.registerExtension({
            name: `jtreminio.${EXTENSION_NAME}`,
            getNodeMenuItems: this.getNodeMenuItems,
            setup: this.setup,
        });
    }

    private setup = (): void => {
        const canvas = comfyApp.canvas;
        if (!canvas || canvas.__ctdDrawWrapped) {
            return;
        }

        const originalOnDrawForeground = canvas.onDrawForeground;
        canvas.onDrawForeground = (ctx, visibleArea) => {
            originalOnDrawForeground?.call(canvas, ctx, visibleArea);
            this.drawHighlights(ctx, canvas);
        };
        canvas.__ctdDrawWrapped = true;
    };

    private getNodeMenuItems = (node: GraphNode): (ContextMenuItem | null)[] => {
        if (!node) {
            return [];
        }

        return [
            null,
            {
                content: MENU_LABEL,
                callback: () => this.showPanel(node),
            },
        ];
    };

    private ensureStyles(): void {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = styles;
        document.head.appendChild(style);
    }

    private escapeHtml(value: unknown): string {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    private getSlotDisplayName(slot: GraphSlot | undefined, fallback = "slot"): string {
        return slot?.label || slot?.localized_name || slot?.name || fallback;
    }

    private getNodeDisplayName(node: GraphNode | null | undefined): string {
        return node?.getTitle?.() || node?.title || node?.type || `Node ${node?.id ?? "?"}`;
    }

    private getTypeDisplay(type: SlotTypeValue): string {
        if (Array.isArray(type)) {
            return type.map((value) => this.getTypeDisplay(value)).join(", ");
        }
        if (type == null || type === "" || type === 0 || type === "0" || type === "*") {
            return "*";
        }
        if (type === LiteGraph.EVENT) {
            return "EVENT";
        }
        if (type === LiteGraph.ACTION) {
            return "ACTION";
        }
        return String(type);
    }

    private setPreviewNode(node: GraphNode | null): void {
        if (this.previewNode === node) {
            return;
        }

        this.previewNode = node;
        comfyApp.canvas?.setDirty(true, true);
    }

    private setSidebarTargetNode(node: GraphNode | null): void {
        if (this.sidebarTargetNode === node) {
            return;
        }

        this.sidebarTargetNode = node;
        comfyApp.canvas?.setDirty(true, true);
    }

    private drawNodeHighlight(
        ctx: CanvasRenderingContext2D,
        canvas: CanvasLike,
        node: GraphNode | null,
        options: HighlightOptions,
    ): void {
        if (!node || !canvas || node.graph !== canvas.graph || !canvas.ds) {
            return;
        }

        const bounds = node.boundingRect;
        if (!bounds) {
            return;
        }

        const [x, y, width, height] = bounds;
        const radius = (options.radius ?? 10) / canvas.ds.scale;
        const lineWidth = (options.lineWidth ?? 3) / canvas.ds.scale;
        const shadowBlur = (options.shadowBlur ?? 18) / canvas.ds.scale;

        ctx.save();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = options.strokeStyle;
        ctx.fillStyle = options.fillStyle;
        ctx.shadowColor = options.shadowColor;
        ctx.shadowBlur = shadowBlur;
        ctx.beginPath();

        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(x, y, width, height, radius);
        } else {
            ctx.rect(x, y, width, height);
        }

        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    private drawHighlights(ctx: CanvasRenderingContext2D, canvas: CanvasLike): void {
        this.drawNodeHighlight(ctx, canvas, this.sidebarTargetNode, {
            strokeStyle: "#d9b84f",
            fillStyle: "rgba(217, 184, 79, 0.05)",
            shadowColor: "rgba(217, 184, 79, 0.24)",
            lineWidth: 3,
            radius: 10,
            shadowBlur: 12,
        });

        this.drawNodeHighlight(ctx, canvas, this.previewNode, {
            strokeStyle: "#7bc96f",
            fillStyle: "rgba(123, 201, 111, 0.08)",
            shadowColor: "rgba(123, 201, 111, 0.45)",
            lineWidth: 3,
            radius: 10,
            shadowBlur: 18,
        });
    }

    private getGraphNodes(node: GraphNode): GraphNode[] {
        return node.graph?.nodes || node.graph?._nodes || [];
    }

    private getGraphLink(graph: GraphLike | null | undefined, linkId: number | null | undefined): GraphLink | null {
        if (!graph || linkId == null) {
            return null;
        }

        const internalLinks = graph._links;
        if (internalLinks && typeof (internalLinks as Map<number, GraphLink>).get === "function") {
            return (internalLinks as Map<number, GraphLink>).get(linkId) ?? null;
        }

        return (
            (internalLinks as Record<number | string, GraphLink> | undefined)?.[linkId] ??
            graph.links?.[linkId] ??
            null
        );
    }

    private getConnectedNodeLabel(
        graph: GraphLike | null | undefined,
        linkId: number | null | undefined,
        side: SlotDirection,
    ): string | null {
        const link = this.getGraphLink(graph, linkId);
        if (!link) {
            return null;
        }

        if (side === "input") {
            const originNode = graph?.getNodeById?.(link.origin_id);
            const originSlot = originNode?.outputs?.[link.origin_slot];
            return `${this.getNodeDisplayName(originNode)} -> ${this.getSlotDisplayName(originSlot, `output ${link.origin_slot}`)}`;
        }

        const targetNode = graph?.getNodeById?.(link.target_id);
        const targetSlot = targetNode?.inputs?.[link.target_slot];
        return `${this.getNodeDisplayName(targetNode)} -> ${this.getSlotDisplayName(targetSlot, `input ${link.target_slot}`)}`;
    }

    private getCandidateConnectionCount(
        targetNode: GraphNode,
        property: PropertyDescriptor,
        mode: SlotDirection,
        candidate: CandidateDescriptor,
    ): number {
        if (!targetNode.graph) {
            return 0;
        }

        if (mode === "input") {
            const link = this.getGraphLink(targetNode.graph, property.slot.link ?? null);
            return link && link.origin_id === candidate.node.id && link.origin_slot === candidate.slotIndex ? 1 : 0;
        }

        return (property.slot.links || []).reduce((count, linkId) => {
            const link = this.getGraphLink(targetNode.graph, linkId);
            return link && link.target_id === candidate.node.id && link.target_slot === candidate.slotIndex ? count + 1 : count;
        }, 0);
    }

    private getPropertyConnectionCount(property: PropertyDescriptor, mode: SlotDirection): number {
        return mode === "input" ? (property.slot.link != null ? 1 : 0) : (property.slot.links?.length || 0);
    }

    private getConnectionPillText(count: number, mode: SlotDirection): string {
        if (!count) {
            return "";
        }

        if (mode === "input") {
            return "Connected";
        }

        return count === 1 ? "1 Linked" : `${count} Linked`;
    }

    private collectInputCandidates(targetNode: GraphNode, inputIndex: number, input: GraphSlot): CandidateDescriptor[] {
        return this.getGraphNodes(targetNode)
            .filter((sourceNode) => sourceNode && sourceNode !== targetNode)
            .flatMap((sourceNode) =>
                (sourceNode.outputs || []).map((output, slotIndex) => ({
                    node: sourceNode,
                    nodeName: this.getNodeDisplayName(sourceNode),
                    slotIndex,
                    slotName: this.getSlotDisplayName(output, `output ${slotIndex}`),
                    typeName: this.getTypeDisplay(output?.type),
                    connect: () => sourceNode.connect(slotIndex, targetNode, inputIndex),
                })),
            )
            .filter((candidate) => candidate.node.canConnectTo(targetNode, input, candidate.node.outputs?.[candidate.slotIndex] ?? {}))
            .sort((a, b) =>
                a.nodeName.localeCompare(b.nodeName, undefined, { numeric: true, sensitivity: "base" }) ||
                a.slotName.localeCompare(b.slotName, undefined, { numeric: true, sensitivity: "base" }),
            );
    }

    private collectOutputCandidates(sourceNode: GraphNode, outputIndex: number, output: GraphSlot): CandidateDescriptor[] {
        return this.getGraphNodes(sourceNode)
            .filter((targetNode) => targetNode && targetNode !== sourceNode)
            .flatMap((targetNode) =>
                (targetNode.inputs || []).map((input, slotIndex) => ({
                    node: targetNode,
                    nodeName: this.getNodeDisplayName(targetNode),
                    slotIndex,
                    slotName: this.getSlotDisplayName(input, `input ${slotIndex}`),
                    typeName: this.getTypeDisplay(input?.type),
                    connect: () => sourceNode.connect(outputIndex, targetNode, slotIndex),
                })),
            )
            .filter((candidate) => sourceNode.canConnectTo(candidate.node, candidate.node.inputs?.[candidate.slotIndex] ?? {}, output))
            .sort((a, b) =>
                a.nodeName.localeCompare(b.nodeName, undefined, { numeric: true, sensitivity: "base" }) ||
                a.slotName.localeCompare(b.slotName, undefined, { numeric: true, sensitivity: "base" }),
            );
    }

    private captureCanvasView(): CanvasView {
        const offset = comfyApp.canvas?.ds?.offset || [0, 0];
        return {
            graph: comfyApp.canvas?.graph,
            offset: [offset[0], offset[1]],
            scale: comfyApp.canvas?.ds?.scale ?? 1,
        };
    }

    private restoreCanvasView(view: CanvasView | null | undefined): void {
        const canvas = comfyApp.canvas;
        if (!view || !canvas?.ds) {
            return;
        }

        if (view.graph && canvas.graph !== view.graph) {
            canvas.setGraph?.(view.graph);
        }

        canvas.ds.offset[0] = view.offset[0];
        canvas.ds.offset[1] = view.offset[1];
        canvas.ds.scale = view.scale;
        canvas.setDirty(true, true);
    }

    private focusNodeAtScale(node: GraphNode, scale: number): boolean {
        const canvas = comfyApp.canvas;
        if (!canvas?.ds || !canvas.canvas) {
            return false;
        }

        const bounds = node.boundingRect || [node.pos?.[0] || 0, node.pos?.[1] || 0, node.size?.[0] || 0, node.size?.[1] || 0];
        const devicePixelRatio = window.devicePixelRatio || 1;
        const canvasWidth = canvas.canvas.width;
        const canvasHeight = canvas.canvas.height;
        if (!canvasWidth || !canvasHeight) {
            return false;
        }

        const viewWidth = canvasWidth / (scale * devicePixelRatio);
        const viewHeight = canvasHeight / (scale * devicePixelRatio);
        const targetCenterX = viewWidth * PREVIEW_HORIZONTAL_RATIO;
        const targetTopY = viewHeight * PREVIEW_VERTICAL_RATIO;

        canvas.ds.scale = scale;
        canvas.ds.offset[0] = -bounds[0] - bounds[2] * 0.5 + targetCenterX;
        canvas.ds.offset[1] = -bounds[1] + targetTopY;
        return true;
    }

    private beginCandidatePreview(panel: PanelLike, candidateNode: GraphNode): void {
        const canvas = comfyApp.canvas;
        if (!panel || !candidateNode || !canvas) {
            return;
        }

        if (!panel.__ctdBaseView) {
            panel.__ctdBaseView = this.captureCanvasView();
        }

        if (canvas.graph !== candidateNode.graph) {
            return;
        }

        this.setPreviewNode(candidateNode);
        const previewScale = panel.__ctdBaseView?.scale ?? canvas.ds?.scale ?? 1;
        if (!this.focusNodeAtScale(candidateNode, previewScale)) {
            canvas.centerOnNode?.(candidateNode);
        }
        canvas.setDirty(true, true);
    }

    private endCandidatePreview(panel: PanelLike | null): void {
        if (!panel) {
            return;
        }

        this.setPreviewNode(null);
        if (panel.__ctdBaseView) {
            this.restoreCanvasView(panel.__ctdBaseView);
            panel.__ctdBaseView = null;
        }
    }

    private getNodeConnectionSignature(targetNode: GraphNode): string {
        if (!targetNode.graph) {
            return "";
        }

        const inputSignature = (targetNode.inputs || []).map((slot, index) => {
            const link = this.getGraphLink(targetNode.graph, slot.link ?? null);
            return link ? `in:${index}:${link.origin_id}:${link.origin_slot}` : `in:${index}:-`;
        });

        const outputSignature = (targetNode.outputs || []).map((slot, index) => {
            const targets = (slot.links || [])
                .map((linkId) => this.getGraphLink(targetNode.graph, linkId))
                .filter((link): link is GraphLink => Boolean(link))
                .map((link) => `${link.target_id}:${link.target_slot}`)
                .sort();
            return `out:${index}:${targets.join(",")}`;
        });

        return [...inputSignature, ...outputSignature].join("|");
    }

    private stopPanelConnectionWatcher(panel: PanelLike | null): void {
        if (!panel?.__ctdConnectionWatcher) {
            return;
        }

        window.clearInterval(panel.__ctdConnectionWatcher);
        panel.__ctdConnectionWatcher = null;
    }

    private startPanelConnectionWatcher(panel: PanelLike, targetNode: GraphNode): void {
        this.stopPanelConnectionWatcher(panel);
        panel.__ctdConnectionSignature = this.getNodeConnectionSignature(targetNode);
        panel.__ctdConnectionWatcher = window.setInterval(() => {
            if (this.currentPanel !== panel || panel.node !== targetNode) {
                this.stopPanelConnectionWatcher(panel);
                return;
            }

            if (!document.body.contains(panel)) {
                this.stopPanelConnectionWatcher(panel);
                return;
            }

            const nextSignature = this.getNodeConnectionSignature(targetNode);
            if (nextSignature === panel.__ctdConnectionSignature) {
                return;
            }

            this.endCandidatePreview(panel);
            this.renderPanel(panel, targetNode);
        }, 150);
    }

    private closePanel(): void {
        const panel = document.querySelector<PanelLike>(`#${PANEL_ID}`);
        if (!panel) {
            return;
        }

        this.stopPanelConnectionWatcher(panel);
        this.panelAdapter.disconnect(panel);

        if (typeof panel.close === "function") {
            panel.close();
            return;
        }

        panel.onClose?.();
        panel.remove();
    }

    private setPanelStatus(panel: PanelLike, message: string | null, state = ""): void {
        panel.__ctdStatus = message ? { message, state } : null;
    }

    private buildCandidateRow(label: string, value: string, tone = ""): string {
        const toneAttribute = tone ? ` data-tone="${this.escapeHtml(tone)}"` : "";
        return `
        <span class="ctd-candidate-row">
            <span class="ctd-candidate-label">${this.escapeHtml(label)}</span>
            <span class="ctd-candidate-value"${toneAttribute}>${this.escapeHtml(value)}</span>
        </span>
    `;
    }

    private createCandidateButton(
        panel: PanelLike,
        targetNode: GraphNode,
        property: PropertyDescriptor,
        mode: SlotDirection,
        candidate: CandidateDescriptor,
    ): HTMLDivElement {
        const shell = document.createElement("div");
        shell.className = "ctd-candidate-shell";

        const gutter = document.createElement("div");
        gutter.className = "ctd-candidate-gutter";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "ctd-candidate";

        const connectedCount = this.getCandidateConnectionCount(targetNode, property, mode, candidate);
        const isConnected = connectedCount > 0;
        const nodeLabel = mode === "input" ? "Node" : "Target Node";
        const propertyLabel = mode === "input" ? "Property" : "Target Property";

        button.innerHTML = `
        ${this.buildCandidateRow(nodeLabel, candidate.nodeName)}
        ${this.buildCandidateRow(propertyLabel, candidate.slotName, "accent")}
        ${mode === "input" ? "" : this.buildCandidateRow("Type", candidate.typeName)}
    `;

        if (isConnected) {
            const marker = document.createElement("span");
            marker.className = "ctd-connection-marker";
            marker.setAttribute("aria-hidden", "true");
            gutter.append(marker);
        }

        button.addEventListener("mouseenter", () => this.beginCandidatePreview(panel, candidate.node));
        button.addEventListener("mouseleave", () => this.endCandidatePreview(panel));
        button.addEventListener("click", () => {
            if (isConnected) {
                this.endCandidatePreview(panel);
                return;
            }

            const baseView = panel.__ctdBaseView || this.captureCanvasView();
            const link = candidate.connect();
            this.restoreCanvasView(baseView);
            panel.__ctdBaseView = null;

            if (!link) {
                this.setPanelStatus(panel, "ComfyUI rejected that connection.", "error");
                this.renderPanel(panel, targetNode);
                return;
            }

            this.setPanelStatus(panel, null);
            this.renderPanel(panel, targetNode);
        });

        shell.append(gutter, button);
        return shell;
    }

    private createPropertyCard(panel: PanelLike, targetNode: GraphNode, property: PropertyDescriptor, mode: SlotDirection): HTMLDivElement {
        const card = document.createElement("div");
        card.className = "ctd-slot-card";

        const typeName = this.getTypeDisplay(property.slot.type);
        const stateLines: string[] = [];
        const candidateList = document.createElement("div");
        candidateList.className = "ctd-candidate-list";

        const propertyConnectionCount = this.getPropertyConnectionCount(property, mode);
        const propertyPillText = this.getConnectionPillText(propertyConnectionCount, mode);

        let candidates: CandidateDescriptor[] = [];
        if (mode === "input") {
            candidates = this.collectInputCandidates(targetNode, property.index, property.slot);
        } else {
            candidates = this.collectOutputCandidates(targetNode, property.index, property.slot);
            const currentTargets = (property.slot.links || [])
                .map((linkId) => this.getConnectedNodeLabel(targetNode.graph, linkId, "output"))
                .filter((label): label is string => Boolean(label));

            stateLines.push(
                currentTargets.length
                    ? `Currently connected to ${currentTargets.length} target${currentTargets.length === 1 ? "" : "s"}: ${currentTargets.join(", ")}`
                    : "Currently unconnected",
            );
        }

        card.innerHTML = `
        <div class="ctd-slot-head">
            <span class="ctd-slot-name">${this.escapeHtml(property.name)}</span>
            <span class="ctd-slot-meta">
                ${propertyPillText ? `<span class="ctd-connection-pill">${this.escapeHtml(propertyPillText)}</span>` : ""}
                <span class="ctd-slot-type">${this.escapeHtml(typeName)}</span>
            </span>
        </div>
        ${stateLines.length ? `<div class="ctd-slot-state">${this.escapeHtml(stateLines.join(" "))}</div>` : ""}
    `;

        if (candidates.length) {
            if (mode !== "input") {
                const label = document.createElement("div");
                label.className = "ctd-subtitle";
                label.textContent = "Compatible targets";
                candidateList.append(label);
            }

            for (const candidate of candidates) {
                candidateList.append(this.createCandidateButton(panel, targetNode, property, mode, candidate));
            }
        } else {
            const empty = document.createElement("div");
            empty.className = "ctd-empty";
            empty.textContent =
                mode === "input"
                    ? "No compatible source properties were found in this graph."
                    : "No compatible target properties were found in this graph.";
            candidateList.append(empty);
        }

        card.append(candidateList);
        return card;
    }

    private buildPropertyList(panel: PanelLike, targetNode: GraphNode, slots: PropertyDescriptor[], mode: SlotDirection): HTMLDivElement {
        const section = document.createElement("div");
        section.className = "ctd-section";

        const title = document.createElement("div");
        title.className = "ctd-section-title";
        title.textContent = mode === "input" ? "Inputs" : "Outputs";
        section.append(title);

        const help = document.createElement("div");
        help.className = "ctd-section-help";
        help.textContent = mode === "input" ? "Choose a source property for each input." : "Choose where each output should connect.";
        section.append(help);

        if (!slots.length) {
            const empty = document.createElement("div");
            empty.className = "ctd-empty";
            empty.textContent = mode === "input" ? "This node has no inputs." : "This node has no outputs.";
            section.append(empty);
            return section;
        }

        for (const property of slots) {
            section.append(this.createPropertyCard(panel, targetNode, property, mode));
        }

        return section;
    }

    private renderPanel(panel: PanelLike, targetNode: GraphNode): void {
        const previousScrollTop = panel.content?.scrollTop ?? 0;
        const inputs = (targetNode.inputs || []).map((slot, index) => ({
            index,
            slot,
            name: this.getSlotDisplayName(slot, `input ${index}`),
        }));
        const outputs = (targetNode.outputs || []).map((slot, index) => ({
            index,
            slot,
            name: this.getSlotDisplayName(slot, `output ${index}`),
        }));

        panel.title_element.textContent = MENU_LABEL;
        panel.content.innerHTML = "";

        const shell = document.createElement("div");
        shell.className = "ctd-shell";
        panel.content.append(shell);

        const hero = document.createElement("div");
        hero.className = "ctd-hero";
        hero.innerHTML = `
        <div class="ctd-title">${this.escapeHtml(this.getNodeDisplayName(targetNode))}</div>
        <div class="ctd-subtitle">${this.escapeHtml(targetNode.type || "unknown node type")}</div>
        <div class="ctd-help">Hover any candidate property to jump the canvas there. Moving away or selecting it restores your original view. Keep connecting until you close the sidebar.</div>
    `;
        shell.append(hero);

        if (panel.__ctdStatus?.message && panel.__ctdStatus.state === "error") {
            const status = document.createElement("div");
            status.className = "ctd-status";
            if (panel.__ctdStatus.state) {
                status.dataset.state = panel.__ctdStatus.state;
            }
            status.textContent = panel.__ctdStatus.message;
            shell.append(status);
        }

        shell.append(this.buildPropertyList(panel, targetNode, inputs, "input"));
        shell.append(this.buildPropertyList(panel, targetNode, outputs, "output"));

        panel.__ctdConnectionSignature = this.getNodeConnectionSignature(targetNode);
        panel.content.scrollTop = previousScrollTop;
    }

    private showPanel(targetNode: GraphNode): void {
        const canvas = comfyApp.canvas;
        if (!targetNode || !canvas) {
            return;
        }

        this.ensureStyles();
        this.endCandidatePreview(this.currentPanel);
        this.closePanel();
        this.setSidebarTargetNode(targetNode);

        const panel = canvas.createPanel(MENU_LABEL, { closable: true }) as PanelLike;
        panel.node = targetNode;
        panel.graph = canvas.graph;

        panel.onClose = () => {
            this.stopPanelConnectionWatcher(panel);
            this.panelAdapter.disconnect(panel);
            this.endCandidatePreview(panel);
            this.setSidebarTargetNode(null);
            if (this.currentPanel === panel) {
                this.currentPanel = null;
            }
        };

        this.renderPanel(panel, targetNode);

        if (!this.panelAdapter.mount(panel)) {
            panel.onClose?.();
            panel.remove();
            return;
        }

        this.currentPanel = panel;
        this.startPanelConnectionWatcher(panel, targetNode);
    }
}

new ConnectTheDotsExtension().register();
