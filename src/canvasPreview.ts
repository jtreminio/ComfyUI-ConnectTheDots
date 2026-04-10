import type * as types from "./types";

const getGraphNodes = (
    graph: types.GraphLike | null | undefined,
): types.GraphNode[] => {
    return graph?.nodes || graph?._nodes || [];
};

const getNodeBounds = (
    node: types.GraphNode,
): { x: number; y: number; width: number; height: number } => {
    const bounds = node.boundingRect || [
        node.pos?.[0] || 0,
        node.pos?.[1] || 0,
        node.size?.[0] || 0,
        node.size?.[1] || 0,
    ];

    return {
        x: bounds[0],
        y: bounds[1],
        width: Math.max(bounds[2], 1),
        height: Math.max(bounds[3], 1),
    };
};

const getSlotPosition = (
    node: types.GraphNode,
    isInput: boolean,
    slotIndex: number,
): [number, number] => {
    const connectionPos = node.getConnectionPos?.(isInput, slotIndex, [0, 0]);
    if (
        connectionPos &&
        Number.isFinite(connectionPos[0]) &&
        Number.isFinite(connectionPos[1])
    ) {
        return [connectionPos[0], connectionPos[1]];
    }

    const bounds = getNodeBounds(node);
    return isInput
        ? [bounds.x, bounds.y + bounds.height * 0.5]
        : [bounds.x + bounds.width, bounds.y + bounds.height * 0.5];
};

const buildPreviewLink = (
    selection: types.CandidateSelection,
): types.PreviewLinkDescriptor | null => {
    if (selection.isConnected) {
        return null;
    }

    const { targetNode, property, mode, candidate } = selection;
    return mode === "input"
        ? {
              originNode: candidate.node,
              originSlot: candidate.slotIndex,
              targetNode,
              targetSlot: property.index,
          }
        : {
              originNode: targetNode,
              originSlot: property.index,
              targetNode: candidate.node,
              targetSlot: candidate.slotIndex,
          };
};

