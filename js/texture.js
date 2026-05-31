(function(global) {
    function createGrassTexture(blockSize) {
        const textureSize = 128;
        const canvas = document.createElement('canvas');
        canvas.width = textureSize;
        canvas.height = textureSize;

        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(textureSize, textureSize);
        const data = imageData.data;

        for (let y = 0; y < textureSize; y++) {
            for (let x = 0; x < textureSize; x++) {
                const i = (y * textureSize + x) * 4;
                const bx = Math.floor(x / blockSize);
                const by = Math.floor(y / blockSize);
                const hash = (bx * 374761393 + by * 668265263 + bx * by * 127412617) & 0x7fffffff;
                const noise = (hash % 100) / 100;
                const microNoise = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 0.5 + 0.5;

                let r;
                let g;
                let b;

                if (noise < 0.6) {
                    r = 100 + noise * 30 + microNoise * 15;
                    g = 150 + noise * 35 + microNoise * 18;
                    b = 60 + noise * 20 + microNoise * 10;
                } else if (noise < 0.85) {
                    r = 80 + noise * 20;
                    g = 130 + noise * 25;
                    b = 45 + noise * 15;
                } else {
                    r = 140 + noise * 25;
                    g = 170 + noise * 20;
                    b = 90 + noise * 15;
                }

                const edgeX = x % blockSize === 0 || x % blockSize === blockSize - 1;
                const edgeY = y % blockSize === 0 || y % blockSize === blockSize - 1;
                if (edgeX || edgeY) {
                    const darken = 0.85;
                    r *= darken;
                    g *= darken;
                    b *= darken;
                }

                data[i] = Math.min(255, Math.max(0, Math.round(r)));
                data[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
                data[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
                data[i + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return {
            canvas,
            size: textureSize,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        texture: {
            createGrassTexture,
        },
    };
})(window);
