(function(global) {
    const {
        lightenColor,
        darkenColor,
        getCanvasDpr,
        getViewportWidth,
        getViewportHeight,
    } = global.NCUTMap.utils;
    const { assets } = global.NCUTMap;

    function createRenderer(options) {
        const {
            canvas,
            ctx,
            camera,
            player,
            buildings,
            roads,
            trees,
            bounds,
            typeColors,
            blockSize,
            grassTexture,
            tooltip,
            tooltipName,
            tooltipCoords,
            interactionState,
            getRemotePlayers = () => [],
        } = options;

        const flagBuilding = buildings.find(b => b.name === '国旗');
        const playgroundBuildings = [
            { building: buildings.find(b => b.name === '小操场'), width: 12, minWidth: 1 },
            { building: buildings.find(b => b.name === '大操场'), width: 24, minWidth: 2 },
        ];

        function getViewportWorldBounds(padding = 60) {
            const topLeft = camera.screenToWorld(-padding, -padding);
            const bottomRight = camera.screenToWorld(getViewportWidth() + padding, getViewportHeight() + padding);
            return {
                minX: Math.min(topLeft.x, bottomRight.x),
                maxX: Math.max(topLeft.x, bottomRight.x),
                minY: Math.min(topLeft.y, bottomRight.y),
                maxY: Math.max(topLeft.y, bottomRight.y),
            };
        }

        function rectIntersectsViewport(rx, ry, rw, rh, viewport) {
            return rx + rw >= viewport.minX
                && rx <= viewport.maxX
                && ry + rh >= viewport.minY
                && ry <= viewport.maxY;
        }

        function isBuildingVisible(building, viewport) {
            return building.rects.some(([rx, ry, rw, rh]) => rectIntersectsViewport(rx, ry, rw, rh, viewport));
        }

        function resizeCanvas() {
            const dpr = getCanvasDpr();
            canvas.width = getViewportWidth() * dpr;
            canvas.height = getViewportHeight() * dpr;
            canvas.style.width = getViewportWidth() + 'px';
            canvas.style.height = getViewportHeight() + 'px';
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
        }

        function drawGrassBackground() {
            const topLeft = camera.screenToWorld(0, 0);
            const bottomRight = camera.screenToWorld(getViewportWidth(), getViewportHeight());
            const startX = Math.floor(topLeft.x / grassTexture.size) * grassTexture.size;
            const startY = Math.floor(topLeft.y / grassTexture.size) * grassTexture.size;
            const endX = bottomRight.x + grassTexture.size;
            const endY = bottomRight.y + grassTexture.size;
            const tileScreenW = grassTexture.size * camera.state.zoom;

            if (tileScreenW < 0.5) return;

            for (let wx = startX; wx < endX; wx += grassTexture.size) {
                for (let wy = startY; wy < endY; wy += grassTexture.size) {
                    const s = camera.worldToScreen(wx, wy);
                    if (s.x > getViewportWidth() + tileScreenW || s.y > getViewportHeight() + tileScreenW) continue;
                    if (s.x + tileScreenW < -tileScreenW || s.y + tileScreenW < -tileScreenW) continue;

                    const nextS = camera.worldToScreen(wx + grassTexture.size, wy + grassTexture.size);
                    const screenW = nextS.x - s.x;
                    const screenH = nextS.y - s.y;

                    if (screenW > 0.5 && screenH > 0.5) {
                        ctx.drawImage(grassTexture.canvas, s.x, s.y, screenW, screenH);
                    }
                }
            }
        }

        function drawRoads() {
            roads.forEach(road => {
                const s = camera.worldToScreen(road.x, road.y);
                const e = camera.worldToScreen(road.x + road.w, road.y + road.h);
                const sw = e.x - s.x;
                const sh = e.y - s.y;

                if (sw < 0.3 && sh < 0.3) return;

                ctx.fillStyle = '#8a8a7a';
                ctx.fillRect(s.x, s.y, sw, sh);

                const blockScreenSize = blockSize * camera.state.zoom;
                if (blockScreenSize > 1.5) {
                    ctx.fillStyle = '#7a7a6a';
                    const stepsX = Math.max(1, Math.floor(sw / blockScreenSize));
                    const stepsY = Math.max(1, Math.floor(sh / blockScreenSize));
                    const actualBlockW = sw / stepsX;
                    const actualBlockH = sh / stepsY;

                    for (let ix = 0; ix < stepsX; ix++) {
                        for (let iy = 0; iy < stepsY; iy++) {
                            if ((ix + iy) % 3 === 0) {
                                ctx.fillRect(s.x + ix * actualBlockW, s.y + iy * actualBlockH, actualBlockW, actualBlockH);
                            }
                        }
                    }
                }

                ctx.strokeStyle = '#5a5a4a';
                ctx.lineWidth = Math.max(1, camera.state.zoom * 1.5);
                ctx.strokeRect(s.x, s.y, sw, sh);
            });
        }

        function drawBuildingRect(rx, ry, rw, rh, colorConfig, isHovered) {
            const s = camera.worldToScreen(rx, ry);
            const e = camera.worldToScreen(rx + rw, ry + rh);
            const sw = e.x - s.x;
            const sh = e.y - s.y;

            if (sw < 0.5 && sh < 0.5) return;
            if (s.x > getViewportWidth() + 50 || s.y > getViewportHeight() + 50 || e.x < -50 || e.y < -50) return;

            const blockScreenSize = blockSize * camera.state.zoom;
            const shadowOff = Math.max(2, camera.state.zoom * 4);

            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(s.x + shadowOff, s.y + shadowOff, sw, sh);

            ctx.fillStyle = isHovered ? lightenColor(colorConfig.main, 0.2) : colorConfig.main;
            ctx.fillRect(s.x, s.y, sw, sh);

            if (blockScreenSize > 2) {
                const stepsX = Math.max(1, Math.floor(sw / blockScreenSize));
                const stepsY = Math.max(1, Math.floor(sh / blockScreenSize));
                const actualBlockW = sw / stepsX;
                const actualBlockH = sh / stepsY;
                const lightColor = lightenColor(colorConfig.main, 0.12);
                const darkColor = darkenColor(colorConfig.main, 0.08);

                for (let ix = 0; ix < stepsX; ix++) {
                    for (let iy = 0; iy < stepsY; iy++) {
                        const bx = s.x + ix * actualBlockW;
                        const by = s.y + iy * actualBlockH;
                        const hash = (ix * 127 + iy * 311) % 7;

                        if (hash === 0) {
                            ctx.fillStyle = lightColor;
                            ctx.fillRect(bx + 1, by + 1, actualBlockW - 2, actualBlockH - 2);
                        } else if (hash === 1) {
                            ctx.fillStyle = darkColor;
                            ctx.fillRect(bx + 1, by + 1, actualBlockW - 2, actualBlockH - 2);
                        }
                    }
                }

                if (blockScreenSize > 3) {
                    ctx.strokeStyle = darkenColor(colorConfig.edge, 0.3);
                    ctx.lineWidth = Math.max(0.5, camera.state.zoom * 0.6);

                    for (let ix = 0; ix <= stepsX; ix++) {
                        const lx = s.x + ix * actualBlockW;
                        ctx.beginPath();
                        ctx.moveTo(lx, s.y);
                        ctx.lineTo(lx, s.y + sh);
                        ctx.stroke();
                    }

                    for (let iy = 0; iy <= stepsY; iy++) {
                        const ly = s.y + iy * actualBlockH;
                        ctx.beginPath();
                        ctx.moveTo(s.x, ly);
                        ctx.lineTo(s.x + sw, ly);
                        ctx.stroke();
                    }
                }
            }

            const edgeWidth = Math.max(1.5, camera.state.zoom * 2.5);
            ctx.strokeStyle = isHovered ? '#ffffff' : colorConfig.edge;
            ctx.lineWidth = edgeWidth;
            ctx.strokeRect(s.x, s.y, sw, sh);

            if (isHovered) {
                ctx.strokeStyle = '#ffd060';
                ctx.lineWidth = edgeWidth + 2;
                ctx.setLineDash([4 * camera.state.zoom, 3 * camera.state.zoom]);
                ctx.strokeRect(s.x - 2, s.y - 2, sw + 4, sh + 4);
                ctx.setLineDash([]);
                ctx.lineWidth = edgeWidth;
            }

            if (blockScreenSize > 2 && sw > 8 && sh > 8) {
                const hlSize = Math.max(1, blockScreenSize * 0.5);
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(s.x + 1, s.y + 1, hlSize, hlSize);
                ctx.fillRect(s.x + sw - hlSize - 1, s.y + 1, hlSize, hlSize);
            }
        }

        function drawBuildingLabel(building) {
            const [rx, ry, rw, rh] = building.rects[0];
            const s = camera.worldToScreen(rx + rw / 2, ry + rh / 2);

            if (s.x < -100 || s.x > getViewportWidth() + 100 || s.y < -100 || s.y > getViewportHeight() + 100) return;

            const fontSize = Math.max(8, Math.min(22, camera.state.zoom * 14));

            ctx.save();
            ctx.font = `bold ${fontSize}px "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const shadowOff = Math.max(1, fontSize * 0.15);
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillText(building.name, s.x + shadowOff, s.y + shadowOff);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(building.name, s.x, s.y);

            if (fontSize > 10) {
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = Math.max(0.5, fontSize * 0.08);
                ctx.strokeText(building.name, s.x, s.y);
            }

            ctx.restore();
        }

        function drawTrees() {
            trees.forEach(tree => {
                const s = camera.worldToScreen(tree.x, tree.y);
                const treeScreenSize = tree.size * camera.state.zoom;
                if (treeScreenSize < 0.8) return;
                if (s.x < -20 || s.x > getViewportWidth() + 20 || s.y < -20 || s.y > getViewportHeight() + 20) return;

                const ts = Math.max(1.5, treeScreenSize);
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(s.x - ts / 2 + 1.5, s.y - ts / 2 + 1.5, ts, ts);

                const darkGreen = '#3a6a20';
                const midGreen = '#4a8a2a';
                const lightGreen = '#5a9a30';
                const pixelCount = Math.max(3, Math.floor(ts / 3));
                const pixelSize = ts / pixelCount;

                for (let px = 0; px < pixelCount; px++) {
                    for (let py = 0; py < pixelCount; py++) {
                        const distFromCenter = Math.abs(px - pixelCount / 2 + 0.5) + Math.abs(py - pixelCount / 2 + 0.5);
                        const maxDist = pixelCount / 2 + 0.5;

                        if (distFromCenter < maxDist * 0.9) {
                            const colorIdx = Math.floor((tree.shade + (px + py) / (pixelCount * 2)) * 3);
                            ctx.fillStyle = colorIdx === 0 ? darkGreen : colorIdx === 1 ? midGreen : lightGreen;
                            ctx.fillRect(s.x - ts / 2 + px * pixelSize, s.y - ts / 2 + py * pixelSize, pixelSize, pixelSize);
                        }
                    }
                }

                const trunkW = Math.max(1, ts * 0.3);
                const trunkH = Math.max(1, ts * 0.4);
                ctx.fillStyle = '#6b4a2a';
                ctx.fillRect(s.x - trunkW / 2, s.y + ts * 0.1, trunkW, trunkH);
            });
        }

        function drawFlagSpecial(building) {
            const [rx, ry, rw, rh] = building.rects[0];
            const s = camera.worldToScreen(rx, ry);
            const e = camera.worldToScreen(rx + rw, ry + rh);
            const sw = e.x - s.x;
            const sh = e.y - s.y;
            const cx = s.x + sw / 2;
            const cy = s.y + sh / 2;

            const poleW = Math.max(1.5, camera.state.zoom * 2);
            const poleH = Math.max(15, camera.state.zoom * 25);
            ctx.fillStyle = '#8a8a8a';
            ctx.fillRect(cx - poleW / 2, cy - poleH, poleW, poleH);

            const flagW = Math.max(8, camera.state.zoom * 14);
            const flagH = Math.max(5, camera.state.zoom * 9);
            ctx.fillStyle = '#d43030';
            ctx.fillRect(cx, cy - poleH, flagW, flagH);
            ctx.fillStyle = '#f0d020';
            const starSize = Math.max(2, camera.state.zoom * 4);
            ctx.fillRect(cx + flagW * 0.3, cy - poleH + flagH * 0.25, starSize, starSize);

            ctx.strokeStyle = '#6a1010';
            ctx.lineWidth = Math.max(0.5, camera.state.zoom * 0.8);
            ctx.strokeRect(cx, cy - poleH, flagW, flagH);
        }

        function drawPlaygroundRedBorder(viewport) {
            playgroundBuildings.forEach(({ building, width, minWidth }) => {
                if (!building || !isBuildingVisible(building, viewport)) return;

                building.rects.forEach(([rx, ry, rw, rh]) => {
                    const s = camera.worldToScreen(rx, ry);
                    const e = camera.worldToScreen(rx + rw, ry + rh);
                    ctx.strokeStyle = '#c43030';
                    ctx.lineWidth = Math.max(minWidth, camera.state.zoom * width);
                    ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
                });
            });
        }

        function drawAllBuildings() {
            const viewport = getViewportWorldBounds();

            buildings.forEach(building => {
                if (!isBuildingVisible(building, viewport)) return;

                const colorConfig = typeColors[building.type];
                const isHovered = interactionState.hoveredBuilding === building;

                building.rects.forEach(([rx, ry, rw, rh]) => {
                    drawBuildingRect(rx, ry, rw, rh, colorConfig, isHovered);
                });
            });

            if (flagBuilding && isBuildingVisible(flagBuilding, viewport)) {
                drawFlagSpecial(flagBuilding);
            }

            drawPlaygroundRedBorder(viewport);

            buildings.forEach(building => {
                if (building.name === '国旗' || !isBuildingVisible(building, viewport)) return;

                const totalArea = building.rects.reduce((sum, rect) => sum + rect[2] * rect[3], 0);
                const screenArea = totalArea * camera.state.zoom * camera.state.zoom;
                if (screenArea > 150 || camera.state.zoom > 0.4) {
                    drawBuildingLabel(building);
                }
            });

            if (flagBuilding && camera.state.zoom > 0.3 && isBuildingVisible(flagBuilding, viewport)) {
                const [frx, fry, frw] = flagBuilding.rects[0];
                const fs = camera.worldToScreen(frx + frw / 2, fry - 18);
                const fFontSize = Math.max(7, Math.min(16, camera.state.zoom * 11));
                ctx.save();
                ctx.font = `bold ${fFontSize}px "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillText('国旗', fs.x + 1, fs.y + 1);
                ctx.fillStyle = '#ff6060';
                ctx.fillText('国旗', fs.x, fs.y);
                ctx.restore();
            }
        }

        function drawRemotePlayers() {
            const remotes = typeof getRemotePlayers === 'function' ? getRemotePlayers() : [];
            remotes.forEach(remote => {
                const s = camera.worldToScreen(remote.x, remote.y);
                const screenSize = player.state.size * camera.state.zoom;
                if (screenSize < 3) return;
                const halfSize = screenSize / 2;
                const shadowOffset = Math.max(2, camera.state.zoom * 3);
                const skinImage = assets?.getSkinImageForItemId?.(remote.skinItemId);
                const skinColor = remote.skinColor || assets?.getSkinFallbackColor?.(remote.skinItemId) || '#38bdf8';

                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(s.x - halfSize + shadowOffset, s.y - halfSize + shadowOffset, screenSize, screenSize);

                if (skinImage?.complete && skinImage.naturalWidth > 0) {
                    ctx.save();
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(skinImage, s.x - halfSize, s.y - halfSize, screenSize, screenSize);
                    ctx.strokeStyle = '#7dd3fc';
                    ctx.lineWidth = Math.max(1.5, camera.state.zoom * 2);
                    ctx.strokeRect(s.x - halfSize, s.y - halfSize, screenSize, screenSize);
                    ctx.restore();
                } else {
                    const gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, halfSize);
                    gradient.addColorStop(0, skinColor);
                    gradient.addColorStop(1, '#1e3a5f');
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, halfSize, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#7dd3fc';
                    ctx.lineWidth = Math.max(1.5, camera.state.zoom * 2);
                    ctx.stroke();
                }

                ctx.fillStyle = '#fff7df';
                ctx.font = `${Math.max(10, 11 * camera.state.zoom)}px Microsoft YaHei, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(remote.nickname || '玩家', s.x, s.y - halfSize - 6);
            });
        }

        function drawPlayer() {
            if (!player) return;

            const s = camera.worldToScreen(player.state.x, player.state.y);
            const screenSize = player.state.size * camera.state.zoom;
            
            if (screenSize < 3) return;

            const halfSize = screenSize / 2;
            const shadowOffset = Math.max(2, camera.state.zoom * 3);

            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(s.x - halfSize + shadowOffset, s.y - halfSize + shadowOffset, screenSize, screenSize);

            if (player.state.skinImage && player.state.skinImage.complete && player.state.skinImage.naturalWidth > 0) {
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(player.state.skinImage, s.x - halfSize, s.y - halfSize, screenSize, screenSize);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = Math.max(1.5, camera.state.zoom * 2);
                ctx.strokeRect(s.x - halfSize, s.y - halfSize, screenSize, screenSize);
                ctx.restore();
                return;
            }

            const gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, halfSize);
            gradient.addColorStop(0, player.state.skinColor || '#4a90e0');
            gradient.addColorStop(0.5, '#3a7ac0');
            gradient.addColorStop(1, '#2a5a90');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(s.x, s.y, halfSize, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1.5, camera.state.zoom * 2);
            ctx.beginPath();
            ctx.arc(s.x, s.y, halfSize, 0, Math.PI * 2);
            ctx.stroke();

            if (screenSize > 12) {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(s.x - halfSize * 0.3, s.y - halfSize * 0.2, halfSize * 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(s.x + halfSize * 0.3, s.y - halfSize * 0.2, halfSize * 0.2, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#333333';
                ctx.beginPath();
                ctx.arc(s.x - halfSize * 0.3, s.y - halfSize * 0.2, halfSize * 0.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(s.x + halfSize * 0.3, s.y - halfSize * 0.2, halfSize * 0.1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function drawGridOverlay() {
            if (camera.state.zoom < 0.2) return;

            const topLeft = camera.screenToWorld(0, 0);
            const bottomRight = camera.screenToWorld(getViewportWidth(), getViewportHeight());
            const gridSize = 100;
            const startX = Math.floor(topLeft.x / gridSize) * gridSize;
            const startY = Math.floor(topLeft.y / gridSize) * gridSize;

            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = Math.max(0.5, camera.state.zoom * 0.5);

            for (let wx = startX; wx < bottomRight.x; wx += gridSize) {
                const s = camera.worldToScreen(wx, topLeft.y);
                ctx.beginPath();
                ctx.moveTo(s.x, 0);
                ctx.lineTo(s.x, getViewportHeight());
                ctx.stroke();
            }

            for (let wy = startY; wy < bottomRight.y; wy += gridSize) {
                const s = camera.worldToScreen(topLeft.x, wy);
                ctx.beginPath();
                ctx.moveTo(0, s.y);
                ctx.lineTo(getViewportWidth(), s.y);
                ctx.stroke();
            }
        }

        function drawMiniBorder() {
            const tl = camera.worldToScreen(bounds.minX, bounds.minY);
            const br = camera.worldToScreen(bounds.maxX, bounds.maxY);

            ctx.strokeStyle = 'rgba(255,200,100,0.3)';
            ctx.lineWidth = Math.max(1, camera.state.zoom * 1.5);
            ctx.setLineDash([8, 12]);
            ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
            ctx.setLineDash([]);
        }

        function updateTooltip() {
            if (interactionState.hoveredBuilding && !interactionState.isDragging) {
                const [frx, fry, frw, frh] = interactionState.hoveredBuilding.rects[0];
                const typeName = typeColors[interactionState.hoveredBuilding.type].name;

                tooltipName.textContent = `${interactionState.hoveredBuilding.name} (${typeName})`;
                tooltipCoords.textContent = `坐标：(${frx}, ${fry}) | 大小：${frw}×${frh}`;
                tooltip.classList.add('visible');
            } else {
                tooltip.classList.remove('visible');
            }
        }

        function render() {
            const w = getViewportWidth();
            const h = getViewportHeight();

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);

            drawGrassBackground();
            drawGridOverlay();
            drawRoads();
            drawTrees();
            drawAllBuildings();
            drawRemotePlayers();
            drawPlayer();
            drawMiniBorder();
            updateTooltip();
        }

        return {
            resizeCanvas,
            render,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        renderer: {
            createRenderer,
        },
    };
})(window);
