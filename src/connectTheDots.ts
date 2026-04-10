import { canvasPreviewController } from "./canvasPreview";
import { api, app } from "./comfy";
import styles from "./connectTheDots.css";
import { getNodeConnectionSignature } from "./graphUtils";
import { panelHostController } from "./panelHost";
import { renderPanelView } from "./panelView";
import type * as types from "./types";

const connectTheDotsExtension = (
    api: types.ApiLike,
    app: types.AppLike,
): void => {
    const MENU_LABEL = "Connect The Dots";

    let currentPanel: types.PanelLike | null = null;
    const panelHost = panelHostController();
    const canvasPreview = canvasPreviewController(
        () => app.canvas,
        () => app.graph,
    );

    const chainCanvasCallback = <TOwner, TArgs extends unknown[]>(
        originalCallback:
            | ((this: TOwner, ...args: TArgs) => unknown)
            | undefined,
        callback: (this: TOwner, ...args: TArgs) => void,
    ): ((this: TOwner, ...args: TArgs) => void) => {
        return function (this: TOwner, ...args: TArgs): void {
            originalCallback?.call(this, ...args);
            callback.call(this, ...args);
        };
    };

    const getSingleSelectedNode = (
        canvas: types.CanvasLike | undefined,
    ): types.GraphNode | null => {
        const selectedNodes = Object.values(canvas?.selected_nodes || {});
        return selectedNodes.length === 1 ? selectedNodes[0] : null;
    };

    const handleSelectionChange = (): void => {
        const panel = currentPanel ?? panelHost.findMountedPanel();
        if (!panel || !document.body.contains(panel)) {
            return;
        }

        const nextNode = getSingleSelectedNode(app.canvas);
        if (!nextNode || panel.node === nextNode) {
            return;
        }

        showPanel(nextNode);
    };

    const setupSelectionChangeSync = (): void => {
        const canvas = app.canvas;
        if (!canvas || canvas.__ctdSelectionChangeWrapped) {
            return;
        }

        canvas.onSelectionChange = chainCanvasCallback(
            canvas.onSelectionChange,
            handleSelectionChange,
        );
        canvas.__ctdSelectionChangeWrapped = true;
    };

    const setup = (): void => {
        canvasPreview.setupForegroundDrawing();
        setupSelectionChangeSync();
    };

    const getNodeMenuItems = (
        node: types.GraphNode,
    ): (types.ContextMenuItem | null)[] => {
        if (!node) {
            return [];
        }

        return [
            null,
            {
                content: MENU_LABEL,
                callback: () => showPanel(node),
            },
        ];
    };

    const setPanelStatus = (
        panel: types.PanelLike,
        message: string | null,
        state = "",
    ): void => {
        panel.__ctdStatus = message ? { message, state } : null;
    };

    const renderPanel = (
        panel: types.PanelLike,
        targetNode: types.GraphNode,
    ): void => {
        renderPanelView({
            panel,
            targetNode,
            title: MENU_LABEL,
            callbacks: {
                onCandidatePreviewStart: (nextPanel, candidateNode) =>
                    canvasPreview.beginCandidatePreview(
                        nextPanel,
                        candidateNode,
                    ),
                onCandidatePreviewEnd: (nextPanel) =>
                    canvasPreview.endCandidatePreview(nextPanel),
                onCandidateSelect: (selection) =>
                    handleCandidateSelect(selection),
            },
        });

        panel.__ctdConnectionSignature = getNodeConnectionSignature(targetNode);
    };

    const handleCandidateSelect = ({
        panel,
        targetNode,
        property,
        mode,
        candidate,
        isConnected,
    }: types.CandidateSelection): void => {
        if (isConnected) {
            canvasPreview.endCandidatePreview(panel);
            return;
        }

        const baseView =
            panel.__ctdBaseView || canvasPreview.captureCanvasView();
        const link =
            mode === "input"
                ? candidate.node.connect(
                      candidate.slotIndex,
                      targetNode,
                      property.index,
                  )
                : targetNode.connect(
                      property.index,
                      candidate.node,
                      candidate.slotIndex,
                  );
        canvasPreview.restoreCanvasView(baseView);
        panel.__ctdBaseView = null;

        if (!link) {
            setPanelStatus(panel, "ComfyUI rejected that connection.", "error");
            renderPanel(panel, targetNode);
            return;
        }

        setPanelStatus(panel, null);
        renderPanel(panel, targetNode);
    };

    const stopPanelGraphChangeListener = (
        panel: types.PanelLike | null,
    ): void => {
        if (!panel?.__ctdGraphChangedHandler) {
            return;
        }

        api.removeEventListener("graphChanged", panel.__ctdGraphChangedHandler);
        panel.__ctdGraphChangedHandler = null;
    };

    const startPanelGraphChangeListener = (
        panel: types.PanelLike,
        targetNode: types.GraphNode,
    ): void => {
        stopPanelGraphChangeListener(panel);
        panel.__ctdConnectionSignature = getNodeConnectionSignature(targetNode);

        const handleGraphChanged = (): void => {
            if (currentPanel !== panel || panel.node !== targetNode) {
                stopPanelGraphChangeListener(panel);
                return;
            }

            if (!document.body.contains(panel)) {
                stopPanelGraphChangeListener(panel);
                return;
            }

            const nextSignature = getNodeConnectionSignature(targetNode);
            if (nextSignature === panel.__ctdConnectionSignature) {
                return;
            }

            canvasPreview.endCandidatePreview(panel);
            renderPanel(panel, targetNode);
        };

        panel.__ctdGraphChangedHandler = handleGraphChanged;
        api.addEventListener("graphChanged", handleGraphChanged);
    };

    const closePanel = (): void => {
        const panel = currentPanel ?? panelHost.findMountedPanel();
        if (!panel) {
            return;
        }

        stopPanelGraphChangeListener(panel);
        panelHost.close(panel);
    };

    const showPanel = (targetNode: types.GraphNode): void => {
        const canvas = app.canvas;
        if (!targetNode || !canvas) {
            return;
        }

        panelHost.ensureStyles(styles);
        canvasPreview.endCandidatePreview(
            currentPanel ?? panelHost.findMountedPanel(),
        );
        closePanel();
        canvasPreview.setSidebarTargetNode(targetNode);

        const panel = panelHost.create(canvas, MENU_LABEL);
        panel.node = targetNode;
        panel.graph = canvas.graph;

        panel.onClose = () => {
            stopPanelGraphChangeListener(panel);
            panelHost.disconnect(panel);
            canvasPreview.endCandidatePreview(panel);
            canvasPreview.setSidebarTargetNode(null);
            if (currentPanel === panel) {
                currentPanel = null;
            }
        };

        renderPanel(panel, targetNode);

        if (!panelHost.mount(panel, canvas)) {
            panel.onClose?.();
            panel.remove();
            return;
        }

        currentPanel = panel;
        startPanelGraphChangeListener(panel, targetNode);
    };

    app.registerExtension({
        name: "jtreminio.connect-the-dots",
        getNodeMenuItems,
        setup,
    });
};

connectTheDotsExtension(api, app);
