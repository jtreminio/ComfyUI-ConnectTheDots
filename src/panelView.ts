import html from "html-template-tag";
import type { PanelRenderCache } from "./graphUtils";
import {
    collectInputCandidates,
    collectOutputCandidates,
    createRenderCache,
    getCachedNodeDisplayName,
    getCachedTypeDisplay,
    getConnectedNodeLabel,
    getConnectionPillText,
    getGraphLink,
    getPropertyConnectionCount,
    getSlotDisplayName,
} from "./graphUtils";
import type * as types from "./types";

interface RenderPanelOptions {
    panel: types.PanelLike;
    targetNode: types.GraphNode;
    title: string;
    callbacks: types.PanelViewCallbacks;
}

interface CandidateButtonOptions {
    panel: types.PanelLike;
    targetNode: types.GraphNode;
    property: types.PropertyDescriptor;
    mode: types.SlotDirection;
    candidate: types.CandidateDescriptor;
    isConnected: boolean;
    callbacks: types.PanelViewCallbacks;
}

const getCandidateKey = (
    nodeId: number | string,
    slotIndex: number,
): string => {
    return `${nodeId}:${slotIndex}`;
};

const buildConnectedCandidateKeys = (
    graph: types.GraphLike | null | undefined,
    property: types.PropertyDescriptor,
    mode: types.SlotDirection,
): Set<string> => {
    const keys = new Set<string>();
    if (!graph) {
        return keys;
    }

    if (mode === "input") {
        const link = getGraphLink(graph, property.slot.link ?? null);
        if (link) {
            keys.add(getCandidateKey(link.origin_id, link.origin_slot));
        }
        return keys;
    }

    for (const linkId of property.slot.links || []) {
        const link = getGraphLink(graph, linkId);
        if (link) {
            keys.add(getCandidateKey(link.target_id, link.target_slot));
        }
    }

    return keys;
};

const buildCandidateRow = (label: string, value: string, tone = ""): string => {
    return html`
        <span class="ctd-candidate-row">
            <span class="ctd-candidate-label">${label}</span>
            <span class="ctd-candidate-value"${tone ? ` data-tone="${tone}"` : ""}>${value}</span>
        </span>
    `;
};

const createCandidateButton = ({
    panel,
    targetNode,
    property,
    mode,
    candidate,
    isConnected,
    callbacks,
}: CandidateButtonOptions): HTMLDivElement => {
    const shell = document.createElement("div");
    shell.className = "ctd-candidate-shell";
    const selection: types.CandidateSelection = {
        panel,
        targetNode,
        property,
        mode,
        candidate,
        isConnected,
    };

    const gutter = document.createElement("div");
    gutter.className = "ctd-candidate-gutter";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ctd-candidate";
    const nodeLabel = mode === "input" ? "Node" : "Target Node";
    const propertyLabel = mode === "input" ? "Property" : "Target Property";

    button.innerHTML = `
        ${buildCandidateRow(nodeLabel, candidate.nodeName)}
        ${buildCandidateRow(propertyLabel, candidate.slotName, "accent")}
        ${mode === "input" ? "" : buildCandidateRow("Type", candidate.typeName)}
    `;

    if (isConnected) {
        const marker = document.createElement("span");
        marker.className = "ctd-connection-marker";
        marker.setAttribute("aria-hidden", "true");
        gutter.append(marker);
    }

    button.addEventListener("mouseenter", () =>
        callbacks.onCandidatePreviewStart(selection),
    );
    button.addEventListener("mouseleave", () =>
        callbacks.onCandidatePreviewEnd(panel),
    );
    button.addEventListener("click", () =>
        callbacks.onCandidateSelect(selection),
    );

    shell.append(gutter, button);
    return shell;
};

