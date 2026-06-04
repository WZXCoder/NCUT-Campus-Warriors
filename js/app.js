(function(global) {
    function createInteractionState() {
        return {
            isDragging: false,
            mouseWorldX: 0,
            mouseWorldY: 0,
            hoveredBuilding: null,
        };
    }

    async function initCampusMap() {
        const {
            CONFIG,
            TYPE_COLORS,
            data,
            texture,
            camera: cameraFactory,
            renderer: rendererFactory,
            controls,
            player: playerFactory,
            minimap: minimapFactory,
            auth,
            store,
            ui,
            assets,
            goldrush,
            survival,
            weather: weatherModule,
            realtime,
            touchControls: touchControlsFactory,
        } = global.NCUTMap;

        const canvas = document.getElementById('mapCanvas');
        const ctx = canvas.getContext('2d');
        const tooltip = document.getElementById('tooltip');
        const tooltipName = tooltip.querySelector('.tt-name');
        const tooltipCoords = tooltip.querySelector('.tt-coords');
        const authContainer = document.getElementById('auth-container');
        const gameStage = document.getElementById('game-stage');
        const userPanel = document.getElementById('user-panel');
        const logoutBtn = document.getElementById('logout-btn');
        const lobbyView = document.getElementById('lobby-view');
        const lobbyLogoutBtn = document.getElementById('lobby-logout-btn');
        const gameHud = document.getElementById('game-hud');
        const hudMode = document.getElementById('hud-mode');
        const hudHealth = document.getElementById('hud-health');
        const hudOnline = document.getElementById('hud-online');
        const hudBag = document.getElementById('hud-bag');
        const hudExtract = document.getElementById('hud-extract');
        const hudOnlineList = document.getElementById('hud-online-list');
        const attackBtn = document.getElementById('attack-btn');
        const exitGameBtn = document.getElementById('exit-game-btn');
        const minimapContainer = document.getElementById('minimap');
        const minimapCanvas = document.getElementById('minimapCanvas');
        const minimapCoords = document.getElementById('minimap-coords');
        const minimapTip = minimapContainer.querySelector('.minimap-tip');

        const bounds = data.calculateMapBounds(data.buildings, CONFIG.MAP_PADDING);
        const trees = data.generateTrees(data.buildings, data.roads, data.treeCandidateAreas);
        const grassTexture = texture.createGrassTexture(CONFIG.BLOCK_SIZE);
        const camera = cameraFactory.createCamera(bounds, CONFIG);
        const player = playerFactory.createPlayer(camera, bounds, CONFIG);
        const interactionState = createInteractionState();
        const mapRenderer = rendererFactory.createRenderer({
            canvas,
            ctx,
            camera,
            player,
            buildings: data.buildings,
            roads: data.roads,
            trees,
            bounds,
            typeColors: TYPE_COLORS,
            blockSize: CONFIG.BLOCK_SIZE,
            grassTexture,
            tooltip,
            tooltipName,
            tooltipCoords,
            interactionState,
            getRemotePlayers: () => appState.remotePlayers,
        });
        const minimap = minimapFactory.createMinimap({
            container: minimapContainer,
            canvas: minimapCanvas,
            coordsLabel: minimapCoords,
            tip: minimapTip,
            player,
            camera,
            buildings: data.buildings,
            roads: data.roads,
            trees,
            bounds,
            typeColors: TYPE_COLORS,
        });

        const weather = weatherModule.createWeatherSystem({
            onWeatherChange: (weatherType) => {
                ui.toast(`天气变化：${weather.getWeatherName(weatherType)}`);
            },
        });

        assets.rebuildItemMap?.();

        const appState = {
            profile: null,
            inventory: [],
            mode: 'auth',
            loopStarted: false,
            currentRun: null,
            remotePlayers: [],
            goldRushRoomId: null,
            survivalRoomId: null,
            survivalTeamMembers: null,
            survivalTeamSize: null,
        };

        function runCombatAction(action) {
            if (!['goldrush', 'survival'].includes(appState.mode) || !appState.currentRun) return;
            if (appState.currentRun.canControlPlayer && !appState.currentRun.canControlPlayer()) return;
            global.NCUTMap.audio?.unlock?.();
            action();
        }

        const mobileControls = touchControlsFactory.createTouchControls({
            root: document.getElementById('mobile-controls'),
            joystickEl: document.getElementById('mobile-joystick'),
            actionsEl: document.getElementById('mobile-actions'),
            attackBtn: document.getElementById('mobile-btn-attack'),
            pickupBtn: document.getElementById('mobile-btn-pickup'),
            skillBtn: document.getElementById('mobile-btn-skill'),
            extractBtn: document.getElementById('mobile-btn-extract'),
            onJoystick: (x, y) => player.setJoystickInput(x, y),
            onAttack: () => runCombatAction(() => appState.currentRun.attackNearest()),
            onPickup: () => runCombatAction(() => appState.currentRun.collectNearestItem?.()),
            onSkill: () => runCombatAction(() => appState.currentRun.useActiveSkill?.()),
            onExtract: () => {
                if (appState.mode !== 'goldrush') return;
                runCombatAction(() => appState.currentRun.tryExtract?.());
            },
        });

        const mobileOrientation = touchControlsFactory.createOrientationManager({
            hintEl: document.getElementById('landscape-hint'),
        });
        mobileOrientation.init();

        controls.createControls({
            canvas,
            camera,
            buildings: data.buildings,
            tooltip,
            interactionState,
            config: CONFIG,
            // 摸金/生存禁止拖地图，避免相机被拖走后误以为 WASD 失效
            allowSingleFingerMapDrag: () => !mobileControls.isActive() && appState.mode === 'visit',
        });

        function setView(viewName) {
            const inGame = ['visit', 'goldrush', 'survival'].includes(viewName);
            authContainer.classList.toggle('hidden', viewName !== 'auth');
            lobbyView.classList.toggle('hidden', viewName !== 'lobby');
            gameStage?.classList.toggle('hidden', !inGame);
            canvas.classList.toggle('hidden', !inGame);
            gameHud.classList.toggle('hidden', !inGame);
            userPanel.classList.add('hidden');
            tooltip.classList.remove('visible');
            mobileOrientation.setGameLandscapeEnabled(inGame);

            if (viewName === 'lobby') {
                minimap.hide();
                player.disable();
                appState.mode = 'lobby';
                mobileControls.setGameMode(null);
            } else if (viewName === 'visit' || viewName === 'goldrush' || viewName === 'survival') {
                interactionState.isDragging = false;
                document.body.classList.remove('grabbing');
                player.enable();
                minimap.show();
                mapRenderer.resizeCanvas();
                appState.mode = viewName;
                mobileControls.setGameMode(viewName);
            } else {
                minimap.hide();
                player.disable();
                appState.mode = 'auth';
                mobileControls.setGameMode(null);
            }

        }

        async function refreshGameData() {
            try {
                appState.profile = await store.refreshProfile();
                appState.inventory = await store.getInventory();
            } catch (error) {
                console.warn('[lobby] refreshGameData partial fail:', error);
                appState.profile = appState.profile || store.getUser();
                appState.inventory = appState.inventory || [];
            }
            ui.renderLobby(appState.profile, appState.inventory, store.usingSupabase());
            setPlayerSkin();
        }

        function setPlayerSkin() {
            const skinId = appState.profile?.currentSkinItemId || null;
            player.state.skinImage = assets.getSkinImageForItemId(skinId);
            player.state.skinColor = assets.getSkinFallbackColor(skinId);
        }

        function updateOnlineListHUD(mode, remotes = []) {
            const selfName = store.getDisplayName(appState.profile);
            const names = [selfName, ...remotes.map(entry => entry.nickname).filter(Boolean)];
            hudOnlineList.innerHTML = `
                <div class="hud-online-list-title">在线玩家（${names.length}）</div>
                ${names.length > 1
                    ? names.map(name => `<div class="hud-online-list-item">${name}</div>`).join('')
                    : '<div class="hud-online-list-empty">暂无其他玩家</div>'}
            `;
            hudOnlineList.classList.remove('hidden');
            if (mode === 'visit') {
                hudOnline.textContent = `在线：${names.length} 人`;
            } else if (mode === 'goldrush') {
                const roomText = appState.goldRushRoomId ? `房间 ${appState.goldRushRoomId.slice(0, 8)}…` : '房间';
                hudOnline.textContent = `${roomText}｜${names.length}/10 人`;
            } else if (mode === 'survival') {
                const teamSize = appState.survivalTeamSize || names.length;
                hudOnline.textContent = `生存队伍｜${names.length}/${teamSize} 人`;
            }
        }

        async function leaveMultiplayerSession(status = 'left') {
            const user = store.getUser();
            if (appState.mode === 'goldrush' && appState.goldRushRoomId && user?.id) {
                await realtime?.leaveGoldRushRoom?.(user.id, status);
            } else if (appState.survivalRoomId && user?.id) {
                await realtime?.leaveSurvivalRoom?.(user.id, status);
            } else {
                await realtime?.leaveAll?.();
            }
            appState.remotePlayers = [];
            appState.goldRushRoomId = null;
            appState.survivalRoomId = null;
            appState.survivalTeamMembers = null;
            appState.survivalTeamSize = null;
            hudOnlineList.classList.add('hidden');
            hudOnlineList.innerHTML = '';
        }

        async function showLobby() {
            authContainer.classList.add('hidden');
            await leaveMultiplayerSession('left');
            await refreshGameData();
            setView('lobby');
            startLobbyPresence();
        }

        let presenceTimer = null;
        let friendsChatPanel = null;

        function startLobbyPresence() {
            clearInterval(presenceTimer);
            const socialMod = global.NCUTMap.social;
            socialMod?.heartbeatOnline?.();
            presenceTimer = setInterval(() => socialMod?.heartbeatOnline?.(), 30000);
        }

        function stopLobbyPresence() {
            clearInterval(presenceTimer);
            presenceTimer = null;
        }

        async function openPlayerProfile(userId, options = {}) {
            const socialMod = global.NCUTMap.social;
            const uiMod = global.NCUTMap.ui;
            if (!socialMod || !uiMod?.showPlayerProfile) {
                ui.toast('社交功能加载失败，请强制刷新页面（Ctrl+F5）');
                return;
            }
            try {
                const profile = await socialMod.getPublicProfile(userId);
                const relation = await socialMod.getFriendRelation(userId);
                const profileHandlers = {
                    onAddFriend: async () => {
                        try {
                            await socialMod.sendFriendRequest(userId);
                            uiMod.toast('好友申请已发送');
                            if (!options.mountIn) uiMod.closeModal();
                        } catch (error) {
                            uiMod.toast(error.message);
                        }
                    },
                    onAcceptRequest: async requestId => {
                        try {
                            await socialMod.acceptFriendRequest(requestId);
                            uiMod.toast('已添加好友');
                            if (!options.mountIn) uiMod.closeModal();
                            options.onFriendAdded?.();
                        } catch (error) {
                            uiMod.toast(error.message);
                        }
                    },
                    onRejectRequest: async requestId => {
                        try {
                            await socialMod.rejectFriendRequest(requestId);
                            uiMod.toast('已拒绝申请');
                            if (!options.mountIn) uiMod.closeModal();
                        } catch (error) {
                            uiMod.toast(error.message);
                        }
                    },
                    onOpenChat: async () => {
                        if (!options.mountIn) uiMod.closeModal();
                        await openFriendsChat(userId);
                    },
                };
                uiMod.showPlayerProfile(profile, relation, profileHandlers, {
                    mountIn: options.mountIn || null,
                });
            } catch (error) {
                uiMod.toast(error.message);
            }
        }

        async function openFriendsChat(initialFriendId = null) {
            const socialMod = global.NCUTMap.social;
            const uiMod = global.NCUTMap.ui;
            if (!socialMod || !uiMod?.showFriendsChat) {
                ui.toast('社交功能加载失败，请强制刷新页面（Ctrl+F5）');
                return;
            }
            let selectedFriendId = initialFriendId;
            let searchResults = [];
            friendsChatPanel?.cleanup?.();

            friendsChatPanel = uiMod.showFriendsChat({
                initialFriendId,
                getState: async friendId => {
                    selectedFriendId = friendId || selectedFriendId;
                    const friends = await socialMod.getFriends();
                    const requests = await socialMod.getIncomingFriendRequests();
                    let messages = [];
                    if (selectedFriendId) {
                        messages = await socialMod.getMessages(selectedFriendId);
                    }
                    return { friends, requests, messages, selectedFriendId, searchResults };
                },
                onSelectFriend: id => {
                    selectedFriendId = id;
                },
                onSearch: async keyword => {
                    searchResults = keyword ? await socialMod.searchUsersByNickname(keyword) : [];
                },
                onSendRequest: async userId => {
                    await socialMod.sendFriendRequest(userId);
                    uiMod.toast('好友申请已发送');
                    searchResults = [];
                },
                onAcceptRequest: async requestId => {
                    await socialMod.acceptFriendRequest(requestId);
                    uiMod.toast('已添加好友');
                },
                onRejectRequest: async requestId => {
                    await socialMod.rejectFriendRequest(requestId);
                    uiMod.toast('已拒绝申请');
                },
                onSendMessage: async (friendId, content) => {
                    await socialMod.sendMessage(friendId, content);
                },
                onViewProfile: async userId => {
                    const mountIn = friendsChatPanel?.root?.querySelector('.modal-panel');
                    await openPlayerProfile(userId, {
                        mountIn,
                        onFriendAdded: () => friendsChatPanel?.refresh?.(),
                    });
                },
                onClose: () => {
                    friendsChatPanel = null;
                },
            });
        }

        function startLoop() {
            if (appState.loopStarted) return;
            appState.loopStarted = true;
            window.addEventListener('resize', () => {
                mapRenderer.resizeCanvas();
                mobileControls.updateVisibility();
                mobileOrientation.updateHint();
            });

            let weatherTimer = 0;
            let minimapFrame = 0;
            let lastFrameTime = performance.now();
            const WEATHER_INTERVAL = 40000;

            function gameLoop(now) {
                requestAnimationFrame(gameLoop);

                const deltaTime = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 0.05);
                lastFrameTime = now;

                if (document.hidden) return;

                const inGame = appState.mode === 'visit' || appState.mode === 'goldrush' || appState.mode === 'survival';
                if (!inGame) return;

                player.update(deltaTime);
                camera.update();
                auth.updateOnlineStatus(player.state.x, player.state.y);
                if (appState.currentRun) appState.currentRun.update(deltaTime);
                mapRenderer.render();
                if (appState.currentRun) appState.currentRun.render(ctx, camera);
                weather.draw(ctx, camera, bounds);

                minimapFrame += 1;
                if (minimapFrame % 3 === 0) {
                    minimap.render();
                }

                weatherTimer += deltaTime * 1000;
                if (weatherTimer >= WEATHER_INTERVAL) {
                    weatherTimer = 0;
                    weather.randomWeather();
                }
            }

            gameLoop();
        }

        async function enterVisitMode() {
            appState.currentRun = null;
            appState.remotePlayers = [];
            store.markDailyTask('visit');
            store.recordVisitAchievement();
            hudMode.textContent = '参观模式';
            hudHealth.textContent = '生命：--';
            hudBag.textContent = '本局背包：--';
            hudExtract.textContent = '';
            attackBtn.classList.add('hidden');
            setView('visit');
            camera.reset();
            startLoop();

            const user = store.getUser();
            const displayName = store.getDisplayName(appState.profile);
            if (!user?.id) {
                hudOnline.textContent = '在线：未登录';
                hudOnlineList.classList.add('hidden');
                ui.toast('已进入参观模式（未登录，无法多人）');
                return;
            }

            if (!realtime?.isEnabled?.()) {
                hudOnline.textContent = `在线：${displayName}（单机）`;
                hudOnlineList.classList.add('hidden');
                ui.toast('已进入参观模式（未配置 Supabase，无法多人）');
                return;
            }

            try {
                const result = await realtime.joinVisit(
                    {
                        id: user.id,
                        avatarColor: assets.getSkinFallbackColor(appState.profile?.currentSkinItemId),
                        currentSkinItemId: appState.profile?.currentSkinItemId || null,
                    },
                    displayName,
                    () => ({ x: player.state.x, y: player.state.y }),
                    {
                        onPresenceChange: remotes => {
                            appState.remotePlayers = remotes;
                            remotes.forEach(remote => assets.getSkinImageForItemId?.(remote.skinItemId));
                            updateOnlineListHUD('visit', remotes);
                        },
                    },
                );
                if (!result?.ok) {
                    ui.toast(`多人同步失败：${result.reason || realtime.getLastError?.() || '未知错误'}`);
                    hudOnline.textContent = `在线：${displayName}（同步失败）`;
                    hudOnlineList.classList.add('hidden');
                    return;
                }
                const onlineCount = 1 + (appState.remotePlayers?.length || 0);
                updateOnlineListHUD('visit', appState.remotePlayers);
                if (onlineCount > 1) {
                    ui.toast(`已进入参观模式，当前 ${onlineCount} 人在线，可互相看见`);
                } else {
                    ui.toast('已进入参观模式，等待其他访客加入…');
                }
            } catch (error) {
                console.error(error);
                ui.toast(`多人同步失败：${error.message}（请确认已执行 player_presence 表 SQL）`);
                hudOnline.textContent = `在线：${displayName}（同步失败）`;
                hudOnlineList.classList.add('hidden');
            }
        }

        function enterGoldRushMode() {
            const { active, passive } = global.NCUTMap.skills.getAvailableSkills(appState.inventory);
            if (!active.length || !passive.length) {
                ui.toast('暂无可用技能');
                return;
            }
            ui.showGoldRushPrep(appState.inventory, active, passive, startGoldRushRun);
        }

        async function startGoldRushRun(activeSkillId, passiveSkillId, carriedItems = []) {
            attackBtn.classList.remove('hidden');
            hudMode.textContent = '摸金模式';
            const user = store.getUser();
            const displayName = store.getDisplayName(appState.profile);
            const baseBackpackUsage = store.getInventoryUsageFromEntries(appState.inventory);

            let roomId = null;
            let goldRushPlayerCount = 1;
            let goldRushPeerPresence = 0;
            if (realtime?.isEnabled?.()) {
                try {
                    const joinResult = await realtime.findOrJoinGoldRushRoom(user, displayName);
                    roomId = joinResult.roomId;
                    goldRushPlayerCount = joinResult.playerCount || 1;
                    if (roomId && realtime.countActiveMembers) {
                        goldRushPlayerCount = await realtime.countActiveMembers(roomId) || goldRushPlayerCount;
                    }
                    appState.goldRushRoomId = roomId;
                    if (joinResult.created) ui.toast('已创建新摸金房间');
                    else ui.toast(`加入摸金房间（当前约 ${goldRushPlayerCount} 人）`);
                } catch (error) {
                    console.error(error);
                    ui.toast(`房间匹配失败：${error.message}（请确认已执行 game_rooms SQL）`);
                }
            }

            if (roomId && realtime.countActivePresence) {
                goldRushPeerPresence = await realtime.countActivePresence(roomId, 'goldrush', user?.id);
            }

            // 仅当检测到其他玩家在线时使用共享 NPC；单人始终走本地 AI，避免非房主收不到同步后 NPC 静止
            const useSharedGoldRushNpcs = Boolean(
                roomId && realtime?.isEnabled?.()
                && goldRushPeerPresence >= 1,
            );
            const goldRushMultiplayer = roomId && realtime?.isEnabled?.()
                ? {
                    broadcast: (event, payload) => realtime.broadcast(event, payload),
                    isRoomHost: (rid, uid) => realtime.isRoomHost(rid, uid),
                    ...(useSharedGoldRushNpcs ? {
                        initSharedNpcs: opts => realtime.initSharedNpcs(opts),
                        ensureSharedNpcs: (rid, builder, max, opts) => realtime.ensureSharedNpcs(rid, builder, max, opts),
                        refreshSharedNpcs: rid => realtime.refreshSharedNpcs(rid),
                        stopSharedNpcs: () => realtime.stopSharedNpcs(),
                        updateSharedNpcHp: (id, hp) => realtime.updateSharedNpcHp(id, hp),
                        deleteSharedNpc: id => realtime.deleteSharedNpc(id),
                        syncSharedNpcBatch: npcs => realtime.syncSharedNpcBatch(npcs),
                        broadcastSharedNpcState: npcs => realtime.broadcastSharedNpcState(npcs),
                    } : {}),
                }
                : null;

            appState.currentRun = goldrush.createGoldRush({
                player,
                camera,
                bounds,
                buildings: data.buildings,
                carriedItems,
                activeSkillId,
                passiveSkillId,
                backpackCapacity: appState.profile.backpackCapacity,
                baseBackpackUsage,
                roomId,
                userId: user?.id,
                useSharedNpcs: useSharedGoldRushNpcs,
                multiplayer: goldRushMultiplayer,
                onLeaveRoom: status => {
                    const currentUser = store.getUser();
                    const room = appState.goldRushRoomId;
                    appState.goldRushRoomId = null;
                    if (room && currentUser?.id) {
                        return realtime.leaveGoldRushRoom(currentUser.id, status);
                    }
                    return realtime?.leaveAll?.();
                },
                toast: ui.toast,
                onHud: hud => {
                    hudHealth.textContent = `生命：${hud.health}`;
                    hudBag.textContent = `背包：${hud.bagUsed}/${hud.bagCapacity}｜本局+${hud.bagCount}｜攻${hud.attack} 距${hud.attackRange} 攻速${hud.attackSpeed}`;
                    hudExtract.textContent = `武器：${hud.weaponText}｜移速：${hud.speedText}｜${hud.extractText}${hud.skillText ? `｜${hud.skillText}` : ''}｜被动：${hud.passiveSkillName}`;
                },
                onFinish: async result => {
                    await store.applyRunResult(result);
                    if (result.status === 'success') {
                        await store.markDailyTask('goldrush_extract');
                        await store.recordGoldrushAchievements(result);
                    }
                    appState.currentRun = null;
                    await showLobby();
                },
            });
            setView('goldrush');
            camera.reset();
            startLoop();

            if (roomId && realtime?.isEnabled?.()) {
                try {
                    const joinPresence = await realtime.joinGoldRushRoom(
                        roomId,
                        {
                            id: user.id,
                            avatarColor: assets.getSkinFallbackColor(appState.profile?.currentSkinItemId),
                            currentSkinItemId: appState.profile?.currentSkinItemId || null,
                        },
                        displayName,
                        () => ({
                            x: player.state.x,
                            y: player.state.y,
                            hp: appState.currentRun?.state?.health ?? 100,
                            maxHp: 100,
                            status: (appState.currentRun?.state?.health ?? 100) > 0 ? 'active' : 'dead',
                        }),
                        {
                            onPresenceChange: remotes => {
                                appState.remotePlayers = remotes;
                                updateOnlineListHUD('goldrush', remotes);
                                appState.currentRun?.syncRemotePlayers?.(remotes);
                            },
                            events: [
                                { event: 'pvp_hit', callback: payload => appState.currentRun?.handlePvpHit?.(payload) },
                                { event: 'npc_player_hit', callback: payload => appState.currentRun?.handleNpcPlayerHit?.(payload) },
                                { event: 'npc_state', callback: payload => appState.currentRun?.handleSharedNpcBroadcast?.(payload) },
                            ],
                        },
                    );
                    if (!joinPresence?.ok) {
                        ui.toast(`多人同步失败：${joinPresence.reason || realtime.getLastError?.() || '未知错误'}`);
                    }
                    updateOnlineListHUD('goldrush', appState.remotePlayers);
                } catch (error) {
                    console.error(error);
                    ui.toast(`多人同步失败：${error.message}`);
                }
            } else {
                hudOnline.textContent = `玩家：${displayName}`;
            }

            try {
                await assets.preloadCombatAssets({ skinItemId: appState.profile?.currentSkinItemId });
                await appState.currentRun.start();
            } catch (error) {
                console.error('[goldrush] start failed:', error);
                ui.toast('开局加载异常，已尝试继续游戏');
            }

            const activeName = global.NCUTMap.skills.getSkillById(activeSkillId)?.name || '主动技能';
            const passiveName = global.NCUTMap.skills.getSkillById(passiveSkillId)?.name || '被动技能';
            const equipNames = carriedItems.map(id => assets.getItemById(id)?.name).filter(Boolean);
            const equipText = equipNames.length ? equipNames.join('、') : '无';
            ui.toast(`摸金开始：L 拾取，J 撤离，K 攻击，I 释放「${activeName}」｜携带：${equipText}`);
        }

        function enterSurvivalMode() {
            const { active, passive } = global.NCUTMap.skills.getAvailableSkills(appState.inventory);
            if (!active.length || !passive.length) {
                ui.toast('暂无可用技能');
                return;
            }
            ui.showSurvivalPrep(active, passive, startSurvivalRun);
        }

        async function startSurvivalRun(activeSkillId, passiveSkillId, playMode = 'solo') {
            const user = store.getUser();
            const displayName = store.getDisplayName(appState.profile);
            const modeConfig = survival.SURVIVAL_MODE_CONFIG[playMode] || survival.SURVIVAL_MODE_CONFIG.solo;
            let roomId = null;
            let teamMembers = null;

            if (playMode !== 'solo' && realtime?.isEnabled?.() && user?.id) {
                try {
                    const joinResult = await realtime.findOrJoinSurvivalRoom(user, displayName, modeConfig.teamSize);
                    roomId = joinResult.roomId;
                    appState.survivalRoomId = roomId;
                    appState.survivalTeamSize = modeConfig.teamSize;
                    teamMembers = joinResult.members;

                    if (!joinResult.ready) {
                        ui.toast(`已加入${modeConfig.label}房间，等待队友...`);
                        teamMembers = await new Promise((resolve, reject) => {
                            const waiting = ui.showSurvivalWaiting({
                                modeLabel: modeConfig.label,
                                teamSize: modeConfig.teamSize,
                                members: joinResult.members,
                                onCancel: () => reject(new Error('cancelled')),
                            });
                            waiting.cancel(() => reject(new Error('cancelled')));
                            realtime.waitForSurvivalTeam(roomId, modeConfig.teamSize, {
                                onUpdate: members => waiting.updateMembers(members),
                                onCancel: fn => waiting.cancel(fn),
                            })
                                .then(members => {
                                    waiting.close();
                                    resolve(members);
                                })
                                .catch(reject);
                        });
                    }
                    appState.survivalTeamMembers = teamMembers;
                } catch (error) {
                    if (error.message === 'cancelled') {
                        ui.toast('已取消匹配');
                        if (roomId && user?.id) await realtime.leaveSurvivalRoom(user.id);
                        appState.survivalRoomId = null;
                        return;
                    }
                    console.error(error);
                    ui.toast(`匹配失败：${error.message}`);
                    return;
                }
            } else if (playMode !== 'solo') {
                ui.toast('未登录或多人不可用，已切换为单人模式');
                playMode = 'solo';
            }

            attackBtn.classList.remove('hidden');
            hudMode.textContent = `生存模式·${(survival.SURVIVAL_MODE_CONFIG[playMode] || modeConfig).label}`;
            hudExtract.textContent = '';

            appState.currentRun = survival.createSurvival({
                player,
                camera,
                bounds,
                toast: ui.toast,
                activeSkillId,
                passiveSkillId,
                playMode,
                roomId,
                userId: user?.id,
                multiplayer: roomId && realtime?.isEnabled?.() ? {
                    broadcast: (event, payload) => realtime.broadcast(event, payload),
                    isRoomHost: (rid, uid) => realtime.isRoomHost(rid, uid),
                    initSharedNpcs: opts => realtime.initSharedNpcs(opts),
                    ensureSharedNpcs: (rid, builder, max) => realtime.ensureSharedNpcs(rid, builder, max),
                    updateSharedNpcHp: (id, hp) => realtime.updateSharedNpcHp(id, hp),
                    deleteSharedNpc: id => realtime.deleteSharedNpc(id),
                    broadcastSharedNpcState: npcs => realtime.broadcastSharedNpcState(npcs),
                    updateLocalPresenceFields: fields => realtime.updateLocalPresenceFields(fields),
                } : null,
                onLeaveRoom: status => {
                    const currentUser = store.getUser();
                    const rid = appState.survivalRoomId;
                    appState.survivalRoomId = null;
                    appState.survivalTeamMembers = null;
                    if (rid && currentUser?.id) {
                        return realtime.leaveSurvivalRoom(currentUser.id, status);
                    }
                    return realtime?.leaveAll?.();
                },
                onHud: hud => {
                    hudHealth.textContent = hud.spectating ? '生命：阵亡（观战中）' : `生命：${hud.health}`;
                    const killLabel = hud.teamMode ? '队伍击杀' : '击杀';
                    hudBag.textContent = `Lv${hud.level}｜${killLabel}：${hud.kills}｜时间：${hud.timeText}`;
                    hudExtract.textContent = `武器：${hud.weaponText}｜移速：${hud.speedText}｜${hud.skillText}｜被动：${hud.passiveSkillName}`;
                },
                onFinish: async result => {
                    await store.recordSurvivalRun(result.seconds, result.kills, {
                        subtype: result.playMode || playMode,
                        teamMembers: appState.survivalTeamMembers,
                        roomId: appState.survivalRoomId,
                    });
                    await store.recordSurvivalDailyTasks({
                        seconds: result.seconds,
                        kills: result.kills,
                    });
                    await store.markDailyTask('survival');
                    await store.recordSurvivalAchievements(result);
                    appState.currentRun = null;
                    await leaveMultiplayerSession('finished');
                    ui.showSurvivalResult(result, enterSurvivalMode, showLobby);
                },
            });

            setView('survival');
            camera.reset();
            startLoop();

            if (roomId && realtime?.isEnabled?.()) {
                try {
                    const joinPresence = await realtime.joinSurvivalRoom(
                        roomId,
                        {
                            id: user.id,
                            avatarColor: assets.getSkinFallbackColor(appState.profile?.currentSkinItemId),
                            currentSkinItemId: appState.profile?.currentSkinItemId || null,
                        },
                        displayName,
                        () => ({
                            x: player.state.x,
                            y: player.state.y,
                            hp: appState.currentRun?.state?.health ?? 100,
                            maxHp: 100,
                            status: (appState.currentRun?.state?.health ?? 100) > 0 ? 'active' : 'dead',
                        }),
                        {
                            onPresenceChange: remotes => {
                                appState.remotePlayers = remotes;
                                updateOnlineListHUD('survival', remotes);
                                appState.currentRun?.syncRemotePlayers?.(remotes);
                            },
                            events: [
                                { event: 'npc_player_hit', callback: payload => appState.currentRun?.handleNpcPlayerHit?.(payload) },
                                { event: 'npc_state', callback: payload => appState.currentRun?.handleSharedNpcBroadcast?.(payload) },
                                { event: 'survival_team_stat', callback: payload => appState.currentRun?.handleTeamStat?.(payload) },
                                { event: 'survival_team_start', callback: payload => appState.currentRun?.handleTeamStart?.(payload) },
                                { event: 'survival_team_finish', callback: payload => appState.currentRun?.handleTeamFinish?.(payload) },
                            ],
                        },
                        modeConfig.teamSize,
                    );
                    if (!joinPresence?.ok) {
                        ui.toast(`多人同步失败：${joinPresence.reason || realtime.getLastError?.() || '未知错误'}`);
                    }
                    updateOnlineListHUD('survival', appState.remotePlayers);
                } catch (error) {
                    console.error(error);
                    ui.toast(`多人同步失败：${error.message}`);
                }
            } else {
                hudOnline.textContent = `玩家：${displayName}`;
            }

            try {
                await assets.preloadCombatAssets({ skinItemId: appState.profile?.currentSkinItemId });
                await appState.currentRun.start();
            } catch (error) {
                console.error('[survival] start failed:', error);
                ui.toast('开局加载异常，已尝试继续游戏');
            }

            const activeName = global.NCUTMap.skills.getSkillById(activeSkillId)?.name || '主动技能';
            const passiveName = global.NCUTMap.skills.getSkillById(passiveSkillId)?.name || '被动技能';
            ui.toast(`生存开始（${(survival.SURVIVAL_MODE_CONFIG[playMode] || modeConfig).label}）：L 拾取，K 攻击，I 释放「${activeName}」｜被动「${passiveName}」`);
        }

        const loginCaptcha = { id: null, digits: '' };
        const registerCaptcha = { id: null, digits: '' };

        async function refreshLoginCaptcha() {
            const display = document.getElementById('login-captcha-display');
            const input = document.getElementById('login-captcha-input');
            try {
                display.textContent = '....';
                const c = await global.NCUTMap.captcha.issueCaptcha();
                loginCaptcha.id = c.id;
                loginCaptcha.digits = c.digits;
                display.textContent = c.digits;
                if (input) input.value = '';
            } catch (e) {
                display.textContent = '失败';
                loginCaptcha.id = null;
                throw e;
            }
        }

        async function refreshRegisterCaptcha() {
            const display = document.getElementById('register-captcha-display');
            const input = document.getElementById('register-captcha-input');
            try {
                display.textContent = '....';
                const c = await global.NCUTMap.captcha.issueCaptcha();
                registerCaptcha.id = c.id;
                registerCaptcha.digits = c.digits;
                display.textContent = c.digits;
                if (input) input.value = '';
            } catch (e) {
                display.textContent = '失败';
                registerCaptcha.id = null;
                throw e;
            }
        }

        async function handleLogin(username, password) {
            const errEl = document.getElementById('login-error');
            errEl.textContent = '';
            try {
                if (!loginCaptcha.id) await refreshLoginCaptcha();
                const captchaCode = document.getElementById('login-captcha-input')?.value?.trim() || '';
                const { user } = await auth.signIn(username, password, {
                    captchaId: loginCaptcha.id,
                    captchaCode,
                });
                if (!user) {
                    errEl.textContent = '登录失败：未获取到用户档案';
                    await refreshLoginCaptcha();
                    return;
                }
                try {
                    await showLobby();
                } catch (lobbyErr) {
                    console.error(lobbyErr);
                    errEl.textContent = `已登录，但进入大厅失败：${lobbyErr.message}`;
                }
            } catch (error) {
                errEl.textContent = error.message || String(error);
                await refreshLoginCaptcha().catch(() => null);
            }
        }

        async function handleRegister(username, password) {
            const errEl = document.getElementById('register-error');
            errEl.textContent = '';
            try {
                if (password.length < 6) {
                    throw new Error('密码至少需要6位');
                }
                if (!registerCaptcha.id) await refreshRegisterCaptcha();
                const captchaCode = document.getElementById('register-captcha-input')?.value?.trim() || '';
                const { user } = await auth.signUp(username, password, {
                    captchaId: registerCaptcha.id,
                    captchaCode,
                });
                if (user) {
                    try {
                        await showLobby();
                    } catch (lobbyErr) {
                        errEl.textContent = `注册成功，但进入大厅失败：${lobbyErr.message}`;
                    }
                }
            } catch (error) {
                errEl.textContent = error.message || String(error);
                await refreshRegisterCaptcha().catch(() => null);
            }
        }

        async function handleLogout() {
            try {
                stopLobbyPresence();
                friendsChatPanel?.cleanup?.();
                friendsChatPanel = null;
                await auth.signOut();
                appState.profile = null;
                appState.inventory = [];
                appState.currentRun = null;
                setView('auth');
            } catch (error) {
                console.error('退出登录失败:', error);
            }
        }

        async function openRenameFlow() {
            await refreshGameData();
            const hasCard = appState.inventory.some(entry => entry.itemId === 'item_rename_card' && entry.quantity > 0);
            if (!hasCard) {
                ui.toast('没有改名卡，请先在商城购买');
                return;
            }
            ui.showRenameDialog(store.getDisplayName(appState.profile), async nickname => {
                try {
                    await store.useRenameCard(nickname);
                    await refreshGameData();
                    ui.closeModal();
                    ui.toast('昵称修改成功');
                } catch (error) {
                    ui.toast(error.message);
                }
            });
        }

        async function openShop(activeTab = 'all') {
            await refreshGameData();
            ui.showShop(appState.inventory, (itemId, tab) => {
                const item = assets.getItemById(itemId);
                if (!item) return;
                ui.showPurchaseConfirm(item, async () => {
                    try {
                        await store.buyItem(itemId);
                        await refreshGameData();
                        ui.toast('购买成功');
                        await openShop(tab);
                    } catch (error) {
                        ui.toast(error.message);
                        await openShop(tab);
                    }
                }, () => openShop(tab));
            }, activeTab);
        }

        async function openBag() {
            await refreshGameData();
            const usage = await store.getBackpackUsage();
            ui.showBag(appState.inventory, async itemId => {
                const item = assets.getItemById(itemId);
                const inventoryEntry = appState.inventory.find(entry => entry.itemId === itemId);
                if (!item || !inventoryEntry) return;
                
                ui.showSellQuantityDialog(item, inventoryEntry.quantity, async quantity => {
                    try {
                        await store.sellItem(itemId, quantity);
                        await refreshGameData();
                        await openBag();
                        ui.toast('出售成功');
                    } catch (error) {
                        ui.toast(error.message);
                    }
                });
            }, appState.profile, usage, async () => {
                ui.closeModal();
                await openRenameFlow();
            });
        }

        document.getElementById('login-tab').addEventListener('click', () => {
            document.getElementById('login-tab').classList.add('active');
            document.getElementById('register-tab').classList.remove('active');
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('login-error').textContent = '';
            refreshLoginCaptcha().catch(e => {
                document.getElementById('login-error').textContent = e.message;
            });
        });

        document.getElementById('register-tab').addEventListener('click', () => {
            document.getElementById('register-tab').classList.add('active');
            document.getElementById('login-tab').classList.remove('active');
            document.getElementById('register-form').classList.remove('hidden');
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('register-error').textContent = '';
            refreshRegisterCaptcha().catch(e => {
                document.getElementById('register-error').textContent = e.message;
            });
        });

        document.getElementById('login-captcha-refresh')?.addEventListener('click', () => {
            refreshLoginCaptcha().catch(e => {
                document.getElementById('login-error').textContent = e.message;
            });
        });
        document.getElementById('register-captcha-refresh')?.addEventListener('click', () => {
            refreshRegisterCaptcha().catch(e => {
                document.getElementById('register-error').textContent = e.message;
            });
        });

        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            handleLogin(username, password);
        });

        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value;
            const password = document.getElementById('register-password').value;
            handleRegister(username, password);
        });

        logoutBtn.addEventListener('click', handleLogout);
        lobbyLogoutBtn.addEventListener('click', handleLogout);

        document.getElementById('current-role-btn').addEventListener('click', async () => {
            await refreshGameData();
            ui.showRoleSelector(appState.profile, appState.inventory, async roleId => {
                try {
                    await store.setCurrentSkin(roleId);
                    ui.closeModal();
                    await refreshGameData();
                    ui.toast('角色已切换');
                } catch (error) {
                    ui.toast(error.message);
                }
            });
        });

        function openBioEditor() {
            const uiMod = global.NCUTMap.ui;
            const storeMod = global.NCUTMap.store;
            if (!uiMod || typeof uiMod.showBioEditor !== 'function') {
                uiMod?.toast?.('简介功能加载失败，请强制刷新页面（Ctrl+F5）');
                return;
            }
            if (!storeMod || typeof storeMod.setBio !== 'function') {
                uiMod.toast('保存功能加载失败，请强制刷新页面（Ctrl+F5）');
                return;
            }
            try {
                uiMod.showBioEditor(appState.profile?.bio || '', async bio => {
                    try {
                        await storeMod.setBio(bio);
                        uiMod.closeModal();
                        await refreshGameData();
                        uiMod.toast('简介已保存');
                    } catch (error) {
                        uiMod.toast(error.message);
                    }
                });
            } catch (error) {
                console.error('打开简介编辑器失败:', error);
                uiMod.toast(error.message || '无法打开简介编辑器');
            }
        }

        lobbyView.addEventListener('click', event => {
            if (event.target.closest('#edit-bio-btn')) {
                event.preventDefault();
                openBioEditor();
            }
        });

        document.getElementById('shop-btn').addEventListener('click', openShop);

        document.getElementById('bag-btn').addEventListener('click', openBag);

        document.getElementById('collection-btn').addEventListener('click', async () => {
            await refreshGameData();
            ui.showCollections(appState.inventory);
        });

        async function openDailyTasks() {
            const tasks = await store.getDailyTasks();
            ui.showDailyTasks(tasks, async taskId => {
                try {
                    await store.claimDailyTask(taskId);
                    await refreshGameData();
                    await openDailyTasks();
                    ui.toast('领取成功');
                } catch (error) {
                    ui.toast(error.message);
                }
            });
        }

        document.getElementById('daily-task-btn').addEventListener('click', openDailyTasks);

        document.getElementById('achievement-btn').addEventListener('click', async () => {
            try {
                ui.showAchievements(await store.getAchievements());
            } catch (error) {
                ui.toast(error.message);
            }
        });

        document.getElementById('ranking-btn').addEventListener('click', async () => {
            try {
                ui.showRankings(await store.getRankings(), userId => openPlayerProfile(userId));
            } catch (error) {
                ui.toast(error.message);
            }
        });

        document.getElementById('friends-btn').addEventListener('click', async () => {
            try {
                await openFriendsChat();
            } catch (error) {
                ui.toast(error.message);
            }
        });

        document.getElementById('gameplay-guide-btn').addEventListener('click', () => {
            ui.showGameplayGuide();
        });

        document.getElementById('visit-mode-btn').addEventListener('click', enterVisitMode);

        document.getElementById('goldrush-mode-btn').addEventListener('click', async () => {
            await refreshGameData();
            enterGoldRushMode();
        });

        document.getElementById('survival-mode-btn').addEventListener('click', async () => {
            await refreshGameData();
            enterSurvivalMode();
        });

        exitGameBtn.addEventListener('click', async () => {
            if (appState.currentRun) {
                appState.currentRun.fail('主动退出摸金模式，撤离失败');
            } else {
                await showLobby();
            }
        });

        attackBtn.addEventListener('click', () => {
            if (appState.currentRun?.canControlPlayer && !appState.currentRun.canControlPlayer()) return;
            global.NCUTMap.audio?.unlock?.();
            if (appState.currentRun) appState.currentRun.attackNearest();
        });

        window.addEventListener('keydown', event => {
            const target = event.target;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            if (isInput || !['goldrush', 'survival'].includes(appState.mode) || !appState.currentRun) return;
            if (appState.currentRun.canControlPlayer && !appState.currentRun.canControlPlayer()) return;
            
            switch (event.key.toLowerCase()) {
                case 'k':
                    event.preventDefault();
                    global.NCUTMap.audio?.unlock?.();
                    appState.currentRun.attackNearest();
                    break;
                case 'l':
                    event.preventDefault();
                    if (appState.currentRun.collectNearestItem) {
                        appState.currentRun.collectNearestItem();
                    }
                    break;
                case 'i':
                    event.preventDefault();
                    if (appState.currentRun.useActiveSkill) {
                        appState.currentRun.useActiveSkill();
                    }
                    break;
                case 'j':
                    event.preventDefault();
                    if (appState.mode === 'goldrush' && appState.currentRun.tryExtract) {
                        appState.currentRun.tryExtract();
                    }
                    break;
            }
        });

        canvas.addEventListener('dblclick', event => {
            if (!appState.currentRun) return;
            const world = camera.screenToWorld(event.clientX, event.clientY);
            appState.currentRun.handleDoubleClick(world);
        });

        await auth.initSupabase();

        if (auth.isLoggedIn()) {
            await showLobby();
        } else {
            setView('auth');
            refreshLoginCaptcha().catch(e => {
                document.getElementById('login-error').textContent = e.message;
            });
        }

        console.log('校园摸金游戏已就绪');
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        app: {
            initCampusMap,
        },
    };
})(window);