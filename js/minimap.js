(function(global) {
    const { getCanvasDpr } = global.NCUTMap.utils;

    function createMinimap(options) {
        const {
            container,
            canvas,
            coordsLabel,
            tip,
            player,
            camera,
            buildings,
            roads,
            trees,
            bounds,
            typeColors,
        } = options;

        const ctx = canvas.getContext('2d');
        const state = {
            expanded: false,
            canvasWidth: 0,
            canvasHeight: 0,
            dpr: 1,
        };

        function show() {
            container.classList.remove('hidden');
            resizeCanvas();
            render();
        }

        function hide() {
            container.classList.add('hidden');
            collapse();
        }

        function expand() {
            state.expanded = true;
            container.classList.add('expanded');
            container.title = '点击地图外部收起';
            tip.textContent = '点击外部收起';
            resizeCanvas();
        }

        function collapse() {
            state.expanded = false;
            container.classList.remove('expanded');
            container.title = '点击展开地图';
            tip.textContent = '点击展开';
            resizeCanvas();
        }

        function toggle() {
            if (state.expanded) {
                collapse();
            } else {
                expand();
            }
        }

        function resizeCanvas() {
            const rect = container.getBoundingClientRect();
            const dpr = getCanvasDpr();
            const nextWidth = Math.max(1, Math.round(rect.width));
            const nextHeight = Math.max(1, Math.round(rect.height));

            if (
                nextWidth === state.canvasWidth &&
                nextHeight === state.canvasHeight &&
                dpr === state.dpr
            ) {
                return;
            }

            state.canvasWidth = nextWidth;
            state.canvasHeight = nextHeight;
            state.dpr = dpr;
            canvas.width = nextWidth * dpr;
            canvas.height = nextHeight * dpr;
            canvas.style.width = nextWidth + 'px';
            canvas.style.height = nextHeight + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function getMapTransform() {
            const padding = state.expanded ? 28 : 12;
            const labelSpace = state.expanded ? 44 : 30;
            const availableWidth = Math.max(1, state.canvasWidth - padding * 2);
            const availableHeight = Math.max(1, state.canvasHeight - padding * 2 - labelSpace);
            const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
            const mapWidth = bounds.width * scale;
            const mapHeight = bounds.height * scale;
            const offsetX = (state.canvasWidth - mapWidth) / 2;
            const offsetY = padding + (availableHeight - mapHeight) / 2;

            return { scale, offsetX, offsetY };
        }

        function worldToMini(x, y, transform) {
            return {
                x: transform.offsetX + (x - bounds.minX) * transform.scale,
                y: transform.offsetY + (y - bounds.minY) * transform.scale,
            };
        }

        function drawBackground(transform) {
            const mapTopLeft = worldToMini(bounds.minX, bounds.minY, transform);
            const mapBottomRight = worldToMini(bounds.maxX, bounds.maxY, transform);

            ctx.fillStyle = '#244326';
            ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);

            ctx.fillStyle = '#3f7a37';
            ctx.fillRect(
                mapTopLeft.x,
                mapTopLeft.y,
                mapBottomRight.x - mapTopLeft.x,
                mapBottomRight.y - mapTopLeft.y
            );

            ctx.strokeStyle = 'rgba(255, 220, 150, 0.45)';
            ctx.lineWidth = state.expanded ? 2 : 1;
            ctx.strokeRect(
                mapTopLeft.x,
                mapTopLeft.y,
                mapBottomRight.x - mapTopLeft.x,
                mapBottomRight.y - mapTopLeft.y
            );
        }

        function drawRoads(transform) {
            ctx.fillStyle = '#8a8a7a';
            roads.forEach(road => {
                const start = worldToMini(road.x, road.y, transform);
                const end = worldToMini(road.x + road.w, road.y + road.h, transform);
                ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
            });
        }

        function drawTrees(transform) {
            const treeSize = state.expanded ? 2.4 : 1.4;
            ctx.fillStyle = 'rgba(35, 95, 32, 0.8)';
            trees.forEach(tree => {
                const point = worldToMini(tree.x, tree.y, transform);
                ctx.fillRect(point.x - treeSize / 2, point.y - treeSize / 2, treeSize, treeSize);
            });
        }

        function drawBuildings(transform) {
            buildings.forEach(building => {
                const colorConfig = typeColors[building.type];
                ctx.fillStyle = colorConfig ? colorConfig.main : '#c4a880';
                ctx.strokeStyle = colorConfig ? colorConfig.edge : '#5a4a3a';
                ctx.lineWidth = state.expanded ? 1.2 : 0.7;

                building.rects.forEach(([rx, ry, rw, rh]) => {
                    const start = worldToMini(rx, ry, transform);
                    const end = worldToMini(rx + rw, ry + rh, transform);
                    const width = Math.max(1, end.x - start.x);
                    const height = Math.max(1, end.y - start.y);

                    ctx.fillRect(start.x, start.y, width, height);
                    if (state.expanded || width > 5 || height > 5) {
                        ctx.strokeRect(start.x, start.y, width, height);
                    }
                });
            });
        }

        function drawCameraView(transform) {
            const halfWidth = window.innerWidth / 2 / camera.state.zoom;
            const halfHeight = window.innerHeight / 2 / camera.state.zoom;
            const topLeft = worldToMini(camera.state.x - halfWidth, camera.state.y - halfHeight, transform);
            const bottomRight = worldToMini(camera.state.x + halfWidth, camera.state.y + halfHeight, transform);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
            ctx.lineWidth = state.expanded ? 2 : 1.2;
            ctx.setLineDash(state.expanded ? [8, 5] : [4, 3]);
            ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
            ctx.setLineDash([]);
        }

        function drawPlayer(transform) {
            const point = worldToMini(player.state.x, player.state.y, transform);
            const radius = state.expanded ? 7 : 5;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.arc(point.x + 2, point.y + 2, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#4a90e0';
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = state.expanded ? 3 : 2;
            ctx.stroke();

            ctx.strokeStyle = '#ffd080';
            ctx.lineWidth = state.expanded ? 2 : 1.5;
            ctx.beginPath();
            ctx.moveTo(point.x - radius - 5, point.y);
            ctx.lineTo(point.x + radius + 5, point.y);
            ctx.moveTo(point.x, point.y - radius - 5);
            ctx.lineTo(point.x, point.y + radius + 5);
            ctx.stroke();
        }

        function updateCoords() {
            coordsLabel.textContent = `${Math.round(player.state.x)}, ${Math.round(player.state.y)}`;
        }

        function render() {
            if (container.classList.contains('hidden')) return;

            resizeCanvas();
            ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);

            const transform = getMapTransform();
            drawBackground(transform);
            drawRoads(transform);
            drawTrees(transform);
            drawBuildings(transform);
            drawCameraView(transform);
            drawPlayer(transform);
            updateCoords();
        }

        container.addEventListener('click', (event) => {
            event.stopPropagation();
            toggle();
        });

        document.addEventListener('click', (event) => {
            if (state.expanded && !container.contains(event.target)) {
                collapse();
            }
        });

        window.addEventListener('resize', resizeCanvas);

        return {
            show,
            hide,
            render,
            expand,
            collapse,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        minimap: {
            createMinimap,
        },
    };
})(window);