const createPropertyCard = (
    panel: types.PanelLike,
    targetNode: types.GraphNode,
    property: types.PropertyDescriptor,
    mode: types.SlotDirection,
    renderCache: PanelRenderCache,
    callbacks: types.PanelViewCallbacks,
): HTMLDivElement => {
    const card = document.createElement("div");
    card.className = "ctd-slot-card";

    const stateLines: string[] = [];
    const candidateList = document.createElement("div");
    candidateList.className = "ctd-candidate-list";
    const connectedCandidateKeys = buildConnectedCandidateKeys(
        targetNode.graph,
        property,
        mode,
    );

    const propertyConnectionCount = getPropertyConnectionCount(property, mode);
    const propertyPillText = getConnectionPillText(
        propertyConnectionCount,
        mode,
    );

    let candidates: types.CandidateDescriptor[] = [];
    if (mode === "input") {
        candidates = collectInputCandidates(
            renderCache,
            targetNode,
            property.slot,
        );
    } else {
        candidates = collectOutputCandidates(
            renderCache,
            targetNode,
            property.slot,
        );
        const currentTargets = (property.slot.links || [])
            .map((linkId) =>
                getConnectedNodeLabel(
                    targetNode.graph,
                    linkId,
                    "output",
                    renderCache,
                ),
            )
            .filter((label): label is string => Boolean(label));

        const targetsLength = `${currentTargets.length} target${currentTargets.length === 1 ? "" : "s"}`;
        stateLines.push(
            currentTargets.length
                ? `Currently connected to ${targetsLength}: ${currentTargets.join(", ")}`
                : "Currently unconnected",
        );
    }

    card.innerHTML = html`
        <div class="ctd-slot-head">
            <span class="ctd-slot-name">${property.name}</span>
            <span class="ctd-slot-meta">
                $${propertyPillText ? html`<span class="ctd-connection-pill">${propertyPillText}</span>` : ""}
                <span class="ctd-slot-type">${getCachedTypeDisplay(renderCache, property.slot.type)}</span>
            </span>
        </div>
        $${stateLines.length ? html`<div class="ctd-slot-state">${stateLines.join(" ")}</div>` : ""}
    `;

    if (candidates.length) {
        if (mode !== "input") {
            const label = document.createElement("div");
            label.className = "ctd-subtitle";
            label.textContent = "Compatible targets";
            candidateList.append(label);
        }

        for (const candidate of candidates) {
            candidateList.append(
                createCandidateButton({
                    panel,
                    targetNode,
                    property,
                    mode,
                    candidate,
                    isConnected: connectedCandidateKeys.has(
                        getCandidateKey(candidate.node.id, candidate.slotIndex),
                    ),
                    callbacks,
                }),
            );
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
};

const buildPropertyList = (
    panel: types.PanelLike,
    targetNode: types.GraphNode,
    slots: types.PropertyDescriptor[],
    mode: types.SlotDirection,
    renderCache: PanelRenderCache,
    callbacks: types.PanelViewCallbacks,
): HTMLDivElement => {
    const section = document.createElement("div");
    section.className = "ctd-section";

    const title = document.createElement("div");
    title.className = "ctd-section-title";
    title.textContent = mode === "input" ? "Inputs" : "Outputs";
    section.append(title);

    const help = document.createElement("div");
    help.className = "ctd-section-help";
    help.textContent =
        mode === "input"
            ? "Choose a source property for each input."
            : "Choose where each output should connect.";
    section.append(help);

    if (!slots.length) {
        const empty = document.createElement("div");
        empty.className = "ctd-empty";
        empty.textContent =
            mode === "input"
                ? "This node has no inputs."
                : "This node has no outputs.";
        section.append(empty);
        return section;
    }

    for (const property of slots) {
        section.append(
            createPropertyCard(
                panel,
                targetNode,
                property,
                mode,
                renderCache,
                callbacks,
            ),
        );
    }

    return section;
};

export const renderPanelView = ({
    panel,
    targetNode,
    title,
    callbacks,
}: RenderPanelOptions): void => {
    const previousScrollTop = panel.content?.scrollTop ?? 0;
    const renderCache = createRenderCache(targetNode);
    const inputs = (targetNode.inputs || []).map((slot, index) => ({
        index,
        slot,
        name: getSlotDisplayName(slot, `input ${index}`),
    }));
    const outputs = (targetNode.outputs || []).map((slot, index) => ({
        index,
        slot,
        name: getSlotDisplayName(slot, `output ${index}`),
    }));

    panel.title_element.textContent = title;
    panel.content.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "ctd-shell";
    panel.content.append(shell);

    const hero = document.createElement("div");
    hero.className = "ctd-hero";
    hero.innerHTML = html`
        <div class="ctd-title">${getCachedNodeDisplayName(renderCache, targetNode)}</div>
        <div class="ctd-subtitle">${targetNode.type || "unknown node type"}</div>
        <div class="ctd-help">
            Hover any candidate property to preview the connection on the canvas.
            Moving away or selecting it restores your original view. Keep connecting until you close the sidebar.
        </div>
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

    shell.append(
        buildPropertyList(
            panel,
            targetNode,
            inputs,
            "input",
            renderCache,
            callbacks,
        ),
    );
    shell.append(
        buildPropertyList(
            panel,
            targetNode,
            outputs,
            "output",
            renderCache,
            callbacks,
        ),
    );

    panel.content.scrollTop = previousScrollTop;
};
