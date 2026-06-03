(function(global) {
    const { assets, audio } = global.NCUTMap;
    const { getWorldViewport, isWorldPointInViewport } = global.NCUTMap.utils;

    const SURVIVAL_MODE_CONFIG = {
        solo: { label: '单人', evolutionInterval: 20, baseMonsters: 10, maxMonsters: 30, teamSize: 1 },
        duo: { label: '双人', evolutionInterval: 18, baseMonsters: 14, maxMonsters: 40, teamSize: 2 },
        squad: { label: '四人', evolutionInterval: 15, baseMonsters: 18, maxMonsters: 50, teamSize: 4 },
    };

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function randomInt(min, max) {
        return Math.floor(randomBetween(min, max + 1));
    }

    const { MOVEMENT } = global.NCUTMap;

    function getPlayerBaseMoveStep() {
        return MOVEMENT.PLAYER_BASE_SPEED * MOVEMENT.MOVE_TICK_SCALE;
    }

    function randomEntityMoveStep(scale = 1) {
        return randomBetween(MOVEMENT.NPC_SPEED_RATIO_MIN, MOVEMENT.NPC_SPEED_RATIO_MAX)
            * getPlayerBaseMoveStep()
            * scale;
    }

    function createSurvival(options) {
        const {
            player,
            camera,
            bounds,
            onHud,
            onFinish,
            toast,
            activeSkillId,
            passiveSkillId,
            playMode = 'solo',
            roomId = null,
            userId = null,
            multiplayer = null,
            onLeaveRoom = null,
        } = options;
        const { skills } = global.NCUTMap;
        const modeConfig = SURVIVAL_MODE_CONFIG[playMode] || SURVIVAL_MODE_CONFIG.solo;
        const PICK_RANGE = 10;
        const CLICK_TOLERANCE = 16;
        const BASE_ATTACK = 10;
        const BASE_RANGE = 40;
        const imageCache = {};

        const state = {
            active: false,
            health: 100,
            level: 1,
            kills: 0,
            startedAt: 0,
            drops: [],
            monsters: [],
            effects: [],
            weapon: null,
            speedItem: null,
            medkitsUsed: 0,
            lastPlayerAttackAt: 0,
            lastPlayerPos: null,
            skillSpeedBonus: 0,
            playMode,
            modeConfig,
            roomId,
            remotePlayers: [],
            useSharedMonsters: false,
            isRoomHost: false,
            monsterBroadcastMode: false,
            lastFrameAt: 0,
            lastHudPush: 0,
            lastMonsterBroadcast: 0,
            lastHostCheck: 0,
            lastMonsterMaintain: 0,
            lastSyncedMonsters: new Map(),
            teamKills: 0,
            spectating: false,
            localDead: false,
            spectateTargetId: null,
            runFinished: false,
            teamStartedAtMs: null,
            teamFinishSent: false,
            teamFinishFallbackTimer: null,
        };

        function isTeamMode() {
            return playMode === 'duo' || playMode === 'squad';
        }

        function getKillCount() {
            return isTeamMode() ? state.teamKills : state.kills;
        }

        function getAliveTeammates() {
            return state.remotePlayers.filter(remote => !remote.isDead && remote.hp > 0);
        }

        function checkTeamWipe() {
            if (!isTeamMode() || state.runFinished) return;
            if (state.health > 0) return;
            if (getAliveTeammates().length > 0) return;
            if (state.spectating) {
                scheduleTeamFinishFallback();
            }
        }

        function updateSpectateCamera() {
            if (!state.spectating) return;
            const alive = getAliveTeammates();
            if (!alive.length) return;
            if (!state.spectateTargetId || !alive.some(item => item.userId === state.spectateTargetId)) {
                state.spectateTargetId = alive[0].userId;
            }
            const target = alive.find(item => item.userId === state.spectateTargetId) || alive[0];
            camera.state.targetX = target.x;
            camera.state.targetY = target.y;
        }

        function enterSpectateMode(source) {
            if (state.spectating || state.runFinished) return;
            state.localDead = true;
            state.spectating = true;
            state.health = 0;
            player.disable?.();
            multiplayer?.updateLocalPresenceFields?.({ status: 'dead', hp: 0 });
            toast(`你已阵亡（${typeof source === 'string' ? source : source?.name || '怪物'}），正在观战队友...`);
            updateSpectateCamera();
            if (getAliveTeammates().length === 0) {
                broadcastTeamFinish(source);
            } else {
                checkTeamWipe();
            }
            pushHud(true);
        }

        function canControlPlayer() {
            return state.active && !state.spectating && state.health > 0;
        }

        function handleTeamStat(payload) {
            if (!isTeamMode() || !payload) return;
            const nextKills = payload.kills ?? 0;
            if (nextKills <= state.teamKills) return;
            state.teamKills = nextKills;
            const newLevel = skills?.getSurvivalLevelFromKills?.(state.teamKills) || 1;
            if (newLevel > state.level) {
                state.level = newLevel;
                toast(`升级！当前等级 Lv${state.level}，主动技能已强化`);
            }
            pushHud(true);
        }

        let skillCtrl = null;
        const sharedMonsterImages = {};

        function randomPoint() {
            return {
                x: randomBetween(bounds.minX + 30, bounds.maxX - 30),
                y: randomBetween(bounds.minY + 30, bounds.maxY - 30),
            };
        }

        function pickDropItem() {
            const drops = assets.getSurvivalDrops();
            return drops[Math.floor(Math.random() * drops.length)];
        }

        function targetDropCount() {
            return Math.max(80, Math.min(180, Math.floor((bounds.width * bounds.height) / 30000)));
        }

        function spawnDrop(point = randomPoint()) {
            const item = pickDropItem();
            state.drops.push({
                id: 'survival_drop_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
                itemId: item.id,
                x: point.x,
                y: point.y,
            });
        }

        function maintainDrops() {
            while (state.drops.length < targetDropCount()) spawnDrop();
        }

        function getElapsedSeconds() {
            if (isTeamMode() && state.teamStartedAtMs) {
                return Math.floor((Date.now() - state.teamStartedAtMs) / 1000);
            }
            if (!state.startedAt) return 0;
            return Math.floor((performance.now() - state.startedAt) / 1000);
        }

        function resolveTeamSeconds(payload = {}) {
            if (payload.finishedAtMs && payload.teamStartedAtMs) {
                return Math.max(0, Math.floor((payload.finishedAtMs - payload.teamStartedAtMs) / 1000));
            }
            if (payload.seconds != null) return payload.seconds;
            return getElapsedSeconds();
        }

        function scheduleTeamFinishFallback() {
            if (state.teamFinishFallbackTimer || state.runFinished || state.teamFinishSent) return;
            state.teamFinishFallbackTimer = setTimeout(() => {
                state.teamFinishFallbackTimer = null;
                if (state.runFinished || state.teamFinishSent) return;
                broadcastTeamFinish('全队阵亡', { force: true });
            }, 3000);
        }

        function broadcastTeamFinish(source, options = {}) {
            if (!isTeamMode() || state.runFinished) return;
            if (state.teamFinishSent && !options.force) return;
            state.teamFinishSent = true;
            if (state.teamFinishFallbackTimer) {
                clearTimeout(state.teamFinishFallbackTimer);
                state.teamFinishFallbackTimer = null;
            }
            const finishedAtMs = Date.now();
            const payload = {
                seconds: state.teamStartedAtMs
                    ? Math.max(0, Math.floor((finishedAtMs - state.teamStartedAtMs) / 1000))
                    : getElapsedSeconds(),
                kills: getKillCount(),
                reason: typeof source === 'string' ? source : source?.name || '全队阵亡',
                teamStartedAtMs: state.teamStartedAtMs,
                finishedAtMs,
            };
            if (!options.localOnly) {
                multiplayer?.broadcast?.('survival_team_finish', payload);
            }
            completeTeamRun(payload);
        }

        function completeTeamRun(payload) {
            if (!state.active || state.runFinished) return;
            state.runFinished = true;
            if (state.teamFinishFallbackTimer) {
                clearTimeout(state.teamFinishFallbackTimer);
                state.teamFinishFallbackTimer = null;
            }
            if (payload.teamStartedAtMs && !state.teamStartedAtMs) {
                state.teamStartedAtMs = payload.teamStartedAtMs;
            }
            const result = {
                seconds: resolveTeamSeconds(payload),
                kills: payload.kills ?? getKillCount(),
                medkitsUsed: state.medkitsUsed,
                reason: payload.reason || '全队阵亡',
                playMode,
            };
            onLeaveRoom?.('finished');
            stop();
            onFinish(result);
        }

        function handleTeamStart(payload) {
            if (!isTeamMode() || !payload?.teamStartedAtMs) return;
            state.teamStartedAtMs = payload.teamStartedAtMs;
        }

        function handleTeamFinish(payload) {
            if (!isTeamMode() || state.runFinished || !payload) return;
            state.teamFinishSent = true;
            if (state.teamFinishFallbackTimer) {
                clearTimeout(state.teamFinishFallbackTimer);
                state.teamFinishFallbackTimer = null;
            }
            completeTeamRun(payload);
        }

        function monsterScale() {
            const elapsed = getElapsedSeconds();
            const interval = modeConfig.evolutionInterval;
            return 1 + Math.min(5, elapsed / interval) * 0.4;
        }

        function targetMonsterCount() {
            const interval = modeConfig.evolutionInterval;
            return Math.min(
                modeConfig.maxMonsters,
                modeConfig.baseMonsters + Math.floor(getElapsedSeconds() / interval),
            );
        }

        function buildSharedMonsterRow() {
            const scale = monsterScale();
            const hp = Math.round(randomInt(10, 50) * scale);
            return {
                name: assets.npcNames[Math.floor(Math.random() * assets.npcNames.length)],
                ...randomPoint(),
                hp,
                max_hp: hp,
                attack: Math.round(randomInt(3, 10) * scale),
                attack_range: randomBetween(30, 50) * Math.min(2.5, scale),
                speed: randomEntityMoveStep(Math.min(1.5, scale)),
                attack_interval: randomInt(300, 800),
                image_index: Math.floor(Math.random() * assets.npcImages.length),
                last_attack_at: 0,
                stunned_until: 0,
                rooted_until: 0,
                provoke_until: 0,
                provoke_target_id: null,
            };
        }

        function getSharedMonsterImage(index) {
            const key = index % assets.npcImages.length;
            if (!sharedMonsterImages[key]) {
                const image = new Image();
                image.src = assets.npcImages[key];
                sharedMonsterImages[key] = image;
            }
            return sharedMonsterImages[key];
        }

        function mapSharedRowToMonster(row) {
            let monster = {
                id: row.id,
                sharedId: row.id,
                isSharedMonster: true,
                name: row.name,
                x: row.x,
                y: row.y,
                targetX: row.x,
                targetY: row.y,
                hp: row.hp,
                maxHp: row.max_hp,
                attack: row.attack,
                attackRange: row.attack_range,
                speed: row.speed,
                attackInterval: row.attack_interval,
                image: getSharedMonsterImage(row.image_index || 0),
                lastAttackAt: Number(row.last_attack_at) || 0,
                stunnedUntil: Number(row.stunned_until) || 0,
                rootedUntil: Number(row.rooted_until) || 0,
                provokeUntil: Number(row.provoke_until) || 0,
                provokeTargetId: row.provoke_target_id || null,
            };
            if (skillCtrl) monster = skillCtrl.modifySpawnedMonster(monster);
            return monster;
        }

        function applySharedMonsterRow(monster, row, options = {}) {
            if (!options.skipPosition) {
                monster.targetX = row.x;
                monster.targetY = row.y;
            }
            monster.hp = row.hp;
            monster.maxHp = row.max_hp;
            monster.lastAttackAt = Number(row.last_attack_at) || 0;
            monster.stunnedUntil = Number(row.stunned_until) || 0;
            monster.rootedUntil = Number(row.rooted_until) || 0;
            monster.provokeUntil = Number(row.provoke_until) || 0;
            monster.provokeTargetId = row.provoke_target_id || null;
        }

        function applySharedMonsterMotion(monster, data) {
            monster.targetX = data.x;
            monster.targetY = data.y;
            if (data.hp != null) monster.hp = data.hp;
            if (data.lastAttackAt != null) monster.lastAttackAt = data.lastAttackAt;
            if (data.stunnedUntil != null) monster.stunnedUntil = data.stunnedUntil;
            if (data.rootedUntil != null) monster.rootedUntil = data.rootedUntil;
        }

        function monsterSyncSnapshot(monster) {
            return [
                Math.round(Number(monster.x) * 2),
                Math.round(Number(monster.y) * 2),
                monster.hp,
                monster.lastAttackAt || 0,
                monster.stunnedUntil || 0,
                monster.rootedUntil || 0,
            ].join(':');
        }

        function syncMonstersFromSharedRows(rows) {
            const alive = (rows || []).filter(row => row.hp > 0);
            if (state.isRoomHost) {
                const rowById = new Map(alive.map(row => [row.id, row]));
                const aliveIds = new Set(alive.map(row => row.id));
                state.monsters.forEach(monster => {
                    const row = rowById.get(monster.sharedId);
                    if (row && row.hp < monster.hp) monster.hp = row.hp;
                });
                alive.forEach(row => {
                    if (!state.monsters.some(item => item.sharedId === row.id)) {
                        state.monsters.push(mapSharedRowToMonster(row));
                    }
                });
                state.monsters = state.monsters.filter(monster => aliveIds.has(monster.sharedId));
                return;
            }
            const existingById = new Map(state.monsters.map(monster => [monster.sharedId || monster.id, monster]));
            const skipPosition = state.monsterBroadcastMode && !state.isRoomHost;
            state.monsters = alive.map(row => {
                const prev = existingById.get(row.id);
                if (prev) {
                    applySharedMonsterRow(prev, row, { skipPosition });
                    return prev;
                }
                return mapSharedRowToMonster(row);
            });
        }

        function handleSharedMonsterBroadcast(payload) {
            if (!state.useSharedMonsters || state.isRoomHost || !payload?.npcs?.length) return;
            const byId = new Map(payload.npcs.map(item => [item.id, item]));
            state.monsters.forEach(monster => {
                const data = byId.get(monster.sharedId || monster.id);
                if (data) applySharedMonsterMotion(monster, data);
            });
        }

        function interpolateSharedMonsters(now) {
            if (!state.useSharedMonsters || state.isRoomHost) return;
            const frameDt = Math.min(50, now - (state.lastFrameAt || now));
            const lerp = Math.min(1, frameDt * 0.018);
            state.monsters.forEach(monster => {
                if (monster.targetX == null || monster.targetY == null) return;
                monster.x += (monster.targetX - monster.x) * lerp;
                monster.y += (monster.targetY - monster.y) * lerp;
            });
        }

        function syncRemotePlayers(remotes = []) {
            state.remotePlayers = (remotes || []).map(remote => {
                const hp = Number(remote.hp ?? 100);
                const isDead = remote.status === 'dead' || hp <= 0;
                return {
                    id: 'remote_' + remote.userId,
                    userId: remote.userId,
                    name: remote.nickname || '队友',
                    x: remote.x,
                    y: remote.y,
                    hp,
                    maxHp: remote.maxHp || 100,
                    isRemotePlayer: true,
                    isDead,
                    color: isDead ? '#64748b' : '#38bdf8',
                    skinItemId: remote.skinItemId || null,
                    image: assets.getSkinImageForItemId?.(remote.skinItemId),
                };
            });
            if (state.spectating) updateSpectateCamera();
            checkTeamWipe();
        }

        function handleNpcPlayerHit(payload) {
            if (!payload || payload.targetUserId !== userId) return;
            damagePlayer(payload.damage || 0, payload.npcName || '怪物');
        }

        function getChasePointForMonster(monster, playerPoint) {
            const clone = skillCtrl?.getActiveClone?.();
            if (clone) return { x: clone.x, y: clone.y };
            let nearest = null;
            let nearestDist = Infinity;
            if (!state.spectating && state.health > 0) {
                nearest = playerPoint;
                nearestDist = distance(monster, playerPoint);
            }
            state.remotePlayers.forEach(remote => {
                if (remote.isDead || remote.hp <= 0) return;
                const d = distance(monster, remote);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearest = { x: remote.x, y: remote.y };
                }
            });
            return nearest || playerPoint;
        }

        function spawnMonster() {
            const scale = monsterScale();
            const image = assets.getNpcImage(Math.floor(Math.random() * assets.npcImages.length));
            const hp = Math.round(randomInt(10, 50) * scale);
            const monster = {
                id: 'survival_monster_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
                name: assets.npcNames[Math.floor(Math.random() * assets.npcNames.length)],
                ...randomPoint(),
                hp,
                maxHp: hp,
                attack: Math.round(randomInt(3, 10) * scale),
                attackRange: randomBetween(15, 40) * Math.min(2.5, scale),
                speed: randomEntityMoveStep(Math.min(1.5, scale)),
                attackInterval: randomInt(300, 800),
                lastAttackAt: 0,
                image,
            };
            state.monsters.push(skillCtrl ? skillCtrl.modifySpawnedMonster(monster) : monster);
        }

        async function maintainMonsters() {
            if (state.useSharedMonsters) {
                const target = targetMonsterCount();
                const alive = state.monsters.filter(item => item.hp > 0).length;
                if (multiplayer?.ensureSharedNpcs && alive < target) {
                    await multiplayer.ensureSharedNpcs(roomId, buildSharedMonsterRow, target, {
                        isHost: state.isRoomHost,
                        allowSeedWhenEmpty: true,
                    });
                }
                if (multiplayer?.refreshSharedNpcs) {
                    await multiplayer.refreshSharedNpcs(roomId);
                }
                if (state.monsters.filter(item => item.hp > 0).length === 0) {
                    console.warn('[survival] shared monsters empty after ensure');
                    state.useSharedMonsters = false;
                    state.monsterBroadcastMode = false;
                    multiplayer?.stopSharedNpcs?.();
                    while (state.monsters.length < target) spawnMonster();
                }
                return;
            }
            while (state.monsters.length < targetMonsterCount()) spawnMonster();
        }

        function removeMonster(monster) {
            if (monster.isSharedMonster && multiplayer?.deleteSharedNpc) {
                const sharedId = monster.sharedId || monster.id;
                state.lastSyncedMonsters.delete(sharedId);
                multiplayer.deleteSharedNpc(sharedId);
                if (state.isRoomHost && multiplayer?.ensureSharedNpcs) {
                    multiplayer.ensureSharedNpcs(roomId, buildSharedMonsterRow, targetMonsterCount());
                }
            }
            state.monsters = state.monsters.filter(item => item.id !== monster.id);
            if (!state.useSharedMonsters) spawnMonster();
        }

        function registerMonsterKill() {
            if (isTeamMode()) {
                state.teamKills += 1;
                multiplayer?.broadcast?.('survival_team_stat', { kills: state.teamKills });
            } else {
                state.kills += 1;
            }
            skillCtrl?.onMonsterKilled?.();
            const newLevel = skills?.getSurvivalLevelFromKills?.(getKillCount()) || 1;
            if (newLevel > state.level) {
                state.level = newLevel;
                toast(`升级！当前等级 Lv${state.level}，主动技能已强化`);
            }
        }

        function initSkillController() {
            skillCtrl = skills?.createSkillController?.({
                activeSkillId,
                passiveSkillId,
                getPlayerPoint: () => ({ x: player.state.x, y: player.state.y }),
                getHealth: () => state.health,
                setHealth: value => { state.health = value; },
                getMaxHealth: () => 100,
                getMonsters: () => state.monsters,
                setMonsters: monsters => { state.monsters = monsters; },
                spawnMonster: () => maintainMonsters(),
                getAttack: () => getAttack(),
                getPlayerBaseMoveStep,
                getPlayerAppearance: () => ({
                    skinImage: player.state.skinImage,
                    skinColor: player.state.skinColor,
                    size: player.state.size,
                }),
                getPlayerEquipment: () => ({
                    attackRange: getAttackRange(),
                    speedBonus: (state.weapon?.speed || 0) + (state.speedItem?.speed || 0),
                }),
                getSkillLevel: () => state.level,
                toast,
                addEffect,
                onKill: () => registerMonsterKill(),
            }) || null;
        }

        async function start() {
            state.active = true;
            state.health = 100;
            state.level = 1;
            state.kills = 0;
            state.startedAt = performance.now();
            state.drops = [];
            state.monsters = [];
            state.effects = [];
            state.weapon = null;
            state.speedItem = null;
            state.medkitsUsed = 0;
            state.skillSpeedBonus = 0;
            state.lastSyncedMonsters.clear();
            state.lastFrameAt = 0;
            state.teamKills = 0;
            state.spectating = false;
            state.localDead = false;
            state.spectateTargetId = null;
            state.runFinished = false;
            state.teamStartedAtMs = null;
            state.teamFinishSent = false;
            if (state.teamFinishFallbackTimer) {
                clearTimeout(state.teamFinishFallbackTimer);
                state.teamFinishFallbackTimer = null;
            }
            initSkillController();

            const spawn = randomPoint();
            player.setPosition(spawn.x, spawn.y);
            camera.jumpToTarget?.();
            state.lastPlayerPos = { x: player.state.x, y: player.state.y };
            maintainDrops();

            state.useSharedMonsters = Boolean(roomId && multiplayer?.initSharedNpcs && playMode !== 'solo');
            if (state.useSharedMonsters) {
                try {
                    state.isRoomHost = await multiplayer.isRoomHost(roomId, userId);
                    const initResult = await multiplayer.initSharedNpcs({
                        roomId,
                        isHost: state.isRoomHost,
                        buildNpcRow: buildSharedMonsterRow,
                        onChange: rows => syncMonstersFromSharedRows(rows),
                        useBroadcast: true,
                        maxCount: targetMonsterCount(),
                    });
                    if (!initResult?.ok) {
                        state.useSharedMonsters = false;
                        await maintainMonsters();
                    } else {
                        state.monsterBroadcastMode = initResult.broadcast !== false;
                        await maintainMonsters();
                    }
                } catch (error) {
                    console.error('[survival] shared monster init failed:', error);
                    state.useSharedMonsters = false;
                    await maintainMonsters();
                }
            } else {
                await maintainMonsters();
            }

            if (isTeamMode() && roomId && multiplayer?.isRoomHost) {
                if (typeof state.isRoomHost !== 'boolean') {
                    state.isRoomHost = await multiplayer.isRoomHost(roomId, userId);
                }
                if (!state.teamStartedAtMs) {
                    state.teamStartedAtMs = Date.now();
                }
                if (state.isRoomHost) {
                    multiplayer?.broadcast?.('survival_team_start', {
                        teamStartedAtMs: state.teamStartedAtMs,
                    });
                }
            }

            pushHud(true);
        }

        function stop() {
            if (state.teamFinishFallbackTimer) {
                clearTimeout(state.teamFinishFallbackTimer);
                state.teamFinishFallbackTimer = null;
            }
            if (state.speedItem) player.state.speed -= state.speedItem.speed || 0;
            if (state.skillSpeedBonus) player.state.speed -= state.skillSpeedBonus;
            state.skillSpeedBonus = 0;
            state.active = false;
            skillCtrl = null;
        }

        function formatTime(seconds) {
            const min = Math.floor(seconds / 60).toString().padStart(2, '0');
            const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${min}:${sec}`;
        }

        function addEffect(effect) {
            state.effects.push(effect);
        }

        function damagePlayer(amount, source) {
            if (skillCtrl?.isPlayerInvincible?.()) return;
            const sourceMonster = typeof source === 'object' ? source : state.monsters.find(monster => monster.name === source);
            const finalAmount = skillCtrl ? skillCtrl.handleIncomingDamage(amount, sourceMonster) : amount;
            audio?.playNpcAttack?.();
            state.health = Math.max(0, state.health - finalAmount);
            addEffect({
                type: 'damage',
                x: player.state.x,
                y: player.state.y,
                text: `-${finalAmount}`,
                color: '#ef4444',
                createdAt: performance.now(),
                duration: 460,
            });
            if (state.health <= 0) {
                if (skillCtrl?.tryRevive?.()) {
                    pushHud(true);
                    return;
                }
                if (isTeamMode()) {
                    enterSpectateMode(typeof source === 'string' ? source : source?.name || '怪物');
                    return;
                }
                finish(typeof source === 'string' ? source : source?.name || '怪物');
            }
        }

        function finish(source) {
            if (!state.active || state.runFinished) return;
            state.runFinished = true;
            const result = {
                seconds: getElapsedSeconds(),
                kills: getKillCount(),
                medkitsUsed: state.medkitsUsed,
                reason: source || '怪物',
                playMode,
            };
            onLeaveRoom?.('finished');
            stop();
            onFinish(result);
        }

        function getAttack() {
            const skillBonus = skillCtrl ? skillCtrl.getDisplayAttackBonus() : 0;
            return BASE_ATTACK + (state.weapon?.attack || 0) + (state.speedItem?.attack || 0) + skillBonus;
        }

        function getStrikeDamage() {
            const skillBonus = skillCtrl ? skillCtrl.rollAttackBonus() : 0;
            return Math.max(1, BASE_ATTACK + (state.weapon?.attack || 0) + (state.speedItem?.attack || 0) + skillBonus);
        }

        function getAttackRange() {
            return BASE_RANGE + (state.weapon?.range || 0);
        }

        function getAttackSpeed() {
            const passiveBonus = skillCtrl ? skillCtrl.getPassiveAttackSpeedBonus() + skillCtrl.getTimedAttackSpeedBonus() : 0;
            return (state.weapon?.attackSpeed || 0) + (state.speedItem?.attackSpeed || 0) + passiveBonus;
        }

        function syncSkillSpeedBonus() {
            const bonus = skillCtrl ? skillCtrl.getPassiveSpeedBonus(state.health) + skillCtrl.getTimedSpeedBonus() : 0;
            if (bonus !== state.skillSpeedBonus) {
                player.state.speed += bonus - state.skillSpeedBonus;
                state.skillSpeedBonus = bonus;
            }
        }

        function getPlayerAttackInterval() {
            return assets.getAttackInterval(getAttackSpeed());
        }

        function equipWeapon(item) {
            if (state.weapon) {
                if (state.weapon.speed) player.state.speed -= state.weapon.speed;
                state.drops.push({
                    id: 'survival_drop_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
                    itemId: state.weapon.id,
                    x: player.state.x,
                    y: player.state.y,
                });
            }
            state.weapon = { ...item, durabilityLeft: item.durability || 10 };
            if (state.weapon.speed) player.state.speed += state.weapon.speed;
            toast(`装备武器：${item.name}`);
        }

        function equipSpeedItem(item) {
            if (state.speedItem) player.state.speed -= state.speedItem.speed || 0;
            state.speedItem = { ...item, moveLeft: item.moveDurability || 500 };
            player.state.speed += state.speedItem.speed || 0;
            toast(`装备移速道具：${item.name}`);
        }

        function pickupDrop(dropIndex) {
            const drop = state.drops[dropIndex];
            const item = assets.getItemById(drop.itemId);
            if (!item) return;
            if (item.type === 'medkit') {
                state.health = Math.min(100, state.health + (item.heal || 20));
                state.medkitsUsed += 1;
                toast('使用医疗包，生命+20');
            } else if (item.type === 'speed') {
                equipSpeedItem(item);
            } else {
                equipWeapon(item);
            }
            state.drops.splice(dropIndex, 1);
            maintainDrops();
        }

        function handleDoubleClick(worldPoint) {
            if (!canControlPlayer()) return false;
            const dropIndex = state.drops.findIndex(drop => distance(drop, worldPoint) < CLICK_TOLERANCE);
            if (dropIndex < 0) return false;
            const drop = state.drops[dropIndex];
            if (distance(drop, player.state) > PICK_RANGE) {
                toast('不在拾取范围内');
                return true;
            }
            pickupDrop(dropIndex);
            return true;
        }

        function moveToward(entity, target, speed, stopDistance = 5, deltaTime = 1 / 60) {
            const dx = target.x - entity.x;
            const dy = target.y - entity.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d <= stopDistance) return;
            const frameScale = deltaTime * 60;
            const step = Math.min(speed, d - stopDistance) * frameScale;
            entity.x += (dx / d) * step;
            entity.y += (dy / d) * step;
        }

        function updateSharedMonster(monster, playerPoint, now, deltaTime = 1 / 60) {
            if (monster.stunnedUntil && now < monster.stunnedUntil) return;
            if (monster.isAlly) return;

            const chasePoint = getChasePointForMonster(monster, playerPoint);

            if (monster.provokeUntil && now < monster.provokeUntil && monster.provokeTargetId) {
                const rival = state.monsters.find(item => item.id === monster.provokeTargetId);
                if (rival) {
                    moveToward(monster, rival, monster.speed, 3, deltaTime);
                    if (distance(monster, rival) <= monster.attackRange && now - monster.lastAttackAt > monster.attackInterval) {
                        monster.lastAttackAt = now;
                        rival.hp -= monster.attack;
                        if (rival.hp <= 0) removeMonster(rival);
                    }
                    return;
                }
            }

            if (!(monster.rootedUntil && now < monster.rootedUntil) && (skillCtrl?.getActiveClone?.() || !skillCtrl?.isPlayerInvisible?.())) {
                const moveSpeed = skillCtrl ? skillCtrl.getMonsterMoveSpeed(monster, playerPoint) : monster.speed;
                moveToward(monster, chasePoint, moveSpeed, 3, deltaTime);
            }

            const attackInterval = skillCtrl ? skillCtrl.getMonsterAttackInterval(monster, playerPoint) : monster.attackInterval;
            const clone = skillCtrl?.getActiveClone?.();
            if (clone) {
                if (distance(monster, clone) <= monster.attackRange && now - monster.lastAttackAt > attackInterval) {
                    monster.lastAttackAt = now;
                    addEffect({
                        type: 'strike',
                        from: { x: monster.x, y: monster.y },
                        to: { x: clone.x, y: clone.y },
                        color: '#fb7185',
                        createdAt: now,
                        duration: 260,
                    });
                    skillCtrl.damageClone(monster.attack, monster.name);
                    audio?.playNpcAttack?.();
                }
                return;
            }

            if (skillCtrl?.isPlayerInvisible?.()) return;

            const attackTargets = [];
            if (!state.spectating && state.health > 0) {
                attackTargets.push({ point: playerPoint, isLocal: true, userId, label: monster.name });
            }
            state.remotePlayers.filter(remote => !remote.isDead && remote.hp > 0).forEach(remote => {
                attackTargets.push({
                    point: { x: remote.x, y: remote.y },
                    isLocal: false,
                    userId: remote.userId,
                    label: monster.name,
                });
            });

            for (const target of attackTargets) {
                if (distance(monster, target.point) <= monster.attackRange && now - monster.lastAttackAt > attackInterval) {
                    monster.lastAttackAt = now;
                    addEffect({
                        type: 'strike',
                        from: { x: monster.x, y: monster.y },
                        to: target.point,
                        color: '#fb7185',
                        createdAt: now,
                        duration: 260,
                    });
                    if (target.isLocal) {
                        damagePlayer(monster.attack, monster);
                    } else {
                        multiplayer?.broadcast?.('npc_player_hit', {
                            targetUserId: target.userId,
                            damage: monster.attack,
                            npcName: monster.name,
                        });
                    }
                    break;
                }
            }
        }

        function updateLocalMonster(monster, playerPoint, now, deltaTime = 1 / 60) {
            if (monster.stunnedUntil && now < monster.stunnedUntil) return;
            if (monster.isAlly) return;

            const clone = skillCtrl?.getActiveClone?.();
            const chasePoint = clone ? { x: clone.x, y: clone.y } : playerPoint;

            if (monster.provokeUntil && now < monster.provokeUntil && monster.provokeTargetId) {
                const rival = state.monsters.find(item => item.id === monster.provokeTargetId);
                if (rival) {
                    moveToward(monster, rival, monster.speed, 3, deltaTime);
                    if (distance(monster, rival) <= monster.attackRange && now - monster.lastAttackAt > monster.attackInterval) {
                        monster.lastAttackAt = now;
                        rival.hp -= monster.attack;
                        if (rival.hp <= 0) {
                            if (rival.isAlly) removeMonster(rival);
                            else {
                                registerMonsterKill();
                                removeMonster(rival);
                            }
                        }
                    }
                    return;
                }
            }

            if (monster.rootedUntil && now < monster.rootedUntil) {
                // rooted
            } else if (clone || !skillCtrl?.isPlayerInvisible?.()) {
                const moveSpeed = skillCtrl ? skillCtrl.getMonsterMoveSpeed(monster, playerPoint) : monster.speed;
                moveToward(monster, chasePoint, moveSpeed, 3, deltaTime);
            }

            const attackInterval = skillCtrl ? skillCtrl.getMonsterAttackInterval(monster, playerPoint) : monster.attackInterval;
            if (clone) {
                if (distance(monster, clone) <= monster.attackRange && now - monster.lastAttackAt > attackInterval) {
                    monster.lastAttackAt = now;
                    addEffect({
                        type: 'strike',
                        from: { x: monster.x, y: monster.y },
                        to: { x: clone.x, y: clone.y },
                        color: '#fb7185',
                        createdAt: now,
                        duration: 260,
                    });
                    skillCtrl.damageClone(monster.attack, monster.name);
                    audio?.playNpcAttack?.();
                }
                return;
            }

            if (skillCtrl?.isPlayerInvisible?.()) return;

            if (distance(monster, playerPoint) <= monster.attackRange && now - monster.lastAttackAt > attackInterval) {
                monster.lastAttackAt = now;
                addEffect({
                    type: 'strike',
                    from: { x: monster.x, y: monster.y },
                    to: playerPoint,
                    color: '#fb7185',
                    createdAt: now,
                    duration: 260,
                });
                damagePlayer(monster.attack, monster);
            }
        }

        function updateSpeedDurability() {
            if (!state.speedItem || !state.lastPlayerPos) return;
            const moved = distance(player.state, state.lastPlayerPos);
            if (moved > 0.05) {
                state.speedItem.moveLeft -= moved;
                if (state.speedItem.moveLeft <= 0) {
                    toast(`${state.speedItem.name} 已失效`);
                    player.state.speed -= state.speedItem.speed || 0;
                    state.speedItem = null;
                }
            }
            state.lastPlayerPos = { x: player.state.x, y: player.state.y };
        }

        function update(deltaTime = 1 / 60) {
            if (!state.active) return;
            const now = performance.now();
            const playerPoint = { x: player.state.x, y: player.state.y };
            if (!state.spectating) {
                updateSpeedDurability();
            }
            syncSkillSpeedBonus();
            skillCtrl?.updateTimedEffects?.(now, deltaTime);
            maintainDrops();
            if (!state.useSharedMonsters) {
                maintainMonsters();
            } else if (state.isRoomHost && now - state.lastMonsterMaintain > 2000) {
                state.lastMonsterMaintain = now;
                maintainMonsters();
            }

            state.monsters.forEach(monster => {
                if (state.useSharedMonsters && state.isRoomHost) {
                    updateSharedMonster(monster, playerPoint, now, deltaTime);
                } else if (!state.useSharedMonsters) {
                    updateLocalMonster(monster, playerPoint, now, deltaTime);
                }
            });
            interpolateSharedMonsters(now);
            state.lastFrameAt = now;

            if (state.useSharedMonsters && now - state.lastHostCheck > 5000) {
                state.lastHostCheck = now;
                multiplayer?.isRoomHost?.(roomId, userId).then(isHost => {
                    if (isHost === state.isRoomHost) return;
                    state.isRoomHost = isHost;
                    if (isHost) maintainMonsters();
                });
            }

            if (state.useSharedMonsters && state.isRoomHost && state.monsterBroadcastMode && now - state.lastMonsterBroadcast > 120) {
                let moved = false;
                state.monsters.forEach(monster => {
                    const id = monster.sharedId || monster.id;
                    const snapshot = monsterSyncSnapshot(monster);
                    if (state.lastSyncedMonsters.get(id) === snapshot) return;
                    state.lastSyncedMonsters.set(id, snapshot);
                    moved = true;
                });
                if (moved) {
                    state.lastMonsterBroadcast = now;
                    multiplayer?.broadcastSharedNpcState?.(state.monsters.map(monster => ({
                        id: monster.sharedId || monster.id,
                        x: monster.x,
                        y: monster.y,
                        hp: monster.hp,
                        lastAttackAt: monster.lastAttackAt || 0,
                        stunnedUntil: monster.stunnedUntil || 0,
                        rootedUntil: monster.rootedUntil || 0,
                    })));
                }
            }

            state.effects = state.effects.filter(effect => now - effect.createdAt < effect.duration);
            if (state.spectating) updateSpectateCamera();
            pushHud(false);
        }

        function collectNearestItem() {
            if (!canControlPlayer()) return;
            const playerPoint = { x: player.state.x, y: player.state.y };
            const nearbyDrops = state.drops.filter(drop => distance(drop, playerPoint) <= PICK_RANGE);
            if (nearbyDrops.length === 0) {
                toast('附近没有可拾取的物品');
                return;
            }
            const nearestDrop = nearbyDrops.reduce((nearest, drop) =>
                distance(drop, playerPoint) < distance(nearest, playerPoint) ? drop : nearest
            );
            const dropIndex = state.drops.findIndex(drop => drop.id === nearestDrop.id);
            if (dropIndex >= 0) pickupDrop(dropIndex);
        }

        function attackNearest() {
            if (!canControlPlayer()) return;
            const now = performance.now();
            if (now - state.lastPlayerAttackAt < getPlayerAttackInterval()) return;
            const playerPoint = { x: player.state.x, y: player.state.y };
            const range = getAttackRange();
            const targets = skillCtrl
                ? skillCtrl.resolveAttackTargets(playerPoint, range)
                : [...state.monsters].sort((a, b) => distance(a, playerPoint) - distance(b, playerPoint)).slice(0, 1);
            if (!targets.length || distance(targets[0], playerPoint) > range) {
                toast('附近没有可攻击目标');
                return;
            }

            state.lastPlayerAttackAt = now;
            skillCtrl?.onPlayerAttackPerformed?.();
            skillCtrl?.consumeMultiTargetHit?.();
            audio?.playPlayerAttack?.();

            targets.forEach((target, index) => {
                let damage = getStrikeDamage();
                if (index === 0 && skillCtrl?.shouldInstantKill?.()) {
                    damage = target.hp;
                    target.hp = 0;
                } else {
                    target.hp -= damage;
                }

                addEffect({ type: 'strike', from: playerPoint, to: { x: target.x, y: target.y }, color: '#fde047', createdAt: now, duration: 240 });
                addEffect({ type: 'damage', x: target.x, y: target.y, text: `-${damage}`, color: '#fde047', createdAt: now, duration: 460 });
                skillCtrl?.applyLifesteal?.(damage);

                if (target.isSharedMonster && target.hp > 0) {
                    const sharedId = target.sharedId || target.id;
                    state.lastSyncedMonsters.delete(sharedId);
                    multiplayer?.updateSharedNpcHp?.(sharedId, target.hp);
                }

                if (target.hp <= 0) {
                    registerMonsterKill();
                    removeMonster(target);
                }
            });

            if (state.weapon) {
                state.weapon.durabilityLeft -= 1;
                if (state.weapon.durabilityLeft <= 0) {
                    toast(`${state.weapon.name} 已损坏`);
                    if (state.weapon.speed) player.state.speed -= state.weapon.speed;
                    state.weapon = null;
                }
            }
            pushHud(true);
        }

        function useActiveSkill() {
            if (!canControlPlayer() || !skillCtrl) return false;
            const ok = skillCtrl.useActiveSkill();
            if (ok) pushHud(true);
            return ok;
        }

        function pushHud(force = false) {
            const now = performance.now();
            if (!force && now - state.lastHudPush < 250) return;
            state.lastHudPush = now;
            onHud({
                health: state.health,
                level: state.level,
                kills: getKillCount(),
                timeText: formatTime(getElapsedSeconds()),
                weaponText: state.weapon ? `${state.weapon.name} ${state.weapon.durabilityLeft}` : '空手',
                speedText: state.speedItem ? `${state.speedItem.name} ${Math.ceil(state.speedItem.moveLeft)}` : '无',
                attackSpeed: getAttackSpeed(),
                attackInterval: getPlayerAttackInterval(),
                skillText: skillCtrl?.getHudText?.() || '',
                passiveSkillName: skillCtrl?.passiveSkill?.name || '无',
                modeLabel: modeConfig.label,
                spectating: state.spectating,
                teamMode: isTeamMode(),
            });
        }

        function getImage(src) {
            if (!imageCache[src]) {
                imageCache[src] = new Image();
                imageCache[src].src = src;
            }
            return imageCache[src];
        }

        function drawDrop(ctx, cameraRef, drop, viewport) {
            const item = assets.getItemById(drop.itemId);
            if (!item) return;
            if (viewport && !isWorldPointInViewport(drop.x, drop.y, viewport, 32)) return;
            const point = cameraRef.worldToScreen(drop.x, drop.y);
            const size = Math.max(16, 16 * cameraRef.state.zoom);
            ctx.save();
            ctx.translate(point.x - size / 2, point.y - size / 2);
            assets.drawPixelIcon(ctx, item, 0, 0, size);
            ctx.restore();
        }

        function drawHealthBar(ctx, x, y, width, height, current, max, color = '#22c55e') {
            const ratio = Math.max(0, Math.min(1, current / Math.max(1, max)));
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(x - width / 2, y, width, height);
            ctx.fillStyle = ratio > 0.5 ? color : ratio > 0.25 ? '#facc15' : '#ef4444';
            ctx.fillRect(x - width / 2 + 1, y + 1, (width - 2) * ratio, height - 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - width / 2, y, width, height);
            ctx.restore();
        }

        function drawTeammate(ctx, cameraRef, entity) {
            const point = cameraRef.worldToScreen(entity.x, entity.y);
            const size = Math.max(12, player.state.size * cameraRef.state.zoom);
            ctx.save();
            ctx.globalAlpha = entity.isDead ? 0.55 : 1;
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(point.x - size / 2 + 3, point.y - size / 2 + 3, size, size);
            if (entity.image && entity.image.complete && entity.image.naturalWidth > 0) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(entity.image, point.x - size / 2, point.y - size / 2, size, size);
                ctx.strokeStyle = entity.isDead ? '#94a3b8' : '#7dd3fc';
                ctx.lineWidth = Math.max(1, 2 * cameraRef.state.zoom);
                ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
            } else {
                ctx.fillStyle = entity.color || '#38bdf8';
                ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
            }
            ctx.fillStyle = entity.isDead ? '#fca5a5' : '#fff3c4';
            ctx.font = '12px Microsoft YaHei, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(entity.isDead ? `${entity.name}（阵亡）` : entity.name, point.x, point.y - size / 2 - 6);
            if (!entity.isDead) {
                drawHealthBar(ctx, point.x, point.y - size / 2 - 20, Math.max(24, size * 1.25), 5, entity.hp, entity.maxHp || entity.hp);
            }
            ctx.restore();
        }

        function drawMonster(ctx, cameraRef, monster) {
            const point = cameraRef.worldToScreen(monster.x, monster.y);
            const size = Math.max(12, player.state.size * cameraRef.state.zoom);
            ctx.save();
            const image = monster.image || getImage(assets.npcImages[0]);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(point.x - size / 2 + 3, point.y - size / 2 + 3, size, size);
            if (image.complete && image.naturalWidth > 0) {
                ctx.imageSmoothingEnabled = false;
                if (monster.isAlly) ctx.filter = 'hue-rotate(90deg)';
                ctx.drawImage(image, point.x - size / 2, point.y - size / 2, size, size);
                ctx.filter = 'none';
            } else {
                ctx.fillStyle = monster.isAlly ? '#22c55e' : '#64748b';
                ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
            }
            ctx.fillStyle = '#fff3c4';
            ctx.font = '12px Microsoft YaHei, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${monster.isAlly ? '[友]' : ''}${monster.name} ${monster.hp}`, point.x, point.y - size / 2 - 6);
            drawHealthBar(ctx, point.x, point.y - size / 2 - 20, Math.max(24, size * 1.25), 5, monster.hp, monster.maxHp || monster.hp);
            ctx.restore();
        }

        function drawClone(ctx, cameraRef, clone) {
            skillCtrl?.drawClone?.(ctx, cameraRef, clone, drawHealthBar);
        }

        function drawPlayerHealth(ctx, cameraRef) {
            const point = cameraRef.worldToScreen(player.state.x, player.state.y);
            const size = player.state.size * cameraRef.state.zoom;
            drawHealthBar(ctx, point.x, point.y - size / 2 - 16, Math.max(28, size * 1.4), 5, state.health, 100, '#22c55e');
        }

        function drawEffects(ctx, cameraRef) {
            const now = performance.now();
            state.effects.forEach(effect => {
                const progress = Math.min(1, (now - effect.createdAt) / effect.duration);
                ctx.save();
                ctx.globalAlpha = 1 - progress;
                if (effect.type === 'strike') {
                    const from = cameraRef.worldToScreen(effect.from.x, effect.from.y);
                    const to = cameraRef.worldToScreen(effect.to.x, effect.to.y);
                    ctx.strokeStyle = effect.color;
                    ctx.lineWidth = Math.max(2, 4 * cameraRef.state.zoom);
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.stroke();
                } else {
                    const point = cameraRef.worldToScreen(effect.x, effect.y - progress * 12);
                    ctx.fillStyle = effect.color;
                    ctx.font = 'bold 14px Microsoft YaHei, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(effect.text, point.x, point.y);
                }
                ctx.restore();
            });
        }

        function drawAttackRange(ctx, cameraRef) {
            const range = getAttackRange();
            const point = cameraRef.worldToScreen(player.state.x, player.state.y);
            const radius = range * cameraRef.state.zoom;
            ctx.save();
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
            ctx.lineWidth = Math.max(1.5, 2 * cameraRef.state.zoom);
            ctx.setLineDash([7, 5]);
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        function render(ctx, cameraRef = camera) {
            if (!state.active) return;
            const viewport = getWorldViewport(cameraRef, 100);
            const entityRadius = Math.max(48, player.state.size * 1.5);

            state.drops.forEach(drop => drawDrop(ctx, cameraRef, drop, viewport));
            drawAttackRange(ctx, cameraRef);
            state.monsters.forEach(monster => {
                if (isWorldPointInViewport(monster.x, monster.y, viewport, entityRadius)) {
                    drawMonster(ctx, cameraRef, monster);
                }
            });
            state.remotePlayers.forEach(remote => {
                if (isWorldPointInViewport(remote.x, remote.y, viewport, entityRadius)) {
                    drawTeammate(ctx, cameraRef, remote);
                }
            });
            const clone = skillCtrl?.getActiveClone?.() || skillCtrl?.state?.clone;
            if (clone && isWorldPointInViewport(clone.x, clone.y, viewport, entityRadius)) {
                drawClone(ctx, cameraRef, clone);
            }
            drawPlayerHealth(ctx, cameraRef);
            drawEffects(ctx, cameraRef);
        }

        return {
            state,
            start,
            stop,
            update,
            render,
            handleDoubleClick,
            attackNearest,
            useActiveSkill,
            collectNearestItem,
            fail: () => finish('主动退出'),
            syncRemotePlayers,
            handleNpcPlayerHit,
            handleSharedNpcBroadcast: handleSharedMonsterBroadcast,
            handleTeamStat,
            handleTeamStart,
            handleTeamFinish,
            canControlPlayer,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        survival: {
            createSurvival,
            SURVIVAL_MODE_CONFIG,
        },
    };
})(window);
