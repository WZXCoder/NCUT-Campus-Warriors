(function(global) {
    function parseHexColor(hex) {
        if (!hex.startsWith('#')) {
            return null;
        }

        const num = parseInt(hex.slice(1), 16);
        return {
            r: (num >> 16) & 0xff,
            g: (num >> 8) & 0xff,
            b: num & 0xff,
        };
    }

    function lightenColor(hex, factor) {
        const color = parseHexColor(hex);
        if (!color) return hex;

        const r = Math.min(255, Math.round(color.r + (255 - color.r) * factor));
        const g = Math.min(255, Math.round(color.g + (255 - color.g) * factor));
        const b = Math.min(255, Math.round(color.b + (255 - color.b) * factor));
        return `rgb(${r},${g},${b})`;
    }

    function darkenColor(hex, factor) {
        const color = parseHexColor(hex);
        if (!color) return hex;

        const r = Math.max(0, Math.round(color.r * (1 - factor)));
        const g = Math.max(0, Math.round(color.g * (1 - factor)));
        const b = Math.max(0, Math.round(color.b * (1 - factor)));
        return `rgb(${r},${g},${b})`;
    }

    function isCoarsePointerDevice() {
        return window.matchMedia('(pointer: coarse)').matches
            || window.matchMedia('(hover: none)').matches
            || navigator.maxTouchPoints > 0;
    }

    function getCanvasDpr(maxDesktop = 2, maxMobile = 1.5) {
        const raw = window.devicePixelRatio || 1;
        const cap = isCoarsePointerDevice() ? maxMobile : maxDesktop;
        return Math.min(raw, cap);
    }

    function usesCssLandscape() {
        return document.getElementById('game-stage')?.classList.contains('css-landscape') ?? false;
    }

    function getViewportWidth() {
        return usesCssLandscape() ? window.innerHeight : window.innerWidth;
    }

    function getViewportHeight() {
        return usesCssLandscape() ? window.innerWidth : window.innerHeight;
    }

    function getWorldViewport(camera, padding = 80) {
        const topLeft = camera.screenToWorld(-padding, -padding);
        const bottomRight = camera.screenToWorld(
            getViewportWidth() + padding,
            getViewportHeight() + padding,
        );
        return {
            minX: Math.min(topLeft.x, bottomRight.x),
            maxX: Math.max(topLeft.x, bottomRight.x),
            minY: Math.min(topLeft.y, bottomRight.y),
            maxY: Math.max(topLeft.y, bottomRight.y),
        };
    }

    function isWorldPointInViewport(x, y, viewport, radius = 48) {
        return x + radius >= viewport.minX
            && x - radius <= viewport.maxX
            && y + radius >= viewport.minY
            && y - radius <= viewport.maxY;
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        utils: {
            lightenColor,
            darkenColor,
            isCoarsePointerDevice,
            getCanvasDpr,
            usesCssLandscape,
            getViewportWidth,
            getViewportHeight,
            getWorldViewport,
            isWorldPointInViewport,
        },
    };
})(window);
