(function(global) {
    function findBuildingAtWorld(buildings, camera, wx, wy) {
        const tolerance = 3 / camera.state.zoom;

        for (const building of buildings) {
            for (const [rx, ry, rw, rh] of building.rects) {
                if (
                    wx >= rx - tolerance &&
                    wx <= rx + rw + tolerance &&
                    wy >= ry - tolerance &&
                    wy <= ry + rh + tolerance
                ) {
                    return building;
                }
            }
        }

        return null;
    }

    function createControls(options) {
        const {
            canvas,
            camera,
            buildings,
            tooltip,
            interactionState,
            config,
            allowSingleFingerMapDrag = () => true,
        } = options;

        let dragStartX = 0;
        let dragStartY = 0;
        let dragCamStartX = 0;
        let dragCamStartY = 0;
        let touchStartDist = 0;
        let touchStartZoom = 0;
        let touchStartCamX = 0;
        let touchStartCamY = 0;
        let touchMidWorldX = 0;
        let touchMidWorldY = 0;
        let isTouching = false;
        let singleTouch = false;

        function startDrag(clientX, clientY) {
            interactionState.isDragging = true;
            document.body.classList.add('grabbing');
            dragStartX = clientX;
            dragStartY = clientY;
            dragCamStartX = camera.state.targetX;
            dragCamStartY = camera.state.targetY;
            tooltip.classList.remove('visible');
        }

        function updateDrag(clientX, clientY) {
            const dx = (clientX - dragStartX) / camera.state.zoom;
            const dy = (clientY - dragStartY) / camera.state.zoom;

            camera.state.targetX = dragCamStartX - dx;
            camera.state.targetY = dragCamStartY - dy;
            camera.jumpToTarget();
        }

        function stopDrag() {
            if (interactionState.isDragging) {
                interactionState.isDragging = false;
                document.body.classList.remove('grabbing');
            }
        }

        canvas.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                startDrag(event.clientX, event.clientY);
            }
        });

        window.addEventListener('mousemove', (event) => {
            const mouseWorld = camera.screenToWorld(event.clientX, event.clientY);
            interactionState.mouseWorldX = mouseWorld.x;
            interactionState.mouseWorldY = mouseWorld.y;

            if (interactionState.isDragging) {
                updateDrag(event.clientX, event.clientY);
            } else {
                interactionState.hoveredBuilding = findBuildingAtWorld(buildings, camera, mouseWorld.x, mouseWorld.y);
            }

            if (interactionState.hoveredBuilding && !interactionState.isDragging) {
                tooltip.style.left = event.clientX + 20 + 'px';
                tooltip.style.top = event.clientY - 40 + 'px';
            }
        });

        window.addEventListener('mouseup', stopDrag);

        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const zoomDelta = event.deltaY > 0 ? -config.ZOOM_STEP : config.ZOOM_STEP;
            camera.zoomAtScreenPoint(event.clientX, event.clientY, zoomDelta);
        }, { passive: false });

        canvas.addEventListener('touchstart', (event) => {
            if (event.touches.length === 1) {
                singleTouch = true;
                isTouching = false;
                if (allowSingleFingerMapDrag()) {
                    startDrag(event.touches[0].clientX, event.touches[0].clientY);
                }
            } else if (event.touches.length === 2) {
                interactionState.isDragging = false;
                singleTouch = false;
                isTouching = true;

                const dx = event.touches[0].clientX - event.touches[1].clientX;
                const dy = event.touches[0].clientY - event.touches[1].clientY;
                const midScreenX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
                const midScreenY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
                const touchMidWorld = camera.screenToWorld(midScreenX, midScreenY);

                touchStartDist = Math.sqrt(dx * dx + dy * dy);
                touchStartZoom = camera.state.targetZoom;
                touchStartCamX = camera.state.targetX;
                touchStartCamY = camera.state.targetY;
                touchMidWorldX = touchMidWorld.x;
                touchMidWorldY = touchMidWorld.y;
            }

            tooltip.classList.remove('visible');
        }, { passive: false });

        canvas.addEventListener('touchmove', (event) => {
            event.preventDefault();

            if (
                singleTouch
                && event.touches.length === 1
                && interactionState.isDragging
                && allowSingleFingerMapDrag()
            ) {
                updateDrag(event.touches[0].clientX, event.touches[0].clientY);
            } else if (event.touches.length === 2 && isTouching) {
                const dx = event.touches[0].clientX - event.touches[1].clientX;
                const dy = event.touches[0].clientY - event.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const scale = touchStartDist > 0 ? dist / touchStartDist : 1;
                const newZoom = camera.clampZoom(touchStartZoom * scale);
                const midScreenX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
                const midScreenY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

                camera.state.targetZoom = newZoom;
                camera.state.zoom = camera.state.targetZoom;
                const worldAfter = camera.screenToWorld(midScreenX, midScreenY);
                camera.state.targetX = touchStartCamX + (touchMidWorldX - worldAfter.x);
                camera.state.targetY = touchStartCamY + (touchMidWorldY - worldAfter.y);
                camera.jumpToTarget();
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            interactionState.isDragging = false;
            isTouching = false;
            singleTouch = false;
            document.body.classList.remove('grabbing');
        });

        window.addEventListener('keydown', (event) => {
            switch (event.key.toLowerCase()) {
                case 'r':
                    camera.reset();
                    break;
                case 'f':
                    camera.fitToBounds();
                    break;
                case '+':
                case '=':
                    camera.zoomAtScreenPoint(window.innerWidth / 2, window.innerHeight / 2, config.ZOOM_STEP * 2);
                    break;
                case '-':
                    camera.zoomAtScreenPoint(window.innerWidth / 2, window.innerHeight / 2, -config.ZOOM_STEP * 2);
                    break;
            }
        });
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        controls: {
            createControls,
            findBuildingAtWorld,
        },
    };
})(window);
