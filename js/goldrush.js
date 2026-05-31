(function(global) {
    const { assets } = global.NCUTMap;

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function randomInt(min, max) {
        return Math.floor(randomBetween(min, max + 1));
    }

    const PLAYER_BASE_SPEED = 0.01;

    function getPlayerBaseMoveStep() {
        return PLAYER_BASE_SPEED * 30;
    }

    function randomEntityMoveStep() {
        return randomBetween(0.9, 1.1) * getPlayerBaseMoveStep();
    }

    function pickWeightedGem() {
        const total = assets.gems.reduce((sum, gem) => sum + gem.weight, 0);
        let roll = Math.random() * total;
        for (const gem of assets.gems) {
            roll -= gem.weight;
            if (roll <= 0) return gem;
        }
        return assets.gems[assets.gems.length - 1];
    }

    function createGoldRush(options) {
        const {
            player,
            camera,
            bounds,
            buildings,
            carriedItems = [],
            activeSkillId,
            passiveSkillId,
            backpackCapacity = 50,
            baseBackpackUsage = 0,
            onHud,
            onFinish,
            toast,
            roomId = null,
            userId = null,
            multiplayer = null,
            onLeaveRoom = null,
        } = options;
        const { skills } = global.NCUTMap;
        const COLLECT_RANGE = 8;
        const CLICK_PICK_TOLERANCE = 14;
        const MAX_HOSTILES = 5;
        const carriedWeaponId = carriedItems.find(id => {
            const type = assets.getItemById(id)?.type;
            return type === 'weapon' || type === 'tool';
        }) || null;
        const carriedSpeedId = carriedItems.find(id => assets.getItemById(id)?.type === 'speed') || null;
        const carriedItemIds = [carriedWeaponId, carriedSpeedId].filter(Boolean);
        const state = {
            active: false,
            health: 100,
            baseAttack: 10,
            baseAttackRange: 40,
            weapon: null,
            speedItem: null,
            lastPlayerPos: null,
            skillSpeedBonus: 0,
            carriedItems: carriedItemIds,
            lootedItems: [],
            treasures: [],
            droppedItems: [],
            collectible: null,
            npcs: [],
            remotePlayers: [],
            effects: [],
            extractStart: null,
            extractGate: null,
            extractReady: false,
            startedAt: 0,
            killCount: 0,
            playerKillCount: 0,
            lastPlayerAttackAt: 0,
            lastNpcDbSync: 0,
            lastHostCheck: 0,
            lastFrameAt: 0,
            lastHudPush: 0,
            lastHudSnapshot: '',
            lastMaintainCheck: 0,
            lastNpcBroadcast: 0,
            lastSyncedNpcs: new Map(),
            npcBroadcastMode: false,
            isRoomHost: false,
            useSharedNpcs: false,
            roomId,
        };

        let skillCtrl = null;

        function isEquippableItem(item) {
            return item && ['weapon', 'tool', 'speed'].includes(item.type);
        }

        function equipWeapon(item) {
            if (state.weapon?.speed) player.state.speed -= state.weapon.speed;
            state.weapon = { ...item, durabilityLeft: item.durability || 10 };
            if (state.weapon.speed) player.state.speed += state.weapon.speed;
        }

        function equipSpeedItem(item) {
            if (state.speedItem) player.state.speed -= state.speedItem.speed || 0;
            state.speedItem = { ...item, moveLeft: item.moveDurability || 500 };
            player.state.speed += state.speedItem.speed || 0;
        }

        function tryEquipFromDrop(itemId) {
            const item = assets.getItemById(itemId);
            if (!isEquippableItem(item)) return false;
            if (item.type === 'speed') {
                if (state.speedItem) return false;
                equipSpeedItem(item);
                toast(`装备：${item.name}`);
                return true;
            }
            if (state.weapon) return false;
            equipWeapon(item);
            toast(`装备：${item.name}`);
            return true;
        }

        function getEquipmentAttack() {
            return (state.weapon?.attack || 0) + (state.speedItem?.attack || 0);
        }

        function getEquipmentRange() {
            return state.weapon?.range || 0;
        }

        function getEquipmentAttackSpeed() {
            return (state.weapon?.attackSpeed || 0) + (state.speedItem?.attackSpeed || 0);
        }

        function getEquipmentSpeedBonus() {
            return (state.weapon?.speed || 0) + (state.speedItem?.speed || 0);
        }

        function getDisplayAttackBonus() {
            return skillCtrl ? skillCtrl.getDisplayAttackBonus() : 0;
        }

        function getStrikeDamage() {
            const skillBonus = skillCtrl ? skillCtrl.rollAttackBonus() : 0;
            return Math.max(1, state.baseAttack + getEquipmentAttack() + skillBonus);
        }

        function getAttackRange() {
            return state.baseAttackRange + getEquipmentRange();
        }

        function getAttackSpeed() {
            const skillBonus = skillCtrl
                ? skillCtrl.getPassiveAttackSpeedBonus() + skillCtrl.getTimedAttackSpeedBonus()
                : 0;
            return getEquipmentAttackSpeed() + skillBonus;
        }

        function getPlayerAttackInterval() {
            return assets.getAttackInterval(getAttackSpeed());
        }

        function syncSkillSpeedBonus() {
            const bonus = skillCtrl ? skillCtrl.getPassiveSpeedBonus(state.health) + skillCtrl.getTimedSpeedBonus() : 0;
            if (bonus !== state.skillSpeedBonus) {
                player.state.speed += bonus - state.skillSpeedBonus;
                state.skillSpeedBonus = bonus;
            }
        }

        function getCombatTargets() {
            return [
                ...state.npcs,
                ...state.remotePlayers.filter(playerEntity => playerEntity.hp > 0),
            ];
        }

        function syncRemotePlayers(remotes = []) {
            state.remotePlayers = remotes
                .filter(remote => remote.status !== 'dead' && remote.status !== 'extracted')
                .map(remote => ({
                    id: 'remote_' + remote.userId,
                    userId: remote.userId,
                    name: remote.nickname || '摸金客',
                    x: remote.x,
                    y: remote.y,
                    hp: remote.hp ?? 100,
                    maxHp: remote.maxHp || 100,
                    attack: 10,
                    attackRange: 30,
                    speed: 0,
                    isRemotePlayer: true,
                    color: '#ef4444',
                    skinItemId: remote.skinItemId || null,
                    image: assets.getSkinImageForItemId?.(remote.skinItemId),
                }));
        }

        function handlePvpHit(payload) {
            if (!payload) return;
            if (payload.targetId === userId) {
                if (payload.targetHp != null) {
                    state.health = Math.max(0, payload.targetHp);
                } else {
                    state.health = Math.max(0, state.health - (payload.damage || 0));
                }
                addEffect({
                    type: 'damage',
                    x: player.state.x,
                    y: player.state.y,
                    text: `-${payload.damage || 0}`,
                    color: '#ef4444',
                    createdAt: performance.now(),
                    duration: 420,
                });
                if (state.health <= 0) {
                    fail('被其他摸金客击败，撤离失败');
                }
                return;
            }
            const remote = state.remotePlayers.find(item => item.userId === payload.targetId);
            if (!remote) return;
            if (payload.targetHp != null) remote.hp = payload.targetHp;
            if (remote.hp <= 0 || payload.defeated) {
                state.remotePlayers = state.remotePlayers.filter(item => item.userId !== payload.targetId);
            }
        }

        function broadcastPlayerDefeat(targetUserId) {
            multiplayer?.broadcast?.('pvp_hit', {
                targetId: targetUserId,
                damage: 0,
                targetHp: 0,
                defeated: true,
            });
        }

        function killCombatTarget(target) {
            if (target.isRemotePlayer) {
                state.playerKillCount += 1;
                state.killCount += 1;
                broadcastPlayerDefeat(target.userId);
                state.remotePlayers = state.remotePlayers.filter(item => item.userId !== target.userId);
                toast(`${target.name} 被击败`);
                return;
            }
            state.killCount += 1;
            skillCtrl?.onMonsterKilled?.();
            if (target.isSharedNpc && multiplayer?.deleteSharedNpc) {
                const sharedId = target.sharedId || target.id;
                state.lastSyncedNpcs.delete(sharedId);
                multiplayer.deleteSharedNpc(sharedId);
                if (state.isRoomHost && multiplayer?.ensureSharedNpcs) {
                    multiplayer.ensureSharedNpcs(roomId, buildSharedNpcRow);
                }
            }
            if (Math.random() < 0.28) {
                spawnEquipmentDrop({ x: target.x, y: target.y });
            } else if (Math.random() < 0.5) {
                state.droppedItems.push({ itemId: pickWeightedGem().id, x: target.x, y: target.y });
            }
            state.npcs = state.npcs.filter(npc => npc.id !== target.id);
            if (!state.useSharedNpcs) maintainHostiles();
        }

        function buildSharedNpcRow() {
            const point = teachingSpawnPoint();
            const hp = randomInt(10, 50);
            return {
                name: assets.npcNames[Math.floor(Math.random() * assets.npcNames.length)],
                x: point.x,
                y: point.y,
                hp,
                max_hp: hp,
                attack: randomInt(3, 10),
                attack_range: randomBetween(10, 20),
                speed: randomEntityMoveStep(),
                attack_interval: randomInt(400, 900),
                image_index: Math.floor(Math.random() * assets.npcImages.length),
                last_attack_at: 0,
                stunned_until: 0,
                rooted_until: 0,
                provoke_until: 0,
                provoke_target_id: null,
            };
        }

        const sharedNpcImages = {};

        function getSharedNpcImage(index) {
            const key = index % assets.npcImages.length;
            if (!sharedNpcImages[key]) {
                const image = new Image();
                image.src = assets.npcImages[key];
                sharedNpcImages[key] = image;
            }
            return sharedNpcImages[key];
        }

        function mapSharedRowToNpc(row) {
            let npc = {
                id: row.id,
                sharedId: row.id,
                isSharedNpc: true,
                name: row.name,
                x: row.x,
                y: row.y,
                targetX: row.x,
                targetY: row.y,
                hp: row.hp,
                maxHp: row.max_hp,
                attack: row.attack ?? randomInt(3, 10),
                attackRange: row.attack_range,
                speed: row.speed,
                attackInterval: row.attack_interval,
                image: getSharedNpcImage(row.image_index || 0),
                lastAttackAt: Number(row.last_attack_at) || 0,
                stunnedUntil: Number(row.stunned_until) || 0,
                rootedUntil: Number(row.rooted_until) || 0,
                provokeUntil: Number(row.provoke_until) || 0,
                provokeTargetId: row.provoke_target_id || null,
            };
            if (skillCtrl) npc = skillCtrl.modifySpawnedMonster(npc);
            return npc;
        }

        function applySharedNpcRow(npc, row, options = {}) {
            if (!options.skipPosition) {
                npc.targetX = row.x;
                npc.targetY = row.y;
            }
            npc.hp = row.hp;
            npc.maxHp = row.max_hp;
            npc.lastAttackAt = Number(row.last_attack_at) || 0;
            npc.stunnedUntil = Number(row.stunned_until) || 0;
            npc.rootedUntil = Number(row.rooted_until) || 0;
            npc.provokeUntil = Number(row.provoke_until) || 0;
            npc.provokeTargetId = row.provoke_target_id || null;
        }

        function applySharedNpcMotion(npc, data) {
            npc.targetX = data.x;
            npc.targetY = data.y;
            if (data.hp != null) npc.hp = data.hp;
            if (data.lastAttackAt != null) npc.lastAttackAt = data.lastAttackAt;
            if (data.stunnedUntil != null) npc.stunnedUntil = data.stunnedUntil;
            if (data.rootedUntil != null) npc.rootedUntil = data.rootedUntil;
        }

        function npcSyncSnapshot(npc) {
            return [
                Math.round(Number(npc.x) * 2),
                Math.round(Number(npc.y) * 2),
                npc.hp,
                npc.lastAttackAt || 0,
                npc.stunnedUntil || 0,
                npc.rootedUntil || 0,
                npc.provokeUntil || 0,
                npc.provokeTargetId || '',
            ].join(':');
        }

        function syncNpcsFromSharedRows(rows) {
            const alive = (rows || []).filter(row => row.hp > 0);
            if (state.isRoomHost) {
                const rowById = new Map(alive.map(row => [row.id, row]));
                const aliveIds = new Set(alive.map(row => row.id));
                state.npcs.forEach(npc => {
                    const row = rowById.get(npc.sharedId);
                    if (row && row.hp < npc.hp) npc.hp = row.hp;
                });
                alive.forEach(row => {
                    if (!state.npcs.some(npc => npc.sharedId === row.id)) {
                        state.npcs.push(mapSharedRowToNpc(row));
                    }
                });
                state.npcs = state.npcs.filter(npc => aliveIds.has(npc.sharedId));
                return;
            }
            const existingById = new Map(state.npcs.map(npc => [npc.sharedId || npc.id, npc]));
            const skipPosition = state.npcBroadcastMode && !state.isRoomHost;
            state.npcs = alive.map(row => {
                const prev = existingById.get(row.id);
                if (prev) {
                    applySharedNpcRow(prev, row, { skipPosition });
                    return prev;
                }
                return mapSharedRowToNpc(row);
            });
        }

        function handleSharedNpcBroadcast(payload) {
            if (!state.useSharedNpcs || state.isRoomHost || !payload?.npcs?.length) return;
            const byId = new Map(payload.npcs.map(item => [item.id, item]));
            state.npcs.forEach(npc => {
                const data = byId.get(npc.sharedId || npc.id);
                if (data) applySharedNpcMotion(npc, data);
            });
        }

        function interpolateSharedNpcs(now) {
            if (!state.useSharedNpcs || state.isRoomHost) return;
            const frameDt = Math.min(50, now - (state.lastFrameAt || now));
            const lerp = Math.min(1, frameDt * 0.018);
            state.npcs.forEach(npc => {
                if (npc.targetX == null || npc.targetY == null) return;
                npc.x += (npc.targetX - npc.x) * lerp;
                npc.y += (npc.targetY - npc.y) * lerp;
            });
        }

        function handleNpcPlayerHit(payload) {
            if (!payload || payload.targetUserId !== userId) return;
            damagePlayer(payload.damage || 0, payload.npcName || 'NPC');
        }

        function initSkillController() {
            skillCtrl = skills?.createSkillController?.({
                activeSkillId,
                passiveSkillId,
                getPlayerPoint: () => ({ x: player.state.x, y: player.state.y }),
                getHealth: () => state.health,
                setHealth: value => { state.health = value; },
                getMaxHealth: () => 100,
                getMonsters: getCombatTargets,
                setMonsters: monsters => {
                    const ids = new Set(monsters.map(monster => monster.id));
                    state.npcs = state.npcs.filter(npc => ids.has(npc.id));
                    state.remotePlayers = state.remotePlayers.filter(playerEntity => ids.has(playerEntity.id));
                },
                spawnMonster: () => maintainHostiles(),
                getAttack: () => getStrikeDamage(),
                getPlayerBaseMoveStep,
                getPlayerAppearance: () => ({
                    skinImage: player.state.skinImage,
                    skinColor: player.state.skinColor,
                    size: player.state.size,
                }),
                getPlayerEquipment: () => ({
                    attackRange: getAttackRange(),
                    speedBonus: getEquipmentSpeedBonus(),
                }),
                toast,
                addEffect,
                onKill: killCombatTarget,
            }) || null;
        }

        function randomPoint() {
            return {
                x: randomBetween(bounds.minX + 20, bounds.maxX - 20),
                y: randomBetween(bounds.minY + 20, bounds.maxY - 20),
            };
        }

        function getGate(name) {
            const building = buildings.find(item => item.name === name);
            if (!building) return { x: bounds.centerX, y: bounds.centerY, name };
            const [x, y, w, h] = building.rects[0];
            return { x: x + w / 2, y: y + h / 2, name };
        }

        const gateNorth = getGate('北门');
        const gateSouth = getGate('南门');

        function getGates() {
            return [gateNorth, gateSouth];
        }

        function randomEdgeSpawnPoint() {
            const gates = getGates();
            const margin = 80;
            const edgeBand = 120;
            for (let i = 0; i < 80; i++) {
                const side = Math.floor(Math.random() * 4);
                const point = side === 0
                    ? { x: randomBetween(bounds.minX + margin, bounds.maxX - margin), y: randomBetween(bounds.minY + margin, bounds.minY + edgeBand) }
                    : side === 1
                        ? { x: randomBetween(bounds.minX + margin, bounds.maxX - margin), y: randomBetween(bounds.maxY - edgeBand, bounds.maxY - margin) }
                        : side === 2
                            ? { x: randomBetween(bounds.minX + margin, bounds.minX + edgeBand), y: randomBetween(bounds.minY + margin, bounds.maxY - margin) }
                            : { x: randomBetween(bounds.maxX - edgeBand, bounds.maxX - margin), y: randomBetween(bounds.minY + margin, bounds.maxY - margin) };
                if (gates.every(gate => distance(point, gate) > 260)) return point;
            }
            return randomPoint();
        }

        function spawnTreasure() {
            const gem = pickWeightedGem();
            state.treasures.push({
                id: 'treasure_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
                itemId: gem.id,
                color: gem.color,
                ...randomPoint(),
            });
        }

        function spawnCollectible() {
            const item = assets.getCollectibleDrop();
            state.collectible = {
                id: 'collectible_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
                itemId: item.id,
                ...randomPoint(),
            };
        }

        function maintainCollectible() {
            if (!state.collectible) spawnCollectible();
        }

        function targetTreasureCount() {
            return Math.max(38, Math.floor((bounds.width * bounds.height) / 42000));
        }

        function maintainTreasures() {
            while (state.treasures.length < targetTreasureCount()) {
                spawnTreasure();
            }
        }

        function pickEquipmentDrop() {
            const drops = assets.getEquipmentDrops();
            return drops[Math.floor(Math.random() * drops.length)];
        }

        function targetEquipmentDropCount() {
            return Math.max(2, Math.min(5, Math.floor((bounds.width * bounds.height) / 1800000)));
        }

        function spawnEquipmentDrop(point = randomPoint()) {
            const item = pickEquipmentDrop();
            state.droppedItems.push({
                id: 'drop_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
                itemId: item.id,
                itemType: item.type,
                x: point.x,
                y: point.y,
            });
        }

        function maintainEquipmentDrops() {
            let equipmentCount = 0;
            for (const drop of state.droppedItems) {
                if (drop.itemType !== 'gem') equipmentCount += 1;
            }
            while (equipmentCount < targetEquipmentDropCount()) {
                spawnEquipmentDrop();
                equipmentCount += 1;
            }
        }

        function teachingSpawnPoint() {
            const teaching = buildings.filter(building => building.type === 'teaching');
            const building = teaching[Math.floor(Math.random() * teaching.length)] || buildings[0];
            const rect = building.rects[Math.floor(Math.random() * building.rects.length)];
            return {
                x: randomBetween(rect[0], rect[0] + rect[2]),
                y: randomBetween(rect[1], rect[1] + rect[3]),
            };
        }

        function getAliveHostileCount() {
            return state.npcs.filter(npc => !npc.isAlly && npc.hp > 0).length;
        }

        function spawnNpc() {
            if (getAliveHostileCount() >= MAX_HOSTILES) return;
            const point = teachingSpawnPoint();
            const name = assets.npcNames[Math.floor(Math.random() * assets.npcNames.length)];
            const image = assets.getNpcImage(Math.floor(Math.random() * assets.npcImages.length));
            const hp = randomInt(10, 50);
            state.npcs.push(skillCtrl ? skillCtrl.modifySpawnedMonster({
                id: 'npc_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
                name,
                x: point.x,
                y: point.y,
                hp,
                maxHp: hp,
                attack: randomInt(3, 10),
                attackRange: randomBetween(10, 20),
                speed: randomEntityMoveStep(),
                attackInterval: randomInt(400, 900),
                lastAttackAt: 0,
                image,
            }) : {
                id: 'npc_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
                name,
                x: point.x,
                y: point.y,
                hp,
                maxHp: hp,
                attack: randomInt(3, 10),
                attackRange: randomBetween(10, 20),
                speed: randomEntityMoveStep(),
                attackInterval: randomInt(400, 900),
                lastAttackAt: 0,
                image,
            });
        }

        function maintainHostiles() {
            if (state.useSharedNpcs) {
                if (state.isRoomHost && multiplayer?.ensureSharedNpcs) {
                    multiplayer.ensureSharedNpcs(roomId, buildSharedNpcRow);
                }
                return;
            }
            while (getAliveHostileCount() < MAX_HOSTILES) {
                spawnNpc();
            }
        }

        async function start() {
            state.active = true;
            state.health = 100;
            state.startedAt = performance.now();
            state.killCount = 0;
            state.skillSpeedBonus = 0;
            state.weapon = null;
            state.speedItem = null;
            state.lastPlayerPos = null;
            state.treasures = [];
            state.npcs = [];
            state.lastSyncedNpcs.clear();
            state.lastFrameAt = 0;
            state.droppedItems = [];
            state.collectible = null;
            state.lootedItems = [];
            state.effects = [];
            state.extractStart = null;
            state.extractGate = null;
            state.extractReady = false;
            initSkillController();

            const spawn = randomEdgeSpawnPoint();
            player.setPosition(spawn.x, spawn.y);
            camera.jumpToTarget();
            state.lastPlayerPos = { x: player.state.x, y: player.state.y };

            if (carriedWeaponId) {
                const item = assets.getItemById(carriedWeaponId);
                if (item) equipWeapon(item);
            }
            if (carriedSpeedId) {
                const item = assets.getItemById(carriedSpeedId);
                if (item) equipSpeedItem(item);
            }
            maintainTreasures();
            maintainCollectible();
            maintainEquipmentDrops();

            state.useSharedNpcs = Boolean(roomId && multiplayer?.initSharedNpcs);
            if (state.useSharedNpcs) {
                try {
                    state.isRoomHost = await multiplayer.isRoomHost(roomId, userId);
                    const npcResult = await multiplayer.initSharedNpcs({
                        roomId,
                        isHost: state.isRoomHost,
                        buildNpcRow: buildSharedNpcRow,
                        onChange: rows => syncNpcsFromSharedRows(rows),
                        useBroadcast: true,
                    });
                    if (!npcResult?.ok) {
                        state.useSharedNpcs = false;
                        state.npcBroadcastMode = false;
                        maintainHostiles();
                    } else {
                        state.npcBroadcastMode = npcResult.broadcast !== false;
                    }
                } catch (error) {
                    console.error('[goldrush] shared npc init failed:', error);
                    state.useSharedNpcs = false;
                    maintainHostiles();
                }
            } else {
                maintainHostiles();
            }
            pushHud(true);
        }

        function stop() {
            state.active = false;
            if (state.weapon?.speed) player.state.speed -= state.weapon.speed;
            if (state.speedItem) player.state.speed -= state.speedItem.speed || 0;
            if (state.skillSpeedBonus) player.state.speed -= state.skillSpeedBonus;
            state.weapon = null;
            state.speedItem = null;
            state.skillSpeedBonus = 0;
            skillCtrl = null;
        }

        function fail(reason) {
            if (!state.active) return;
            onLeaveRoom?.('dead');
            stop();
            toast(reason || '撤离失败，本局收益清空');
            onFinish({
                status: 'failed',
                carriedItems: state.carriedItems,
                lootedItems: state.lootedItems,
                durationSeconds: getDurationSeconds(),
                health: state.health,
                killCount: state.killCount,
            });
        }

        function success() {
            if (!state.active) return;
            onLeaveRoom?.('extracted');
            stop();
            toast('撤离成功，宝物已带回大厅');
            onFinish({
                status: 'success',
                carriedItems: state.carriedItems,
                lootedItems: state.lootedItems,
                durationSeconds: getDurationSeconds(),
                health: state.health,
                killCount: state.killCount,
            });
        }

        function getDurationSeconds() {
            return Math.floor((performance.now() - state.startedAt) / 1000);
        }

        function damagePlayer(amount, source) {
            if (skillCtrl?.isPlayerInvincible?.()) return;
            const sourceEntity = typeof source === 'object'
                ? source
                : [...state.npcs, ...state.remotePlayers].find(entity => entity.name === source);
            const finalAmount = skillCtrl ? skillCtrl.handleIncomingDamage(amount, sourceEntity) : amount;
            state.health = Math.max(0, state.health - finalAmount);
            addEffect({
                type: 'damage',
                x: player.state.x,
                y: player.state.y,
                text: `-${finalAmount}`,
                color: '#ef4444',
                createdAt: performance.now(),
                duration: 420,
            });
            if (state.health <= 0) {
                if (skillCtrl?.tryRevive?.()) {
                    pushHud();
                    return;
                }
                fail(`${typeof source === 'string' ? source : source?.name || '敌人'} 击败了你，撤离失败`);
            }
        }

        function addEffect(effect) {
            state.effects.push(effect);
        }

        function moveToward(entity, target, speed, stopDistance = 0) {
            const dx = target.x - entity.x;
            const dy = target.y - entity.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d <= stopDistance) {
                entity.x = target.x - (dx / d) * stopDistance;
                entity.y = target.y - (dy / d) * stopDistance;
                return;
            }
            const step = Math.min(speed, Math.max(0, d - stopDistance));
            entity.x += (dx / d) * step;
            entity.y += (dy / d) * step;
        }

        function getChasePointForNpc(npc, playerPoint) {
            const clone = skillCtrl?.getActiveClone?.();
            if (clone) return { x: clone.x, y: clone.y };
            let nearest = playerPoint;
            let nearestDist = distance(npc, playerPoint);
            state.remotePlayers.forEach(remote => {
                if (remote.hp <= 0) return;
                const d = distance(npc, remote);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearest = { x: remote.x, y: remote.y };
                }
            });
            return nearest;
        }

        function updateSharedCombatEntity(entity, playerPoint, now) {
            if (entity.stunnedUntil && now < entity.stunnedUntil) return;
            if (entity.isAlly) return;

            const chasePoint = getChasePointForNpc(entity, playerPoint);

            if (entity.provokeUntil && now < entity.provokeUntil && entity.provokeTargetId) {
                const rival = getCombatTargets().find(target => target.id === entity.provokeTargetId);
                if (rival) {
                    moveToward(entity, rival, entity.speed, 5);
                    if (distance(entity, rival) <= entity.attackRange && now - entity.lastAttackAt > entity.attackInterval) {
                        entity.lastAttackAt = now;
                        rival.hp -= entity.attack;
                        if (rival.hp <= 0) killCombatTarget(rival);
                    }
                    return;
                }
            }

            if (!(entity.rootedUntil && now < entity.rootedUntil) && (skillCtrl?.getActiveClone?.() || !skillCtrl?.isPlayerInvisible?.())) {
                const moveSpeed = skillCtrl ? skillCtrl.getMonsterMoveSpeed(entity, playerPoint) : entity.speed;
                moveToward(entity, chasePoint, moveSpeed, 5);
            }

            const attackInterval = skillCtrl ? skillCtrl.getMonsterAttackInterval(entity, playerPoint) : entity.attackInterval;
            const clone = skillCtrl?.getActiveClone?.();
            if (clone) {
                if (distance(entity, clone) <= entity.attackRange && now - entity.lastAttackAt > attackInterval) {
                    entity.lastAttackAt = now;
                    addEffect({
                        type: 'strike',
                        from: { x: entity.x, y: entity.y },
                        to: { x: clone.x, y: clone.y },
                        color: '#fb7185',
                        createdAt: now,
                        duration: 260,
                    });
                    skillCtrl.damageClone(entity.attack, entity.name);
                }
                return;
            }

            if (skillCtrl?.isPlayerInvisible?.()) return;

            const attackTargets = [
                { point: playerPoint, isLocal: true, userId, label: entity.name },
                ...state.remotePlayers.filter(remote => remote.hp > 0).map(remote => ({
                    point: { x: remote.x, y: remote.y },
                    isLocal: false,
                    userId: remote.userId,
                    label: entity.name,
                })),
            ];

            for (const target of attackTargets) {
                if (distance(entity, target.point) <= entity.attackRange && now - entity.lastAttackAt > attackInterval) {
                    entity.lastAttackAt = now;
                    addEffect({
                        type: 'strike',
                        from: { x: entity.x, y: entity.y },
                        to: target.point,
                        color: '#fb7185',
                        createdAt: now,
                        duration: 260,
                    });
                    if (target.isLocal) {
                        damagePlayer(entity.attack, entity);
                    } else {
                        multiplayer?.broadcast?.('npc_player_hit', {
                            targetUserId: target.userId,
                            damage: entity.attack,
                            npcName: entity.name,
                        });
                    }
                    break;
                }
            }
        }

        function updateCombatEntity(entity, playerPoint, now) {
            if (state.useSharedNpcs && state.isRoomHost) {
                updateSharedCombatEntity(entity, playerPoint, now);
                return;
            }
            if (state.useSharedNpcs) return;
            if (entity.stunnedUntil && now < entity.stunnedUntil) return;
            if (entity.isAlly) return;

            const clone = skillCtrl?.getActiveClone?.();
            const chasePoint = clone ? { x: clone.x, y: clone.y } : playerPoint;

            if (entity.provokeUntil && now < entity.provokeUntil && entity.provokeTargetId) {
                const rival = getCombatTargets().find(target => target.id === entity.provokeTargetId);
                if (rival) {
                    moveToward(entity, rival, entity.speed, 5);
                    if (distance(entity, rival) <= entity.attackRange && now - entity.lastAttackAt > entity.attackInterval) {
                        entity.lastAttackAt = now;
                        rival.hp -= entity.attack;
                        if (rival.hp <= 0) killCombatTarget(rival);
                    }
                    return;
                }
            }

            if (!(entity.rootedUntil && now < entity.rootedUntil) && (clone || !skillCtrl?.isPlayerInvisible?.())) {
                const moveSpeed = skillCtrl ? skillCtrl.getMonsterMoveSpeed(entity, playerPoint) : entity.speed;
                moveToward(entity, chasePoint, moveSpeed, 5);
            }

            const attackInterval = skillCtrl ? skillCtrl.getMonsterAttackInterval(entity, playerPoint) : entity.attackInterval;
            if (clone) {
                if (distance(entity, clone) <= entity.attackRange && now - entity.lastAttackAt > attackInterval) {
                    entity.lastAttackAt = now;
                    addEffect({
                        type: 'strike',
                        from: { x: entity.x, y: entity.y },
                        to: { x: clone.x, y: clone.y },
                        color: entity.color || '#f97316',
                        createdAt: now,
                        duration: 260,
                    });
                    skillCtrl.damageClone(entity.attack, entity.name);
                }
                return;
            }

            if (skillCtrl?.isPlayerInvisible?.()) return;

            if (distance(entity, playerPoint) <= entity.attackRange && now - entity.lastAttackAt > attackInterval) {
                entity.lastAttackAt = now;
                addEffect({
                    type: 'strike',
                    from: { x: entity.x, y: entity.y },
                    to: { x: player.state.x, y: player.state.y },
                    color: entity.color || '#f97316',
                    createdAt: now,
                    duration: 260,
                });
                damagePlayer(entity.attack, entity);
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

        function update() {
            if (!state.active) return;
            const now = performance.now();
            if (!state.collectible) {
                maintainCollectible();
            }
            if (state.treasures.length < targetTreasureCount()) {
                maintainTreasures();
            }
            if (now - state.lastMaintainCheck > 500) {
                state.lastMaintainCheck = now;
                maintainEquipmentDrops();
            }
            const playerPoint = { x: player.state.x, y: player.state.y };
            updateSpeedDurability();
            syncSkillSpeedBonus();
            skillCtrl?.updateTimedEffects?.(now);

            state.npcs.forEach(npc => updateCombatEntity(npc, playerPoint, now));
            interpolateSharedNpcs(now);
            state.lastFrameAt = now;

            if (state.useSharedNpcs && now - state.lastHostCheck > 5000) {
                state.lastHostCheck = now;
                multiplayer?.isRoomHost?.(roomId, userId).then(isHost => {
                    if (isHost === state.isRoomHost) return;
                    state.isRoomHost = isHost;
                    if (isHost) maintainHostiles();
                });
            }

            if (state.useSharedNpcs && state.isRoomHost && state.npcBroadcastMode && now - state.lastNpcBroadcast > 120) {
                let moved = false;
                state.npcs.forEach(npc => {
                    const id = npc.sharedId || npc.id;
                    const snapshot = npcSyncSnapshot(npc);
                    if (state.lastSyncedNpcs.get(id) === snapshot) return;
                    state.lastSyncedNpcs.set(id, snapshot);
                    moved = true;
                });
                if (moved) {
                    state.lastNpcBroadcast = now;
                    multiplayer?.broadcastSharedNpcState?.(state.npcs.map(npc => ({
                        id: npc.sharedId || npc.id,
                        x: npc.x,
                        y: npc.y,
                        hp: npc.hp,
                        lastAttackAt: npc.lastAttackAt || 0,
                        stunnedUntil: npc.stunnedUntil || 0,
                        rootedUntil: npc.rootedUntil || 0,
                    })));
                }
            } else if (state.useSharedNpcs && state.isRoomHost && !state.npcBroadcastMode && now - state.lastNpcDbSync > 750) {
                state.lastNpcDbSync = now;
                const dirtyNpcs = state.npcs.reduce((list, npc) => {
                    const id = npc.sharedId || npc.id;
                    const snapshot = npcSyncSnapshot(npc);
                    if (state.lastSyncedNpcs.get(id) === snapshot) return list;
                    state.lastSyncedNpcs.set(id, snapshot);
                    list.push({
                        id,
                        x: npc.x,
                        y: npc.y,
                        hp: npc.hp,
                        last_attack_at: npc.lastAttackAt || 0,
                        stunned_until: npc.stunnedUntil || 0,
                        rooted_until: npc.rootedUntil || 0,
                        provoke_until: npc.provokeUntil || 0,
                        provoke_target_id: npc.provokeTargetId || null,
                    });
                    return list;
                }, []);
                if (dirtyNpcs.length) {
                    multiplayer?.syncSharedNpcBatch?.(dirtyNpcs);
                }
            }

            state.effects = state.effects.filter(effect => now - effect.createdAt < effect.duration);
            updateExtraction();
            pushHud(false);
        }

        function updateExtraction() {
            const gates = getGates();
            const playerPoint = { x: player.state.x, y: player.state.y };
            const nearGate = gates.find(gate => distance(gate, playerPoint) < 60);

            if (!nearGate) {
                state.extractStart = null;
                state.extractGate = null;
                state.extractReady = false;
                return;
            }

            if (state.extractGate !== nearGate.name) {
                state.extractGate = nearGate.name;
                state.extractStart = performance.now();
                state.extractReady = false;
                toast(`进入${nearGate.name}撤离范围，坚持 20 秒后双击校门撤离`);
            }

            state.extractReady = performance.now() - state.extractStart >= 20000;
        }

        function pushHud(force = false) {
            const now = performance.now();
            if (!force && now - state.lastHudPush < 250) return;
            const remain = state.extractStart ? Math.max(0, 20 - Math.floor((performance.now() - state.extractStart) / 1000)) : '';
            const attack = state.baseAttack + getEquipmentAttack() + getDisplayAttackBonus();
            const hudPayload = {
                health: state.health,
                bagCount: state.lootedItems.length,
                bagUsed: getCurrentBackpackUsage(),
                bagCapacity: backpackCapacity,
                extractText: state.extractGate ? (state.extractReady ? `${state.extractGate}：按 J 撤离` : `${state.extractGate}：${remain}s`) : '',
                attack,
                attackRange: getAttackRange(),
                attackSpeed: getAttackSpeed(),
                attackInterval: getPlayerAttackInterval(),
                weaponText: state.weapon ? `${state.weapon.name} ${state.weapon.durabilityLeft}` : '空手',
                speedText: state.speedItem ? `${state.speedItem.name} ${Math.ceil(state.speedItem.moveLeft)}` : '无',
                skillText: skillCtrl?.getHudText?.() || '',
                passiveSkillName: skillCtrl?.passiveSkill?.name || '无',
            };
            const snapshot = JSON.stringify(hudPayload);
            if (!force && snapshot === state.lastHudSnapshot) return;
            state.lastHudSnapshot = snapshot;
            state.lastHudPush = now;
            onHud(hudPayload);
        }

        function getCurrentBackpackUsage() {
            return baseBackpackUsage + state.lootedItems.reduce((sum, itemId) => {
                const item = assets.getItemById(itemId);
                if (!item || item.type === 'skin' || item.type === 'capacity') return sum;
                return sum + 1;
            }, 0);
        }

        function canCollect(itemId) {
            const item = assets.getItemById(itemId);
            if (!item || item.type === 'skin' || item.type === 'capacity') return true;
            return getCurrentBackpackUsage() < backpackCapacity;
        }

        function collectItem(itemId, label) {
            if (!canCollect(itemId)) {
                toast('背包容量不足，请先购买背包扩容卡');
                return false;
            }
            state.lootedItems.push(itemId);
            toast(label);
            return true;
        }

        function handleDoubleClick(worldPoint) {
            if (!state.active) return false;
            const playerPoint = { x: player.state.x, y: player.state.y };
            if (state.collectible && distance(state.collectible, worldPoint) < CLICK_PICK_TOLERANCE) {
                if (distance(state.collectible, playerPoint) > COLLECT_RANGE) {
                    toast('不在收集范围内');
                    return true;
                }
                const collectible = state.collectible;
                const item = assets.getItemById(collectible.itemId);
                if (!collectItem(collectible.itemId, `拾取藏品：${item.name}`)) return true;
                state.collectible = null;
                maintainCollectible();
                return true;
            }
            const treasureIndex = state.treasures.findIndex(item => distance(item, worldPoint) < CLICK_PICK_TOLERANCE);
            if (treasureIndex >= 0) {
                const treasure = state.treasures[treasureIndex];
                if (distance(treasure, playerPoint) > COLLECT_RANGE) {
                    toast('不在收集范围内');
                    return true;
                }
                const gem = assets.getItemById(treasure.itemId);
                if (!collectItem(treasure.itemId, `拾取 ${gem.name}`)) return true;
                state.treasures.splice(treasureIndex, 1);
                maintainTreasures();
                return true;
            }

            const droppedIndex = state.droppedItems.findIndex(item => distance(item, worldPoint) < CLICK_PICK_TOLERANCE);
            if (droppedIndex >= 0) {
                const dropped = state.droppedItems[droppedIndex];
                if (distance(dropped, playerPoint) > COLLECT_RANGE) {
                    toast('不在收集范围内');
                    return true;
                }
                state.droppedItems.splice(droppedIndex, 1);
                const item = assets.getItemById(dropped.itemId);
                if (isEquippableItem(item) && tryEquipFromDrop(dropped.itemId)) {
                    maintainEquipmentDrops();
                    return true;
                }
                if (!collectItem(dropped.itemId, `拾取掉落物：${item.name}`)) {
                    state.droppedItems.splice(droppedIndex, 0, dropped);
                }
                return true;
            }

            const gate = getGates().find(item => distance(item, worldPoint) < 60);
            if (gate) {
                if (state.extractGate === gate.name && state.extractReady) {
                    success();
                } else {
                    toast('需要先在撤离点范围内等待 20 秒');
                }
                return true;
            }

            return false;
        }

        function collectNearestItem() {
            if (!state.active) return;
            const playerPoint = { x: player.state.x, y: player.state.y };
            
            if (state.collectible && distance(state.collectible, playerPoint) <= COLLECT_RANGE) {
                const collectible = state.collectible;
                const item = assets.getItemById(collectible.itemId);
                if (!collectItem(collectible.itemId, `拾取藏品：${item.name}`)) return;
                state.collectible = null;
                maintainCollectible();
                return;
            }

            const treasures = state.treasures.filter(item => distance(item, playerPoint) <= COLLECT_RANGE);
            if (treasures.length > 0) {
                const treasure = treasures.reduce((nearest, item) => 
                    distance(item, playerPoint) < distance(nearest, playerPoint) ? item : nearest
                );
                const treasureIndex = state.treasures.findIndex(item => item.id === treasure.id);
                if (treasureIndex >= 0) {
                    const gem = assets.getItemById(treasure.itemId);
                    if (!collectItem(treasure.itemId, `拾取 ${gem.name}`)) return;
                    state.treasures.splice(treasureIndex, 1);
                    maintainTreasures();
                    return;
                }
            }

            const droppedItems = state.droppedItems.filter(item => distance(item, playerPoint) <= COLLECT_RANGE);
            if (droppedItems.length > 0) {
                const dropped = droppedItems.reduce((nearest, item) => 
                    distance(item, playerPoint) < distance(nearest, playerPoint) ? item : nearest
                );
                const droppedIndex = state.droppedItems.findIndex(item => item.id === dropped.id);
                if (droppedIndex >= 0) {
                    const droppedItem = state.droppedItems[droppedIndex];
                    state.droppedItems.splice(droppedIndex, 1);
                    const item = assets.getItemById(droppedItem.itemId);
                    if (isEquippableItem(item) && tryEquipFromDrop(droppedItem.itemId)) {
                        maintainEquipmentDrops();
                        return;
                    }
                    if (!collectItem(droppedItem.itemId, `拾取掉落物：${item.name}`)) {
                        state.droppedItems.splice(droppedIndex, 0, droppedItem);
                    }
                    return;
                }
            }

            toast('附近没有可拾取的物品');
        }

        function tryExtract() {
            if (!state.active) return;
            if (state.extractReady && state.extractGate) {
                success();
            } else if (!state.extractGate) {
                toast('需要先进入撤离点范围内');
            } else {
                toast('撤离准备中，请稍候...');
            }
        }

        function attackNearest() {
            if (!state.active) return;
            const now = performance.now();
            if (now - state.lastPlayerAttackAt < getPlayerAttackInterval()) return;
            const playerPoint = { x: player.state.x, y: player.state.y };
            const attackRange = getAttackRange();
            const allTargets = [
                ...state.npcs.map(item => ({ ...item, kind: 'npc' })),
                ...state.remotePlayers.filter(item => item.hp > 0).map(item => ({ ...item, kind: 'player' })),
            ];
            const sorted = skillCtrl
                ? skillCtrl.resolveAttackTargets(playerPoint, attackRange)
                    .map(target => ({
                        ...target,
                        kind: target.isRemotePlayer ? 'player' : 'npc',
                    }))
                : allTargets.sort((a, b) => distance(a, playerPoint) - distance(b, playerPoint)).slice(0, 1);
            if (!sorted.length || distance(sorted[0], playerPoint) > attackRange) {
                toast('附近没有可攻击目标');
                return;
            }

            state.lastPlayerAttackAt = now;
            skillCtrl?.onPlayerAttackPerformed?.();
            skillCtrl?.consumeMultiTargetHit?.();

            sorted.forEach((target, index) => {
                const source = target.kind === 'player'
                    ? state.remotePlayers.find(item => item.id === target.id)
                    : state.npcs.find(item => item.id === target.id);
                if (!source) return;

                let damage = getStrikeDamage();
                if (index === 0 && skillCtrl?.shouldInstantKill?.()) {
                    damage = source.hp;
                    source.hp = 0;
                } else {
                    source.hp -= damage;
                }

                addEffect({
                    type: 'strike',
                    from: { x: player.state.x, y: player.state.y },
                    to: { x: source.x, y: source.y },
                    color: '#fde047',
                    createdAt: now,
                    duration: 240,
                });
                addEffect({
                    type: 'damage',
                    x: source.x,
                    y: source.y,
                    text: `-${damage}`,
                    color: '#fde047',
                    createdAt: now,
                    duration: 460,
                });
                skillCtrl?.applyLifesteal?.(damage);

                if (source.isSharedNpc && source.hp > 0) {
                    const sharedId = source.sharedId || source.id;
                    state.lastSyncedNpcs.delete(sharedId);
                    multiplayer?.updateSharedNpcHp?.(sharedId, source.hp);
                }

                if (source.isRemotePlayer) {
                    multiplayer?.broadcast?.('pvp_hit', {
                        targetId: source.userId,
                        damage,
                        targetHp: Math.max(0, source.hp),
                        attackerId: userId,
                    });
                }

                if (source.hp <= 0) killCombatTarget(source);
            });

            if (state.weapon) {
                state.weapon.durabilityLeft -= 1;
                if (state.weapon.durabilityLeft <= 0) {
                    toast(`${state.weapon.name} 已损坏`);
                    if (state.weapon.speed) player.state.speed -= state.weapon.speed;
                    state.weapon = null;
                }
            }
            pushHud();
        }

        function useActiveSkill() {
            if (!state.active || !skillCtrl) return false;
            const ok = skillCtrl.useActiveSkill();
            if (ok) pushHud();
            return ok;
        }

        function drawGem(ctx, cameraRef, treasure) {
            const point = cameraRef.worldToScreen(treasure.x, treasure.y);
            const size = Math.max(3, 4 * cameraRef.state.zoom);
            if (point.x < -size || point.x > window.innerWidth + size || point.y < -size || point.y > window.innerHeight + size) {
                return;
            }
            const color = treasure.color || assets.getItemById(treasure.itemId)?.color || '#ffffff';
            ctx.save();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y - size);
            ctx.lineTo(point.x + size, point.y);
            ctx.lineTo(point.x, point.y + size);
            ctx.lineTo(point.x - size, point.y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        function drawDroppedItem(ctx, cameraRef, drop) {
            const item = assets.getItemById(drop.itemId);
            if (!item) return;
            if (item.type === 'gem') {
                drawGem(ctx, cameraRef, drop);
                return;
            }
            const point = cameraRef.worldToScreen(drop.x, drop.y);
            const size = Math.max(18, 18 * cameraRef.state.zoom);
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(point.x - size / 2 + 2, point.y - size / 2 + 2, size, size);
            ctx.translate(point.x - size / 2, point.y - size / 2);
            assets.drawPixelIcon(ctx, item, 0, 0, size);
            ctx.restore();
        }

        function drawCollectible(ctx, cameraRef) {
            if (!state.collectible) return;
            const item = assets.getItemById(state.collectible.itemId);
            if (!item) return;
            const point = cameraRef.worldToScreen(state.collectible.x, state.collectible.y);
            const size = Math.max(16, 15 * cameraRef.state.zoom);
            ctx.save();
            const image = getCachedImage(item.assetPath);
            ctx.fillStyle = 'rgba(255, 208, 128, 0.28)';
            ctx.beginPath();
            ctx.arc(point.x, point.y, size * 0.8, 0, Math.PI * 2);
            ctx.fill();
            if (image.complete && image.naturalWidth > 0) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(image, point.x - size / 2, point.y - size / 2, size, size);
            } else {
                ctx.fillStyle = '#fde047';
                ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
            }
            ctx.strokeStyle = '#fff3c4';
            ctx.lineWidth = 2;
            ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
            ctx.restore();
        }

        const imageCache = {};

        function getCachedImage(src) {
            if (!imageCache[src]) {
                imageCache[src] = new Image();
                imageCache[src].src = src;
            }
            return imageCache[src];
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

        function drawCharacter(ctx, cameraRef, entity, color) {
            const point = cameraRef.worldToScreen(entity.x, entity.y);
            const size = Math.max(12, player.state.size * cameraRef.state.zoom);
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(point.x - size / 2 + 3, point.y - size / 2 + 3, size, size);
            if (entity.image && entity.image.complete && entity.image.naturalWidth > 0) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(entity.image, point.x - size / 2, point.y - size / 2, size, size);
                ctx.strokeStyle = entity.isRemotePlayer ? '#7dd3fc' : '#ffffff';
                ctx.lineWidth = Math.max(1, 2 * cameraRef.state.zoom);
                ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
            } else {
                ctx.fillStyle = color;
                ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
                ctx.fillStyle = '#fff';
                ctx.fillRect(point.x - size * 0.24, point.y - size * 0.18, size * 0.16, size * 0.16);
                ctx.fillRect(point.x + size * 0.12, point.y - size * 0.18, size * 0.16, size * 0.16);
            }
            ctx.fillStyle = '#fff3c4';
            ctx.font = '12px Microsoft YaHei, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(entity.name, point.x, point.y - size / 2 - 6);
            drawHealthBar(ctx, point.x, point.y - size / 2 - 20, Math.max(24, size * 1.25), 5, entity.hp, entity.maxHp || entity.hp);
            ctx.restore();
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
                    ctx.lineWidth = Math.max(2, 4 * cameraRef.state.zoom * (1 - progress * 0.45));
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(to.x, to.y, Math.max(4, 10 * cameraRef.state.zoom * (1 - progress)), 0, Math.PI * 2);
                    ctx.stroke();
                } else if (effect.type === 'damage') {
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
            state.treasures.forEach(item => drawGem(ctx, cameraRef, item));
            drawCollectible(ctx, cameraRef);
            state.droppedItems.forEach(item => drawDroppedItem(ctx, cameraRef, item));
            drawAttackRange(ctx, cameraRef);
            state.npcs.forEach(npc => drawCharacter(ctx, cameraRef, npc, npc.isAlly ? '#22c55e' : '#64748b'));
            state.remotePlayers.forEach(remote => drawCharacter(ctx, cameraRef, remote, remote.color || '#ef4444'));
            if (skillCtrl?.getActiveClone?.()) {
                skillCtrl.drawClone(ctx, cameraRef, skillCtrl.getActiveClone(), drawHealthBar);
            }
            drawPlayerHealth(ctx, cameraRef);
            drawEffects(ctx, cameraRef);

            getGates().forEach(gate => {
                const point = cameraRef.worldToScreen(gate.x, gate.y);
                ctx.save();
                ctx.strokeStyle = '#ffd080';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 5]);
                ctx.beginPath();
                ctx.arc(point.x, point.y, 60 * cameraRef.state.zoom, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#ffd080';
                ctx.font = 'bold 13px Microsoft YaHei, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${gate.name}撤离点`, point.x, point.y - 66 * cameraRef.state.zoom);
                ctx.restore();
            });
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
            tryExtract,
            fail,
            syncRemotePlayers,
            handlePvpHit,
            handleNpcPlayerHit,
            handleSharedNpcBroadcast,
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        goldrush: {
            createGoldRush,
        },
    };
})(window);
