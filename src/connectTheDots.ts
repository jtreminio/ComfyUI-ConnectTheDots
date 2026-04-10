import { canvasPreviewController } from "./canvasPreview";
import { app } from "./comfyApp";
import styles from "./connectTheDots.css";
import { getNodeConnectionSignature } from "./graphUtils";
import { panelHostController } from "./panelHost";
import { renderPanelView } from "./panelView";
import type * as types from "./types";

const connectTheDotsExtension = (comfy: types.AppLike) => {
    const EXTENSION_NAME = "connect-the-dots";
    const MENU_LABEL = "Connect The Dots";
    const CONNECTION_WATCH_INTERVAL_MS = 150;

    let currentPanel: types.PanelLike | null = null;
    const panelHost = panelHostController();
    const canvasPreview = canvasPreviewController(() => comfy.canvas);

    const setup = (): void => canvasPreview.setupForegroundDrawing();

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
        candidate,
        isConnected,
    }: types.CandidateSelection): void => {
        if (isConnected) {
            canvasPreview.endCandidatePreview(panel);
            return;
        }

        const baseView =
            panel.__ctdBaseView || canvasPreview.captureCanvasView();
        const link = candidate.connect();
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

    const stopPanelConnectionWatcher = (
        panel: types.PanelLike | null,
    ): void => {
        if (!panel?.__ctdConnectionWatcher) {
            return;
        }

        window.clearInterval(panel.__ctdConnectionWatcher);
        panel.__ctdConnectionWatcher = null;
    };

    const startPanelConnectionWatcher = (
        panel: types.PanelLike,
        targetNode: types.GraphNode,
    ): void => {
        stopPanelConnectionWatcher(panel);
        panel.__ctdConnectionSignature = getNodeConnectionSignature(targetNode);
        panel.__ctdConnectionWatcher = window.setInterval(() => {
            if (currentPanel !== panel || panel.node !== targetNode) {
                stopPanelConnectionWatcher(panel);
                return;
            }

            if (!document.body.contains(panel)) {
                stopPanelConnectionWatcher(panel);
                return;
            }

            const nextSignature = getNodeConnectionSignature(targetNode);
            if (nextSignature === panel.__ctdConnectionSignature) {
                return;
            }

            canvasPreview.endCandidatePreview(panel);
            renderPanel(panel, targetNode);
        }, CONNECTION_WATCH_INTERVAL_MS);
    };

    const closePanel = (): void => {
        const panel = currentPanel ?? panelHost.findMountedPanel();
        if (!panel) {
            return;
        }

        stopPanelConnectionWatcher(panel);
        panelHost.close(panel);
    };

    const showPanel = (targetNode: types.GraphNode): void => {
        const canvas = comfy.canvas;
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
            stopPanelConnectionWatcher(panel);
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
        startPanelConnectionWatcher(panel, targetNode);
    };

    const register = (): void => {
        comfy.registerExtension({
            name: `jtreminio.${EXTENSION_NAME}`,
            getNodeMenuItems,
            setup,
        });
    };

    return {
        register,
    };
};

connectTheDotsExtension(app).register();