const getPanelOcclusion = (
    canvas: types.CanvasLike,
    panel: types.PanelLike | null | undefined,
): { left: number; right: number } => {
    const canvasElement = canvas.canvas;
    if (!canvasElement || !panel || !document.body.contains(panel)) {
        return { left: 0, right: 0 };
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const overlapLeft = Math.max(canvasRect.left, panelRect.left);
    const overlapRight = Math.min(canvasRect.right, panelRect.right);
    const overlapTop = Math.max(canvasRect.top, panelRect.top);
    const overlapBottom = Math.min(canvasRect.bottom, panelRect.bottom);

    if (overlapLeft >= overlapRight || overlapTop >= overlapBottom) {
        return { left: 0, right: 0 };
    }

    const leftGap = overlapLeft - canvasRect.left;
    const rightGap = canvasRect.right - overlapRight;
    if (rightGap <= leftGap) {
        return {
            left: 0,
            right: Math.max(canvasRect.right - overlapLeft, 0),
        };
    }

    return {
        left: Math.max(overlapRight - canvasRect.left, 0),
        right: 0,
    };
};

export const canvasPreviewController = (
    getCanvas: () => types.CanvasLike | undefined,
    getRootGraph: () => types.GraphLike | null | undefined,
) => {
    const PREVIEW_HORIZONTAL_RATIO = 0.5;
    const PREVIEW_VERTICAL_RATIO = 0.25;
    const PREVIEW_FRAME_PADDING = 96;
    const MIN_PREVIEW_SCALE = 0.08;
    const PREVIEW_DASH_SPEED = 0.35;
    const PREVIEW_DASH_LENGTH = 0.07;
    const PREVIEW_DASH_GAP = 0.055;
    const PREVIEW_DASH_SAMPLES = 8;
    const CONNECTION_FLASH_DURATION_MS = 250;

    let previewNode: types.GraphNode | null = null;
    let previewLink: types.PreviewLinkDescriptor | null = null;
    let sidebarTargetNode: types.GraphNode | null = null;
    let previewFocusTimeout: number | null = null;
    let previewAnimationFrame: number | null = null;
    let previewConfirmationExpiresAt = 0;

    const setupForegroundDrawing = (): void => {
        const canvas = getCanvas();
        if (!canvas || canvas.__ctdDrawWrapped) {
            return;
        }

        const originalOnDrawForeground = canvas.onDrawForeground;
        canvas.onDrawForeground = (ctx, visibleArea) => {
            originalOnDrawForeground?.call(canvas, ctx, visibleArea);
            drawHighlights(ctx, canvas);
        };
        canvas.__ctdDrawWrapped = true;
    };

    const clearPendingPreviewFocus = (): void => {
        if (previewFocusTimeout == null) {
            return;
        }

        window.clearTimeout(previewFocusTimeout);
        previewFocusTimeout = null;
    };

    const clearPreviewConfirmation = (): void => {
        if (previewConfirmationExpiresAt === 0) {
            return;
        }

        previewConfirmationExpiresAt = 0;
        getCanvas()?.setDirty(true, true);
    };

    const stopPreviewAnimation = (): void => {
        if (previewAnimationFrame == null) {
            return;
        }

        window.cancelAnimationFrame(previewAnimationFrame);
        previewAnimationFrame = null;
    };

    const startPreviewAnimation = (): void => {
        if (previewAnimationFrame != null) {
            return;
        }

        const tick = (): void => {
            if (!previewLink) {
                previewAnimationFrame = null;
                return;
            }

            getCanvas()?.setDirty(true, true);
            previewAnimationFrame = window.requestAnimationFrame(tick);
        };

        previewAnimationFrame = window.requestAnimationFrame(tick);
    };

    const clampScale = (scale: number): number => {
        if (!Number.isFinite(scale) || scale <= 0) {
            return 1;
        }

        return Math.max(scale, MIN_PREVIEW_SCALE);
    };

    const captureCanvasView = (): types.CanvasView => {
        const canvas = getCanvas();
        const offset = canvas?.ds?.offset || [0, 0];
        return {
            graph: canvas?.graph,
            offset: [offset[0], offset[1]],
            scale: canvas?.ds?.scale ?? 1,
        };
    };

    const findGraphPath = (
        targetGraph: types.GraphLike | null | undefined,
        currentGraph = getRootGraph(),
        path: types.GraphLike[] = currentGraph ? [currentGraph] : [],
    ): types.GraphLike[] | null => {
        if (!targetGraph || !currentGraph) {
            return null;
        }

        if (currentGraph === targetGraph) {
            return path;
        }

        for (const node of getGraphNodes(currentGraph)) {
            const subgraph = node.subgraph;
            if (!subgraph) {
                continue;
            }

            const nextPath = findGraphPath(targetGraph, subgraph, [
                ...path,
                subgraph,
            ]);
            if (nextPath) {
                return nextPath;
            }
        }

        return null;
    };

    const setCanvasGraph = (
        graph: types.GraphLike | null | undefined,
    ): boolean => {
        const canvas = getCanvas();
        if (!canvas || !graph) {
            return false;
        }

        if (canvas.graph === graph) {
            return true;
        }

        const rootGraph = getRootGraph();
        if (!rootGraph) {
            canvas.setGraph?.(graph);
            return canvas.graph === graph;
        }

        const path = findGraphPath(graph, rootGraph);
        if (!path) {
            canvas.setGraph?.(graph);
            return canvas.graph === graph;
        }

        canvas.setGraph?.(rootGraph);
        for (let index = 1; index < path.length; index += 1) {
            canvas.openSubgraph?.(path[index]);
        }

        return canvas.graph === graph || Boolean(canvas.openSubgraph);
    };

    const restoreCanvasView = (
        view: types.CanvasView | null | undefined,
    ): void => {
        const canvas = getCanvas();
        if (!view || !canvas?.ds) {
            return;
        }

        clearPendingPreviewFocus();
        if (
            view.graph &&
            canvas.graph !== view.graph &&
            !setCanvasGraph(view.graph)
        ) {
            return;
        }

        canvas.ds.offset[0] = view.offset[0];
        canvas.ds.offset[1] = view.offset[1];
        canvas.ds.scale = view.scale;
        canvas.setDirty(true, true);
    };

    const centerOnNodeAtScale = (
        node: types.GraphNode,
        scale: number,
        panel?: types.PanelLike | null,
    ): void => {
        const canvas = getCanvas();
        if (!canvas) {
            return;
        }

        if (canvas.ds) {
            canvas.ds.scale = clampScale(scale);
        }

        if (canvas.centerOnNode && !panel) {
            canvas.centerOnNode(node);
            return;
        }

        focusNodeAtScale(node, scale, panel);
    };

    const focusBoundsAtScale = (
        bounds: { x: number; y: number; width: number; height: number },
        scale: number,
        panel?: types.PanelLike | null,
    ): boolean => {
        const canvas = getCanvas();
        if (!canvas?.ds || !canvas.canvas) {
            return false;
        }

        const devicePixelRatio = window.devicePixelRatio || 1;
        const canvasWidth = canvas.canvas.width;
        const canvasHeight = canvas.canvas.height;
        if (!canvasWidth || !canvasHeight) {
            return false;
        }

        const nextScale = clampScale(scale);
        const viewWidth = canvasWidth / (nextScale * devicePixelRatio);
        const viewHeight = canvasHeight / (nextScale * devicePixelRatio);
        const panelOcclusion = getPanelOcclusion(canvas, panel);
        const occludedLeft = panelOcclusion.left / nextScale;
        const occludedRight = panelOcclusion.right / nextScale;
        const usableWidth = viewWidth - occludedLeft - occludedRight;
        if (usableWidth <= 0) {
            return false;
        }

        canvas.ds.scale = nextScale;
        canvas.ds.offset[0] =
            -bounds.x - bounds.width * 0.5 + occludedLeft + usableWidth * 0.5;
        canvas.ds.offset[1] =
            -bounds.y - bounds.height * 0.5 + viewHeight * 0.5;
        return true;
    };

    const focusPreviewNodes = (
        targetNode: types.GraphNode,
        candidateNode: types.GraphNode,
        baseScale: number,
        panel?: types.PanelLike | null,
    ): boolean => {
        const canvas = getCanvas();
        if (
            !canvas?.ds ||
            !canvas.canvas ||
            targetNode.graph !== canvas.graph ||
            candidateNode.graph !== canvas.graph
        ) {
            return false;
        }

        const targetBounds = getNodeBounds(targetNode);
        const candidateBounds = getNodeBounds(candidateNode);
        const minX = Math.min(targetBounds.x, candidateBounds.x);
        const minY = Math.min(targetBounds.y, candidateBounds.y);
        const maxX = Math.max(
            targetBounds.x + targetBounds.width,
            candidateBounds.x + candidateBounds.width,
        );
        const maxY = Math.max(
            targetBounds.y + targetBounds.height,
            candidateBounds.y + candidateBounds.height,
        );

        const framedBounds = {
            x: minX - PREVIEW_FRAME_PADDING,
            y: minY - PREVIEW_FRAME_PADDING,
            width: maxX - minX + PREVIEW_FRAME_PADDING * 2,
            height: maxY - minY + PREVIEW_FRAME_PADDING * 2,
        };

        const devicePixelRatio = window.devicePixelRatio || 1;
        const canvasWidthCss = canvas.canvas.width / devicePixelRatio;
        const canvasHeightCss = canvas.canvas.height / devicePixelRatio;
        const panelOcclusion = getPanelOcclusion(canvas, panel);
        const usableWidthCss =
            canvasWidthCss - panelOcclusion.left - panelOcclusion.right;
        if (usableWidthCss <= 0 || canvasHeightCss <= 0) {
            return false;
        }

        const maxScaleToFit = Math.min(
            usableWidthCss / framedBounds.width,
            canvasHeightCss / framedBounds.height,
        );

        const nextScale =
            Number.isFinite(maxScaleToFit) && maxScaleToFit > 0
                ? Math.min(baseScale, maxScaleToFit)
                : baseScale;

        return focusBoundsAtScale(framedBounds, nextScale, panel);
    };

    const focusSelectionPreview = (
        selection: types.CandidateSelection,
        scale: number,
    ): void => {
        if (
            focusPreviewNodes(
                selection.targetNode,
                selection.candidate.node,
                scale,
                selection.panel,
            )
        ) {
            return;
        }

        centerOnNodeAtScale(selection.candidate.node, scale, selection.panel);
    };

    const queueCandidateFocus = (
        selection: types.CandidateSelection,
        scale: number,
        expectedPreviewLink: types.PreviewLinkDescriptor | null,
    ): void => {
        clearPendingPreviewFocus();
        previewFocusTimeout = window.setTimeout(() => {
            previewFocusTimeout = null;

            const canvas = getCanvas();
            if (
                !canvas ||
                previewNode !== selection.candidate.node ||
                previewLink !== expectedPreviewLink
            ) {
                return;
            }

            if (canvas.graph !== selection.candidate.node.graph) {
                setCanvasGraph(selection.candidate.node.graph);
            }

            if (canvas.graph !== selection.candidate.node.graph) {
                return;
            }

            focusSelectionPreview(selection, scale);
            canvas.setDirty(true, true);
        }, 0);
    };

    const beginCandidatePreview = (
        selection: types.CandidateSelection,
    ): void => {
        const { panel } = selection;
        const candidateNode = selection.candidate.node;
        const canvas = getCanvas();
        if (!panel || !candidateNode || !canvas) {
            return;
        }

        if (!panel.__ctdBaseView) {
            panel.__ctdBaseView = captureCanvasView();
        }

        const nextPreviewLink = buildPreviewLink(selection);
        const hasGraphChanged = canvas.graph !== candidateNode.graph;
        if (hasGraphChanged && !setCanvasGraph(candidateNode.graph)) {
            return;
        }

        setPreviewLink(nextPreviewLink);
        setPreviewNode(candidateNode);

        const previewScale =
            panel.__ctdBaseView?.scale ?? canvas.ds?.scale ?? 1;
        if (hasGraphChanged) {
            queueCandidateFocus(selection, previewScale, nextPreviewLink);
            return;
        }

        clearPendingPreviewFocus();
        focusSelectionPreview(selection, previewScale);
        canvas.setDirty(true, true);
    };

    const confirmCandidateSelection = (
        selection: types.CandidateSelection,
    ): void => {
        beginCandidatePreview(selection);
        previewConfirmationExpiresAt =
            performance.now() + CONNECTION_FLASH_DURATION_MS;
        getCanvas()?.setDirty(true, true);
    };

    const endCandidatePreview = (panel: types.PanelLike | null): void => {
        clearPendingPreviewFocus();
        clearPreviewConfirmation();
        setPreviewLink(null);
        setPreviewNode(null);

        if (!panel) {
            return;
        }

        if (panel.__ctdBaseView) {
            restoreCanvasView(panel.__ctdBaseView);
            panel.__ctdBaseView = null;
        }
    };

    const setSidebarTargetNode = (node: types.GraphNode | null): void => {
        if (sidebarTargetNode === node) {
            return;
        }

        sidebarTargetNode = node;
        getCanvas()?.setDirty(true, true);
    };

    const setPreviewLink = (link: types.PreviewLinkDescriptor | null): void => {
        if (previewLink === link) {
            return;
        }

        previewLink = link;
        if (previewLink) {
            startPreviewAnimation();
        } else {
            stopPreviewAnimation();
        }
        getCanvas()?.setDirty(true, true);
    };

    const setPreviewNode = (node: types.GraphNode | null): void => {
        if (previewNode === node) {
            return;
        }

        previewNode = node;
        getCanvas()?.setDirty(true, true);
    };

    const drawHighlights = (
        ctx: CanvasRenderingContext2D,
        canvas: types.CanvasLike,
    ): void => {
        drawPreviewLink(ctx, canvas, previewLink);

        drawNodeHighlight(ctx, canvas, sidebarTargetNode, {
            strokeStyle: "#d9b84f",
            fillStyle: "rgba(217, 184, 79, 0.05)",
            shadowColor: "rgba(217, 184, 79, 0.24)",
            lineWidth: 3,
            radius: 10,
            shadowBlur: 12,
        });

        drawNodeHighlight(ctx, canvas, previewNode, {
            strokeStyle: "#7bc96f",
            fillStyle: "rgba(123, 201, 111, 0.08)",
            shadowColor: "rgba(123, 201, 111, 0.45)",
            lineWidth: 3,
            radius: 10,
            shadowBlur: 18,
        });
    };

    const drawPreviewLink = (
        ctx: CanvasRenderingContext2D,
        canvas: types.CanvasLike,
        link: types.PreviewLinkDescriptor | null,
    ): void => {
        if (
            !link ||
            !canvas.ds ||
            link.originNode.graph !== canvas.graph ||
            link.targetNode.graph !== canvas.graph
        ) {
            return;
        }

        const origin = getSlotPosition(link.originNode, false, link.originSlot);
        const target = getSlotPosition(link.targetNode, true, link.targetSlot);
        const scale = clampScale(canvas.ds.scale ?? 1);
        const controlOffset = Math.max(
            Math.min(Math.abs(target[0] - origin[0]) * 0.45, 220 / scale),
            56 / scale,
        );
        const haloWidth = 8 / scale;
        const lineWidth = 3 / scale;
        const endpointRadius = 5.5 / scale;
        const animationTime = performance.now() / 1000;
        const isConfirmationActive =
            previewConfirmationExpiresAt > performance.now();

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        tracePreviewLinkPath(ctx, origin, target, controlOffset);

        if (isConfirmationActive) {
            ctx.strokeStyle = "rgba(123, 201, 111, 0.28)";
            ctx.lineWidth = 14 / scale;
            ctx.shadowColor = "rgba(123, 201, 111, 0.95)";
            ctx.shadowBlur = 26 / scale;
            ctx.stroke();

            tracePreviewLinkPath(ctx, origin, target, controlOffset);
            ctx.strokeStyle = "rgba(215, 255, 206, 0.96)";
            ctx.lineWidth = 4 / scale;
            ctx.shadowBlur = 0;
            ctx.stroke();

            drawPreviewEndpoint(
                ctx,
                origin,
                6.5 / scale,
                "rgba(123, 201, 111, 1)",
            );
            drawPreviewEndpoint(
                ctx,
                target,
                6.5 / scale,
                "rgba(217, 184, 79, 1)",
            );
            ctx.restore();
            return;
        }

        ctx.strokeStyle = "rgba(123, 201, 111, 0.2)";
        ctx.lineWidth = haloWidth;
        ctx.stroke();

        drawAnimatedPreviewDashes(
            ctx,
            origin,
            target,
            controlOffset,
            animationTime,
            lineWidth,
        );

        drawPreviewEndpoint(
            ctx,
            origin,
            endpointRadius,
            "rgba(123, 201, 111, 0.96)",
        );
        drawPreviewEndpoint(
            ctx,
            target,
            endpointRadius,
            "rgba(217, 184, 79, 0.96)",
        );
        ctx.restore();
    };

    const tracePreviewLinkPath = (
        ctx: CanvasRenderingContext2D,
        origin: [number, number],
        target: [number, number],
        controlOffset: number,
    ): void => {
        ctx.beginPath();
        ctx.moveTo(origin[0], origin[1]);
        ctx.bezierCurveTo(
            origin[0] + controlOffset,
            origin[1],
            target[0] - controlOffset,
            target[1],
            target[0],
            target[1],
        );
    };

    const drawPreviewEndpoint = (
        ctx: CanvasRenderingContext2D,
        point: [number, number],
        radius: number,
        fillStyle: string,
    ): void => {
        ctx.beginPath();
        ctx.fillStyle = fillStyle;
        ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
        ctx.fill();
    };

    const drawAnimatedPreviewDashes = (
        ctx: CanvasRenderingContext2D,
        origin: [number, number],
        target: [number, number],
        controlOffset: number,
        animationTime: number,
        lineWidth: number,
    ): void => {
        const dashLength = PREVIEW_DASH_LENGTH;
        const dashStep = dashLength + PREVIEW_DASH_GAP;
        const dashOffset =
            (((animationTime * PREVIEW_DASH_SPEED) % dashStep) + dashStep) %
            dashStep;

        ctx.strokeStyle = "rgba(123, 201, 111, 0.96)";
        ctx.lineWidth = lineWidth;

        for (
            let dashStart = dashOffset - dashStep;
            dashStart < 1 + dashLength;
            dashStart += dashStep
        ) {
            drawPreviewDashSegment(
                ctx,
                origin,
                target,
                controlOffset,
                Math.max(dashStart, 0),
                Math.min(dashStart + dashLength, 1),
            );
        }
    };

    const drawPreviewDashSegment = (
        ctx: CanvasRenderingContext2D,
        origin: [number, number],
        target: [number, number],
        controlOffset: number,
        startT: number,
        endT: number,
    ): void => {
        if (endT <= startT) {
            return;
        }

        const sampleCount = Math.max(
            2,
            Math.ceil((endT - startT) * PREVIEW_DASH_SAMPLES * 12),
        );

        ctx.beginPath();
        for (let index = 0; index <= sampleCount; index += 1) {
            const t = startT + ((endT - startT) * index) / sampleCount;
            const point = getPreviewBezierPoint(
                origin,
                target,
                controlOffset,
                t,
            );
            if (index === 0) {
                ctx.moveTo(point[0], point[1]);
            } else {
                ctx.lineTo(point[0], point[1]);
            }
        }
        ctx.stroke();
    };

    const getPreviewBezierPoint = (
        origin: [number, number],
        target: [number, number],
        controlOffset: number,
        t: number,
    ): [number, number] => {
        const inverseT = 1 - t;
        const startControl: [number, number] = [
            origin[0] + controlOffset,
            origin[1],
        ];
        const endControl: [number, number] = [
            target[0] - controlOffset,
            target[1],
        ];

        return [
            inverseT ** 3 * origin[0] +
                3 * inverseT ** 2 * t * startControl[0] +
                3 * inverseT * t ** 2 * endControl[0] +
                t ** 3 * target[0],
            inverseT ** 3 * origin[1] +
                3 * inverseT ** 2 * t * startControl[1] +
                3 * inverseT * t ** 2 * endControl[1] +
                t ** 3 * target[1],
        ];
    };

    const drawNodeHighlight = (
        ctx: CanvasRenderingContext2D,
        canvas: types.CanvasLike,
        node: types.GraphNode | null,
        options: types.HighlightOptions,
    ): void => {
        if (!node || node.graph !== canvas.graph || !canvas.ds) {
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
    };

    const focusNodeAtScale = (
        node: types.GraphNode,
        scale: number,
        panel?: types.PanelLike | null,
    ): boolean => {
        const canvas = getCanvas();
        if (!canvas?.ds || !canvas.canvas) {
            return false;
        }

        const bounds = node.boundingRect || [
            node.pos?.[0] || 0,
            node.pos?.[1] || 0,
            node.size?.[0] || 0,
            node.size?.[1] || 0,
        ];
        const devicePixelRatio = window.devicePixelRatio || 1;
        const canvasWidth = canvas.canvas.width;
        const canvasHeight = canvas.canvas.height;
        if (!canvasWidth || !canvasHeight) {
            return false;
        }

        const nextScale = clampScale(scale);
        const viewWidth = canvasWidth / (nextScale * devicePixelRatio);
        const viewHeight = canvasHeight / (nextScale * devicePixelRatio);
        const panelOcclusion = getPanelOcclusion(canvas, panel);
        const occludedLeft = panelOcclusion.left / nextScale;
        const occludedRight = panelOcclusion.right / nextScale;
        const usableWidth = viewWidth - occludedLeft - occludedRight;
        if (usableWidth <= 0) {
            return false;
        }

        const targetCenterX =
            occludedLeft + usableWidth * PREVIEW_HORIZONTAL_RATIO;
        const targetTopY = viewHeight * PREVIEW_VERTICAL_RATIO;

        canvas.ds.scale = nextScale;
        canvas.ds.offset[0] = -bounds[0] - bounds[2] * 0.5 + targetCenterX;
        canvas.ds.offset[1] = -bounds[1] + targetTopY;
        return true;
    };

    return {
        setupForegroundDrawing,
        captureCanvasView,
        restoreCanvasView,
        beginCandidatePreview,
        confirmCandidateSelection,
        endCandidatePreview,
        setSidebarTargetNode,
    };
};
