import html from "html-template-tag";

import {
    collectInputCandidates,
    collectOutputCandidates,
    getCandidateConnectionCount,
    getConnectedNodeLabel,
    getConnectionPillText,
    getNodeDisplayName,
    getPropertyConnectionCount,
    getSlotDisplayName,
    getTypeDisplay,
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
    callbacks: types.PanelViewCallbacks;
}

const buildCandidateRow = (label: string, value: string, tone = ""): string => {
    const toneAttribute = tone ? html` data-tone="${tone}"` : "";
    return html`
        <span class="ctd-candidate-row">
            <span class="ctd-candidate-label">${label}</span>
            <span class="ctd-candidate-value"${toneAttribute}>${value}</span>
        </span>
    `;
};

const createCandidateButton = ({
    panel,
    targetNode,
    property,
    mode,
    candidate,
    callbacks,
}: CandidateButtonOptions): HTMLDivElement => {
    const shell = document.createElement("div");
    shell.className = "ctd-candidate-shell";

    const gutter = document.createElement("div");
    gutter.className = "ctd-candidate-gutter";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ctd-candidate";

    const connectedCount = getCandidateConnectionCount(
        targetNode,
        property,
        mode,
        candidate,
    );
    const isConnected = connectedCount > 0;
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
        callbacks.onCandidatePreviewStart(panel, candidate.node),
    );
    button.addEventListener("mouseleave", () =>
        callbacks.onCandidatePreviewEnd(panel),
    );
    button.addEventListener("click", () =>
        callbacks.onCandidateSelect({
            panel,
            targetNode,
            property,
            mode,
            candidate,
            isConnected,
        }),
    );

    shell.append(gutter, button);
    return shell;
};

const createPropertyCard = (
    panel: types.PanelLike,
    targetNode: types.GraphNode,
    property: types.PropertyDescriptor,
    mode: types.SlotDirection,
    callbacks: types.PanelViewCallbacks,
): HTMLDivElement => {
    const card = document.createElement("div");
    card.className = "ctd-slot-card";

    const typeName = getTypeDisplay(property.slot.type);
    const stateLines: string[] = [];
    const candidateList = document.createElement("div");
    candidateList.className = "ctd-candidate-list";

    const propertyConnectionCount = getPropertyConnectionCount(property, mode);
    const propertyPillText = getConnectionPillText(
        propertyConnectionCount,
        mode,
    );

    let candidates: types.CandidateDescriptor[] = [];
    if (mode === "input") {
        candidates = collectInputCandidates(
            targetNode,
            property.index,
            property.slot,
        );
    } else {
        candidates = collectOutputCandidates(
            targetNode,
            property.index,
            property.slot,
        );
        const currentTargets = (property.slot.links || [])
            .map((linkId) =>
                getConnectedNodeLabel(targetNode.graph, linkId, "output"),
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
                ${propertyPillText ? `<span class="ctd-connection-pill">${propertyPillText}</span>` : ""}
                <span class="ctd-slot-type">${typeName}</span>
            </span>
        </div>
        ${stateLines.length ? `<div class="ctd-slot-state">${stateLines.join(" ")}</div>` : ""}
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
            createPropertyCard(panel, targetNode, property, mode, callbacks),
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
        <div class="ctd-title">${getNodeDisplayName(targetNode)}</div>
        <div class="ctd-subtitle">${targetNode.type || "unknown node type"}</div>
        <div class="ctd-help">
            Hover any candidate property to jump the canvas there.
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
        buildPropertyList(panel, targetNode, inputs, "input", callbacks),
    );
    shell.append(
        buildPropertyList(panel, targetNode, outputs, "output", callbacks),
    );

    panel.content.scrollTop = previousScrollTop;
};
