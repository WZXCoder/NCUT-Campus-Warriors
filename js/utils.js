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

    global.NCUTMap = {
        ...global.NCUTMap,
        utils: {
            lightenColor,
            darkenColor,
        },
    };
})(window);
