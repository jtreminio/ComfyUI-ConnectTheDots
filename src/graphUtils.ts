import type * as types from "./types";

declare const LiteGraph: {
    EVENT?: unknown;
    ACTION?: unknown;
};

const compareCandidates = (
    a: types.CandidateDescriptor,
    b: types.CandidateDescriptor,
): number => {
    return (
        a.nodeName.localeCompare(b.nodeName, undefined, {
            numeric: true,
            sensitivity: "base",
        }) ||
        a.slotName.localeCompare(b.slotName, undefined, {
            numeric: true,
            sensitivity: "base",
        })
    );
};

export const getSlotDisplayName = (
    slot: types.GraphSlot | undefined,
    fallback = "slot",
): string => {
    return slot?.label || slot?.localized_name || slot?.name || fallback;
};

export const getNodeDisplayName = (
    node: types.GraphNode | null | undefined,
): string => {
    return (
        node?.getTitle?.() ||
        node?.title ||
        node?.type ||
        `Node ${node?.id ?? "?"}`
    );
};

export const getTypeDisplay = (type: types.SlotTypeValue): string => {
    if (Array.isArray(type)) {
        return type.map((value) => getTypeDisplay(value)).join(", ");
    }
    if (
        type == null ||
        type === "" ||
        type === 0 ||
        type === "0" ||
        type === "*"
    ) {
        return "*";
    }
    if (type === LiteGraph.EVENT) {
        return "EVENT";
    }
    if (type === LiteGraph.ACTION) {
        return "ACTION";
    }
    return String(type);
};

export const getGraphNodes = (node: types.GraphNode): types.GraphNode[] => {
    return node.graph?.nodes || node.graph?._nodes || [];
};

export const getGraphLink = (
    graph: types.GraphLike | null | undefined,
    linkId: number | null | undefined,
): types.GraphLink | null => {
    if (!graph || linkId == null) {
        return null;
    }

    const internalLinks = graph._links;
    if (
        internalLinks &&
        typeof (internalLinks as Map<number, types.GraphLink>).get ===
            "function"
    ) {
        return (
            (internalLinks as Map<number, types.GraphLink>).get(linkId) ?? null
        );
    }

    return (
        (
            internalLinks as
                | Record<number | string, types.GraphLink>
                | undefined
        )?.[linkId] ??
        graph.links?.[linkId] ??
        null
    );
};

export const getConnectedNodeLabel = (
    graph: types.GraphLike | null | undefined,
    linkId: number | null | undefined,
    side: types.SlotDirection,
): string | null => {
    const link = getGraphLink(graph, linkId);
    if (!link) {
        return null;
    }

    if (side === "input") {
        const originNode = graph?.getNodeById?.(link.origin_id);
        const originSlot = originNode?.outputs?.[link.origin_slot];
        return `${getNodeDisplayName(originNode)} -> ${getSlotDisplayName(originSlot, `output ${link.origin_slot}`)}`;
    }

    const targetNode = graph?.getNodeById?.(link.target_id);
    const targetSlot = targetNode?.inputs?.[link.target_slot];
    return `${getNodeDisplayName(targetNode)} -> ${getSlotDisplayName(targetSlot, `input ${link.target_slot}`)}`;
};

export const getCandidateConnectionCount = (
    targetNode: types.GraphNode,
    property: types.PropertyDescriptor,
    mode: types.SlotDirection,
    candidate: types.CandidateDescriptor,
): number => {
    if (!targetNode.graph) {
        return 0;
    }

    if (mode === "input") {
        const link = getGraphLink(targetNode.graph, property.slot.link ?? null);
        return link &&
            link.origin_id === candidate.node.id &&
            link.origin_slot === candidate.slotIndex
            ? 1
            : 0;
    }

    return (property.slot.links || []).reduce((count, linkId) => {
        const link = getGraphLink(targetNode.graph, linkId);
        return link &&
            link.target_id === candidate.node.id &&
            link.target_slot === candidate.slotIndex
            ? count + 1
            : count;
    }, 0);
};

export const getPropertyConnectionCount = (
    property: types.PropertyDescriptor,
    mode: types.SlotDirection,
): number => {
    return mode === "input"
        ? property.slot.link != null
            ? 1
            : 0
        : property.slot.links?.length || 0;
};

export const getConnectionPillText = (
    count: number,
    mode: types.SlotDirection,
): string => {
    if (!count) {
        return "";
    }

    if (mode === "input") {
        return "Connected";
    }

    return count === 1 ? "1 Linked" : `${count} Linked`;
};

export const collectInputCandidates = (
    targetNode: types.GraphNode,
    inputIndex: number,
    input: types.GraphSlot,
): types.CandidateDescriptor[] => {
    return getGraphNodes(targetNode)
        .filter((sourceNode) => sourceNode && sourceNode !== targetNode)
        .flatMap((sourceNode) =>
            (sourceNode.outputs || []).map((output, slotIndex) => ({
                node: sourceNode,
                nodeName: getNodeDisplayName(sourceNode),
                slotIndex,
                slotName: getSlotDisplayName(output, `output ${slotIndex}`),
                typeName: getTypeDisplay(output?.type),
                connect: () =>
                    sourceNode.connect(slotIndex, targetNode, inputIndex),
            })),
        )
        .filter((candidate) =>
            candidate.node.canConnectTo(
                targetNode,
                input,
                candidate.node.outputs?.[candidate.slotIndex] ?? {},
            ),
        )
        .sort(compareCandidates);
};

export const collectOutputCandidates = (
    sourceNode: types.GraphNode,
    outputIndex: number,
    output: types.GraphSlot,
): types.CandidateDescriptor[] => {
    return getGraphNodes(sourceNode)
        .filter((targetNode) => targetNode && targetNode !== sourceNode)
        .flatMap((targetNode) =>
            (targetNode.inputs || []).map((input, slotIndex) => ({
                node: targetNode,
                nodeName: getNodeDisplayName(targetNode),
                slotIndex,
                slotName: getSlotDisplayName(input, `input ${slotIndex}`),
                typeName: getTypeDisplay(input?.type),
                connect: () =>
                    sourceNode.connect(outputIndex, targetNode, slotIndex),
            })),
        )
        .filter((candidate) =>
            sourceNode.canConnectTo(
                candidate.node,
                candidate.node.inputs?.[candidate.slotIndex] ?? {},
                output,
            ),
        )
        .sort(compareCandidates);
};

export const getNodeConnectionSignature = (
    targetNode: types.GraphNode,
): string => {
    if (!targetNode.graph) {
        return "";
    }

    const inputSignature = (targetNode.inputs || []).map((slot, index) => {
        const link = getGraphLink(targetNode.graph, slot.link ?? null);
        return link
            ? `in:${index}:${link.origin_id}:${link.origin_slot}`
            : `in:${index}:-`;
    });

    const outputSignature = (targetNode.outputs || []).map((slot, index) => {
        const targets = (slot.links || [])
            .map((linkId) => getGraphLink(targetNode.graph, linkId))
            .filter((link): link is types.GraphLink => Boolean(link))
            .map((link) => `${link.target_id}:${link.target_slot}`)
            .sort();
        return `out:${index}:${targets.join(",")}`;
    });

    return [...inputSignature, ...outputSignature].join("|");
};
