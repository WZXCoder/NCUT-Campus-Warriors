(function(global) {
    const { getViewportWidth, getViewportHeight } = global.NCUTMap.utils;

    function createCamera(bounds, config) {
    const camera = {
        x: bounds.centerX,
        y: bounds.centerY,
        zoom: config.INITIAL_ZOOM,
        targetX: bounds.centerX,
        targetY: bounds.centerY,
        targetZoom: config.INITIAL_ZOOM,
        bounds: bounds,
    };

    function clampZoom(zoom) {
        return Math.max(config.MIN_ZOOM, Math.min(config.MAX_ZOOM, zoom));
    }

    function clampPosition(x, y) {
        const halfWidth = getViewportWidth() / 2 / camera.zoom;
        const halfHeight = getViewportHeight() / 2 / camera.zoom;
        
        const minX = bounds.minX + halfWidth;
        const maxX = bounds.maxX - halfWidth;
        const minY = bounds.minY + halfHeight;
        const maxY = bounds.maxY - halfHeight;

        return {
            x: Math.max(minX, Math.min(maxX, x)),
            y: Math.max(minY, Math.min(maxY, y)),
        };
    }

        function worldToScreen(wx, wy) {
            return {
                x: (wx - camera.x) * camera.zoom + getViewportWidth() / 2,
                y: (wy - camera.y) * camera.zoom + getViewportHeight() / 2,
            };
        }

        function screenToWorld(sx, sy) {
            return {
                x: (sx - getViewportWidth() / 2) / camera.zoom + camera.x,
                y: (sy - getViewportHeight() / 2) / camera.zoom + camera.y,
            };
        }

        function jumpToTarget() {
            camera.x = camera.targetX;
            camera.y = camera.targetY;
            camera.zoom = camera.targetZoom;
            
            const clamped = clampPosition(camera.x, camera.y);
            camera.x = clamped.x;
            camera.y = clamped.y;
        }

        function reset() {
            camera.targetX = bounds.centerX;
            camera.targetY = bounds.centerY;
            camera.targetZoom = config.INITIAL_ZOOM;
            jumpToTarget();
        }

        function fitToBounds() {
            const fitZoomX = getViewportWidth() / bounds.width;
            const fitZoomY = getViewportHeight() / bounds.height;
            const fitZoom = Math.min(fitZoomX, fitZoomY) * 0.85;

            camera.targetX = bounds.centerX;
            camera.targetY = bounds.centerY;
            camera.targetZoom = clampZoom(fitZoom);
        }

        function zoomAtScreenPoint(screenX, screenY, zoomDelta) {
            const worldBefore = screenToWorld(screenX, screenY);
            camera.targetZoom = clampZoom(camera.targetZoom + zoomDelta);
            camera.zoom = camera.targetZoom;

            const worldAfter = screenToWorld(screenX, screenY);
            camera.targetX += worldBefore.x - worldAfter.x;
            camera.targetY += worldBefore.y - worldAfter.y;
            jumpToTarget();
        }

        function zoomByScaleAtScreenPoint(screenX, screenY, zoom) {
            const worldBefore = screenToWorld(screenX, screenY);
            camera.targetZoom = clampZoom(zoom);
            camera.zoom = camera.targetZoom;

            const worldAfter = screenToWorld(screenX, screenY);
            camera.targetX += worldBefore.x - worldAfter.x;
            camera.targetY += worldBefore.y - worldAfter.y;
            jumpToTarget();
        }

        function update() {
            const lerpFactor = 0.18;
            camera.x += (camera.targetX - camera.x) * lerpFactor;
            camera.y += (camera.targetY - camera.y) * lerpFactor;
            camera.zoom += (camera.targetZoom - camera.zoom) * lerpFactor;
            camera.zoom = clampZoom(camera.zoom);
            
            const clamped = clampPosition(camera.x, camera.y);
            camera.x = clamped.x;
            camera.y = clamped.y;
        }

        jumpToTarget();

        return {
            state: camera,
            worldToScreen,
            screenToWorld,
            reset,
            fitToBounds,
            zoomAtScreenPoint,
            zoomByScaleAtScreenPoint,
            jumpToTarget,
            update,
            clampZoom,
            clampPosition,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        camera: {
            createCamera,
        },
    };
})(window);
