import type * as types from "./types";

const PANEL_ID = "connect-the-dots-panel";
const STYLE_ID = "ctd-connect-the-dots-style";
const PANEL_ROOT_CLASS = "ctd-panel";
const PANEL_CONTENT_CLASS = "ctd-panel-content";
const PANEL_MARGIN_PX = 16;
const PANEL_MAX_WIDTH_PX = 420;
const PANEL_COMPACT_BREAKPOINT_PX = 900;

export const panelHostController = () => {
    const ensureStyles = (stylesText: string): void => {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = stylesText;
        document.head.appendChild(style);
    };

    const create = (
        canvas: types.CanvasLike,
        title: string,
    ): types.PanelLike => {
        return canvas.createPanel(title, { closable: true });
    };

    const findMountedPanel = (): types.PanelLike | null => {
        return document.querySelector<types.PanelLike>(`#${PANEL_ID}`);
    };

    const mount = (
        panel: types.PanelLike,
        canvas: types.CanvasLike | undefined,
    ): boolean => {
        const host = getHost(canvas);
        if (!host) {
            return false;
        }

        configurePanel(panel, host);
        host.append(panel);
        return true;
    };

    const disconnect = (panel: types.PanelLike | null): void => {
        if (!panel?.__ctdHostObserver) {
            return;
        }

        panel.__ctdHostObserver.disconnect();
        panel.__ctdHostObserver = null;
    };

    const close = (panel: types.PanelLike | null): void => {
        if (!panel) {
            return;
        }

        disconnect(panel);

        if (typeof panel.close === "function") {
            panel.close();
            return;
        }

        panel.onClose?.();
        panel.remove();
    };

    const configurePanel = (
        panel: types.PanelLike,
        host: HTMLElement,
    ): void => {
        panel.id = PANEL_ID;
        panel.classList.add("settings", PANEL_ROOT_CLASS);
        panel.content.classList.add(PANEL_CONTENT_CLASS);

        if (panel.footer) {
            panel.footer.style.setProperty("display", "none", "important");
        }

        const altContent = panel.querySelector<HTMLElement>(
            ".dialog-alt-content",
        );
        if (altContent) {
            altContent.style.setProperty("display", "none", "important");
        }

        disconnect(panel);
        applyPlacement(panel, host);

        if (typeof ResizeObserver !== "function") {
            return;
        }

        const observer = new ResizeObserver(() => applyPlacement(panel, host));
        observer.observe(host);
        panel.__ctdHostObserver = observer;
    };

    const applyPlacement = (
        panel: types.PanelLike,
        host: HTMLElement,
    ): void => {
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
    };

    const getHost = (
        canvas: types.CanvasLike | undefined,
    ): HTMLElement | null => {
        const graphCanvasContainer = getGraphCanvasContainer();
        const graphCanvasPanel =
            graphCanvasContainer?.querySelector<HTMLElement>(
                ".graph-canvas-panel",
            );
        if (graphCanvasPanel) {
            return graphCanvasPanel;
        }

        if (graphCanvasContainer) {
            return graphCanvasContainer;
        }

        const host = canvas?.canvas?.parentElement;
        return host instanceof HTMLElement ? host : null;
    };

    const getGraphCanvasContainer = (): HTMLElement | null => {
        const container = document.getElementById("graph-canvas-container");
        return container instanceof HTMLElement ? container : null;
    };

    return {
        ensureStyles,
        create,
        findMountedPanel,
        mount,
        disconnect,
        close,
    };
};
