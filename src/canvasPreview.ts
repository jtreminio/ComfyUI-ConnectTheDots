import type * as types from "./types";

export const canvasPreviewController = (
    getCanvas: () => types.CanvasLike | undefined,
) => {
    const PREVIEW_HORIZONTAL_RATIO = 0.5;
    const PREVIEW_VERTICAL_RATIO = 0.25;

    let previewNode: types.GraphNode | null = null;
    let sidebarTargetNode: types.GraphNode | null = null;

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

    const captureCanvasView = (): types.CanvasView => {
        const canvas = getCanvas();
        const offset = canvas?.ds?.offset || [0, 0];
        return {
            graph: canvas?.graph,
            offset: [offset[0], offset[1]],
            scale: canvas?.ds?.scale ?? 1,
        };
    };

    const restoreCanvasView = (
        view: types.CanvasView | null | undefined,
    ): void => {
        const canvas = getCanvas();
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
    };

    const beginCandidatePreview = (
        panel: types.PanelLike,
        candidateNode: types.GraphNode,
    ): void => {
        const canvas = getCanvas();
        if (!panel || !candidateNode || !canvas) {
            return;
        }

        if (!panel.__ctdBaseView) {
            panel.__ctdBaseView = captureCanvasView();
        }

        if (canvas.graph !== candidateNode.graph) {
            return;
        }

        setPreviewNode(candidateNode);
        const previewScale =
            panel.__ctdBaseView?.scale ?? canvas.ds?.scale ?? 1;
        if (!focusNodeAtScale(candidateNode, previewScale)) {
            canvas.centerOnNode?.(candidateNode);
        }
        canvas.setDirty(true, true);
    };

    const endCandidatePreview = (panel: types.PanelLike | null): void => {
        if (!panel) {
            return;
        }

        setPreviewNode(null);
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

        const viewWidth = canvasWidth / (scale * devicePixelRatio);
        const viewHeight = canvasHeight / (scale * devicePixelRatio);
        const targetCenterX = viewWidth * PREVIEW_HORIZONTAL_RATIO;
        const targetTopY = viewHeight * PREVIEW_VERTICAL_RATIO;

        canvas.ds.scale = scale;
        canvas.ds.offset[0] = -bounds[0] - bounds[2] * 0.5 + targetCenterX;
        canvas.ds.offset[1] = -bounds[1] + targetTopY;
        return true;
    };

    return {
        setupForegroundDrawing,
        captureCanvasView,
        restoreCanvasView,
        beginCandidatePreview,
        endCandidatePreview,
        setSidebarTargetNode,
    };
};
