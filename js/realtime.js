(function(global) {
    const { supabaseConfig } = global.NCUTMap;
    const supabase = supabaseConfig.createClient();
    const TRACK_INTERVAL_MS = 1000;
    const POLL_INTERVAL_MS = 1000;
    const PRESENCE_STALE_MS = 8000;
    const GOLD_RUSH_BROADCAST_MS = 200;
    const GOLD_RUSH_DB_HEARTBEAT_MS = 3000;
    const PRESENCE_REFRESH_DEBOUNCE_MS = 250;

    let dbChannel = null;
    let broadcastChannel = null;
    let trackTimer = null;
    let pollTimer = null;
    let presenceState = new Map();
    let currentRoomId = null;
    let currentMode = null;
    let localUserId = null;
    let getTrackPayload = null;
    let onPresenceChange = null;
    let lastError = null;
    let presenceBroadcastMode = false;
    let presenceRefreshTimer = null;

    function isEnabled() {
        return Boolean(supabase);
    }

    function getLastError() {
        return lastError;
    }

    function mapPresenceRow(row) {
        return {
            userId: row.user_id,
            nickname: row.nickname || '玩家',
            x: Number(row.x) || 0,
            y: Number(row.y) || 0,
            hp: Number(row.hp) || 100,
            maxHp: Number(row.max_hp) || 100,
            status: row.status || 'active',
            skinColor: row.skin_color || '#4A90D9',
            skinItemId: row.skin_item_id || null,
            mode: row.mode,
            updatedAt: new Date(row.updated_at).getTime(),
        };
    }

    function getRemotePlayers() {
        return Array.from(presenceState.values());
    }

    function notifyPresenceChange() {
        onPresenceChange?.(getRemotePlayers());
    }

    function stopTimers() {
        if (trackTimer) {
            clearInterval(trackTimer);
            trackTimer = null;
        }
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        if (presenceRefreshTimer) {
            clearTimeout(presenceRefreshTimer);
            presenceRefreshTimer = null;
        }
    }

    function schedulePresenceRefresh(mode, roomId) {
        if (presenceRefreshTimer) return;
        presenceRefreshTimer = setTimeout(async () => {
            presenceRefreshTimer = null;
            await refreshPresenceFromDb(mode, roomId);
        }, PRESENCE_REFRESH_DEBOUNCE_MS);
    }

    function applyRemotePlayerMove(payload) {
        if (!payload?.sender_id || payload.sender_id === localUserId) return;
        const prev = presenceState.get(payload.sender_id);
        const next = {
            userId: payload.sender_id,
            nickname: payload.nickname || prev?.nickname || '玩家',
            x: Number(payload.x) || 0,
            y: Number(payload.y) || 0,
            hp: Number(payload.hp ?? prev?.hp ?? 100),
            maxHp: Number(payload.max_hp ?? prev?.maxHp ?? 100),
            status: payload.status || prev?.status || 'active',
            skinColor: payload.skin_color || prev?.skinColor || '#4A90D9',
            skinItemId: payload.skin_item_id ?? prev?.skinItemId ?? null,
            mode: currentMode,
            updatedAt: payload.sent_at || Date.now(),
        };
        if (prev && prev.x === next.x && prev.y === next.y && prev.hp === next.hp && prev.status === next.status) {
            return;
        }
        presenceState.set(payload.sender_id, next);
        notifyPresenceChange();
    }

    async function removeChannel(channel) {
        if (!channel || !supabase) return;
        try {
            await supabase.removeChannel(channel);
        } catch (_) {
            // ignore
        }
    }

    async function clearMyPresence(userId) {
        if (!supabase || !userId) return;
        await supabase.from('player_presence').delete().eq('user_id', userId);
    }

    async function refreshPresenceFromDb(mode, roomId) {
        if (!supabase) return;
        let query = supabase
            .from('player_presence')
            .select('*')
            .eq('mode', mode)
            .eq('status', 'active');
        if (roomId) {
            query = query.eq('room_id', roomId);
        } else {
            query = query.is('room_id', null);
        }
        const { data, error } = await query;
        if (error) {
            if (error.code === 'PGRST205' || /player_presence/i.test(error.message || '')) {
                lastError = '数据库缺少 player_presence 表';
            } else {
                lastError = error.message;
            }
            console.error('[realtime] refresh presence failed:', error);
            return;
        }
        const cutoff = Date.now() - PRESENCE_STALE_MS;
        const next = new Map();
        (data || []).forEach(row => {
            const updatedAt = new Date(row.updated_at).getTime();
            if (updatedAt < cutoff) return;
            if (row.user_id === localUserId) return;
            next.set(row.user_id, mapPresenceRow(row));
        });
        const changed = next.size !== presenceState.size
            || Array.from(next.keys()).some(key => {
                const prev = presenceState.get(key);
                const cur = next.get(key);
                return !prev || prev.x !== cur.x || prev.y !== cur.y || prev.hp !== cur.hp;
            });
        presenceState = next;
        if (changed) notifyPresenceChange();
    }

    async function upsertMyPresence(mode, roomId, userId, payload) {
        if (!supabase || !userId || !payload) return;
        const { error } = await supabase.from('player_presence').upsert({
            user_id: userId,
            mode,
            room_id: roomId || null,
            nickname: payload.nickname || '玩家',
            x: payload.x ?? 0,
            y: payload.y ?? 0,
            hp: payload.hp ?? 100,
            max_hp: payload.max_hp ?? 100,
            status: payload.status || 'active',
            skin_color: payload.skin_color || '#4A90D9',
            skin_item_id: payload.skin_item_id || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (error) {
            if (error.code === 'PGRST205' || /player_presence/i.test(error.message || '')) {
                lastError = '数据库缺少 player_presence 表，请在 Supabase SQL Editor 执行 supabase-schema.sql 末尾的多人同步 SQL';
            } else {
                lastError = error.message;
            }
            console.error('[realtime] upsert presence failed:', error);
        }
    }

    function startPolling(mode, roomId, interval = POLL_INTERVAL_MS) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            refreshPresenceFromDb(mode, roomId);
        }, interval);
    }

    function startTracking(mode, roomId, userId, options = {}) {
        stopTimers();
        let lastDbHeartbeat = 0;
        let lastBroadcastKey = '';
        const viaBroadcast = Boolean(options.presenceViaBroadcast);
        const trackInterval = viaBroadcast ? (options.trackInterval || GOLD_RUSH_BROADCAST_MS) : TRACK_INTERVAL_MS;

        trackTimer = setInterval(async () => {
            const payload = getTrackPayload?.();
            if (!payload) return;
            if (viaBroadcast) {
                const broadcastKey = `${Math.round(payload.x)}|${Math.round(payload.y)}|${payload.hp}|${payload.status}`;
                if (broadcastKey !== lastBroadcastKey) {
                    lastBroadcastKey = broadcastKey;
                    broadcast('player_move', {
                        nickname: payload.nickname,
                        x: payload.x,
                        y: payload.y,
                        hp: payload.hp,
                        max_hp: payload.max_hp,
                        status: payload.status,
                        skin_color: payload.skin_color,
                        skin_item_id: payload.skin_item_id,
                    });
                }
                const now = Date.now();
                if (now - lastDbHeartbeat >= (options.dbHeartbeatMs || GOLD_RUSH_DB_HEARTBEAT_MS)) {
                    lastDbHeartbeat = now;
                    await upsertMyPresence(mode, roomId, userId, payload);
                }
                return;
            }
            await upsertMyPresence(mode, roomId, userId, payload);
        }, trackInterval);

        const pollInterval = options.pollIntervalMs ?? (viaBroadcast ? 4000 : POLL_INTERVAL_MS);
        startPolling(mode, roomId, pollInterval);
    }

    function subscribeDbChanges(mode, roomId) {
        if (!supabase) return Promise.resolve(false);
        const channelName = `presence-${mode}-${roomId || 'global'}`;
        const filter = roomId ? `room_id=eq.${roomId}` : 'mode=eq.visit';
        dbChannel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'player_presence', filter },
                () => schedulePresenceRefresh(mode, roomId),
            );
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                console.warn('[realtime] postgres_changes 订阅超时，已启用轮询同步');
                resolve(false);
            }, 8000);
            dbChannel.subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    resolve(true);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    clearTimeout(timeout);
                    lastError = `Realtime 频道 ${status}`;
                    console.warn('[realtime]', lastError, '，已启用轮询同步');
                    resolve(false);
                }
            });
        });
    }

    function subscribeBroadcast(roomId, handlers = {}) {
        if (!supabase || !roomId) return Promise.resolve(false);
        const channelName = `goldrush-broadcast:${roomId}`;
        broadcastChannel = supabase.channel(channelName, {
            config: { broadcast: { ack: false, self: false } },
        });
        (handlers.events || []).forEach(({ event, callback }) => {
            broadcastChannel.on('broadcast', { event }, ({ payload }) => callback(payload));
        });
        return new Promise(resolve => {
            const timeout = setTimeout(() => resolve(false), 8000);
            broadcastChannel.subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    resolve(true);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    clearTimeout(timeout);
                    resolve(false);
                }
            });
        });
    }

    async function leavePresenceOnly() {
        stopTimers();
        const userId = localUserId;
        await removeChannel(dbChannel);
        await removeChannel(broadcastChannel);
        dbChannel = null;
        broadcastChannel = null;
        if (userId) await clearMyPresence(userId);
        presenceState = new Map();
        getTrackPayload = null;
        onPresenceChange = null;
    }

    async function leaveAll() {
        stopSharedNpcs();
        stopTimers();
        const userId = localUserId;
        await removeChannel(dbChannel);
        await removeChannel(broadcastChannel);
        dbChannel = null;
        broadcastChannel = null;
        if (userId) await clearMyPresence(userId);
        presenceState = new Map();
        currentRoomId = null;
        currentMode = null;
        localUserId = null;
        getTrackPayload = null;
        notifyPresenceChange();
        presenceBroadcastMode = false;
    }

    async function startSession(mode, roomId, user, trackFactory, handlers = {}, options = {}) {
        if (!supabase || !user?.id) {
            return { ok: false, reason: 'Supabase 未配置或未登录' };
        }

        lastError = null;
        if (options.preserveSharedNpcs) {
            await leavePresenceOnly();
        } else {
            await leaveAll();
        }

        localUserId = user.id;
        currentMode = mode;
        currentRoomId = roomId || null;
        getTrackPayload = trackFactory;
        onPresenceChange = handlers.onPresenceChange || null;
        presenceBroadcastMode = Boolean(options.presenceViaBroadcast);

        const sessionHandlers = {
            ...handlers,
            events: [...(handlers.events || [])],
        };
        if (presenceBroadcastMode) {
            sessionHandlers.events.unshift({
                event: 'player_move',
                callback: payload => applyRemotePlayerMove(payload),
            });
        }

        const initialPayload = trackFactory?.();
        if (initialPayload) {
            await upsertMyPresence(mode, roomId, user.id, initialPayload);
        }

        await subscribeDbChanges(mode, roomId);
        if (sessionHandlers.events?.length) {
            await subscribeBroadcast(roomId, sessionHandlers);
        }

        startTracking(mode, roomId, user.id, options);
        await refreshPresenceFromDb(mode, roomId);
        notifyPresenceChange();

        return { ok: true, mode, roomId, via: presenceBroadcastMode ? 'broadcast' : 'database' };
    }

    async function joinVisit(user, displayName, getPosition, handlers) {
        return startSession(
            'visit',
            null,
            user,
            () => {
                const pos = getPosition?.() || { x: 0, y: 0 };
                return {
                    nickname: displayName,
                    x: pos.x,
                    y: pos.y,
                    skin_color: user.avatarColor || '#4A90D9',
                    skin_item_id: user.currentSkinItemId || null,
                    status: 'active',
                };
            },
            handlers,
        );
    }

    async function countActiveMembers(roomId) {
        const { count, error } = await supabase
            .from('game_room_members')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', roomId)
            .eq('status', 'active');
        if (error) throw error;
        return count || 0;
    }

    async function refreshRoomCount(roomId) {
        const activeCount = await countActiveMembers(roomId);
        await supabase
            .from('game_rooms')
            .update({
                player_count: activeCount,
                status: activeCount > 0 ? 'active' : 'closed',
                updated_at: new Date().toISOString(),
            })
            .eq('id', roomId);
        return activeCount;
    }

    async function tryJoinRoom(roomId, userId, nickname) {
        const { data: room, error: roomError } = await supabase
            .from('game_rooms')
            .select('id, max_players, player_count, status')
            .eq('id', roomId)
            .single();
        if (roomError || !room) return false;
        if (room.status === 'closed') return false;

        const activeCount = await countActiveMembers(roomId);
        if (activeCount >= room.max_players) return false;

        const { data: existing } = await supabase
            .from('game_room_members')
            .select('status')
            .eq('room_id', roomId)
            .eq('user_id', userId)
            .maybeSingle();

        if (existing?.status === 'active') {
            currentRoomId = roomId;
            return true;
        }

        const { error: memberError } = await supabase.from('game_room_members').upsert({
            room_id: roomId,
            user_id: userId,
            nickname,
            status: 'active',
            joined_at: new Date().toISOString(),
            left_at: null,
        }, { onConflict: 'room_id,user_id' });
        if (memberError) {
            console.error('[realtime] join room member failed:', memberError);
            return false;
        }

        await refreshRoomCount(roomId);
        currentRoomId = roomId;
        return true;
    }

    async function createGoldRushRoom() {
        const { data, error } = await supabase
            .from('game_rooms')
            .insert({
                mode: 'goldrush',
                status: 'open',
                max_players: 10,
                player_count: 0,
            })
            .select('id')
            .single();
        if (error) throw error;
        return data.id;
    }

    async function findOrJoinGoldRushRoom(user, displayName) {
        if (!supabase || !user?.id) {
            return { roomId: null, offline: true };
        }

        const { data: rooms, error } = await supabase
            .from('game_rooms')
            .select('id, max_players, player_count, status')
            .eq('mode', 'goldrush')
            .in('status', ['open', 'active'])
            .order('created_at', { ascending: true })
            .limit(20);
        if (error) throw error;

        for (const room of rooms || []) {
            const activeCount = await countActiveMembers(room.id);
            if (activeCount >= room.max_players) continue;
            const joined = await tryJoinRoom(room.id, user.id, displayName);
            if (joined) return { roomId: room.id, playerCount: activeCount + 1 };
        }

        const roomId = await createGoldRushRoom();
        const joined = await tryJoinRoom(roomId, user.id, displayName);
        if (!joined) throw new Error('无法加入摸金房间');
        return { roomId, playerCount: 1, created: true };
    }

    async function joinGoldRushRoom(roomId, user, displayName, getState, handlers) {
        currentRoomId = roomId;
        return startSession(
            'goldrush',
            roomId,
            user,
            () => {
                const state = getState?.() || {};
                return {
                    nickname: displayName,
                    x: state.x || 0,
                    y: state.y || 0,
                    hp: state.hp ?? 100,
                    max_hp: state.maxHp ?? 100,
                    status: state.status || 'active',
                    skin_color: user.avatarColor || '#4A90D9',
                    skin_item_id: user.currentSkinItemId || null,
                };
            },
            handlers,
            {
                preserveSharedNpcs: true,
                presenceViaBroadcast: true,
                trackInterval: GOLD_RUSH_BROADCAST_MS,
                dbHeartbeatMs: GOLD_RUSH_DB_HEARTBEAT_MS,
                pollIntervalMs: 4000,
            },
        );
    }

    async function leaveGoldRushRoom(userId, status = 'left') {
        const roomId = currentRoomId;
        if (supabase && roomId && userId) {
            await supabase
                .from('game_room_members')
                .update({
                    status,
                    left_at: new Date().toISOString(),
                })
                .eq('room_id', roomId)
                .eq('user_id', userId);
            await refreshRoomCount(roomId);
        }
        await leaveAll();
    }

    function getSurvivalRoomMode(teamSize) {
        return teamSize === 4 ? 'survival_squad' : 'survival_duo';
    }

    async function getSurvivalRoomMembers(roomId) {
        if (!supabase || !roomId) return [];
        const { data, error } = await supabase
            .from('game_room_members')
            .select('user_id, nickname')
            .eq('room_id', roomId)
            .eq('status', 'active')
            .order('joined_at', { ascending: true });
        if (error) throw error;
        return (data || []).map(row => ({
            userId: row.user_id,
            user_id: row.user_id,
            nickname: row.nickname || '玩家',
        }));
    }

    async function createSurvivalRoom(teamSize) {
        const { data, error } = await supabase
            .from('game_rooms')
            .insert({
                mode: getSurvivalRoomMode(teamSize),
                status: 'open',
                max_players: teamSize,
                player_count: 0,
            })
            .select('id')
            .single();
        if (error) throw error;
        return data.id;
    }

    async function findOrJoinSurvivalRoom(user, displayName, teamSize) {
        if (!supabase || !user?.id) {
            return { roomId: null, offline: true, playerCount: 1, members: [], ready: true };
        }
        const mode = getSurvivalRoomMode(teamSize);
        const { data: rooms, error } = await supabase
            .from('game_rooms')
            .select('id, max_players, player_count, status')
            .eq('mode', mode)
            .in('status', ['open', 'active'])
            .order('created_at', { ascending: true })
            .limit(20);
        if (error) throw error;

        for (const room of rooms || []) {
            const activeCount = await countActiveMembers(room.id);
            if (activeCount >= teamSize) continue;
            const joined = await tryJoinRoom(room.id, user.id, displayName);
            if (joined) {
                const members = await getSurvivalRoomMembers(room.id);
                return {
                    roomId: room.id,
                    playerCount: members.length,
                    members,
                    teamSize,
                    ready: members.length >= teamSize,
                    created: false,
                };
            }
        }

        const roomId = await createSurvivalRoom(teamSize);
        const joined = await tryJoinRoom(roomId, user.id, displayName);
        if (!joined) throw new Error('无法加入生存房间');
        const members = await getSurvivalRoomMembers(roomId);
        return {
            roomId,
            playerCount: members.length,
            members,
            teamSize,
            ready: members.length >= teamSize,
            created: true,
        };
    }

    function waitForSurvivalTeam(roomId, teamSize, { onUpdate, onCancel } = {}) {
        return new Promise((resolve, reject) => {
            let cancelled = false;
            const timer = setInterval(async () => {
                if (cancelled) return;
                try {
                    const members = await getSurvivalRoomMembers(roomId);
                    onUpdate?.(members);
                    if (members.length >= teamSize) {
                        clearInterval(timer);
                        resolve(members);
                    }
                } catch (error) {
                    clearInterval(timer);
                    reject(error);
                }
            }, 1000);
            onCancel?.(() => {
                cancelled = true;
                clearInterval(timer);
                reject(new Error('cancelled'));
            });
        });
    }

    async function joinSurvivalRoom(roomId, user, displayName, getState, handlers, teamSize) {
        currentRoomId = roomId;
        const mode = getSurvivalRoomMode(teamSize);
        return startSession(
            mode,
            roomId,
            user,
            () => {
                const state = getState?.() || {};
                return {
                    nickname: displayName,
                    x: state.x || 0,
                    y: state.y || 0,
                    hp: state.hp ?? 100,
                    max_hp: state.maxHp ?? 100,
                    status: state.status || 'active',
                    skin_color: user.avatarColor || '#4A90D9',
                    skin_item_id: user.currentSkinItemId || null,
                };
            },
            handlers,
            {
                preserveSharedNpcs: true,
                presenceViaBroadcast: true,
                trackInterval: GOLD_RUSH_BROADCAST_MS,
                dbHeartbeatMs: GOLD_RUSH_DB_HEARTBEAT_MS,
                pollIntervalMs: 4000,
            },
        );
    }

    async function leaveSurvivalRoom(userId, status = 'left') {
        return leaveGoldRushRoom(userId, status);
    }

    function broadcast(event, payload) {
        if (!broadcastChannel) return;
        broadcastChannel.send({
            type: 'broadcast',
            event,
            payload: {
                ...payload,
                sender_id: localUserId,
                sent_at: Date.now(),
            },
        });
    }

    async function updateLocalPresenceFields(fields) {
        if (!supabase || !localUserId || !currentMode) return;
        const payload = getTrackPayload?.();
        if (!payload) return;
        await upsertMyPresence(currentMode, currentRoomId, localUserId, { ...payload, ...fields });
    }

    function getRoomId() {
        return currentRoomId;
    }

    const MAX_SHARED_NPCS = 5;
    const NPC_POLL_FALLBACK_MS = 5000;
    const NPC_REFRESH_DEBOUNCE_MS = 200;

    let sharedNpcRoomId = null;
    let sharedNpcPollTimer = null;
    let sharedNpcChannel = null;
    let onSharedNpcsChange = null;
    let sharedNpcRealtimeActive = false;
    let sharedNpcBroadcastMode = true;
    let lastSharedNpcFingerprint = '';
    let sharedNpcRefreshTimer = null;
    let sharedNpcRefreshInFlight = false;
    let sharedNpcRefreshQueued = false;

    function fingerprintSharedNpcRows(rows) {
        return (rows || [])
            .map(row => {
                const parts = [row.id, row.hp];
                if (!sharedNpcBroadcastMode) {
                    parts.push(
                        Math.round(Number(row.x) * 2),
                        Math.round(Number(row.y) * 2),
                    );
                }
                parts.push(
                    row.last_attack_at || 0,
                    row.stunned_until || 0,
                    row.rooted_until || 0,
                );
                return parts.join(':');
            })
            .sort()
            .join('|');
    }

    function stopSharedNpcs() {
        if (sharedNpcPollTimer) {
            clearInterval(sharedNpcPollTimer);
            sharedNpcPollTimer = null;
        }
        if (sharedNpcRefreshTimer) {
            clearTimeout(sharedNpcRefreshTimer);
            sharedNpcRefreshTimer = null;
        }
        if (sharedNpcChannel && supabase) {
            supabase.removeChannel(sharedNpcChannel);
            sharedNpcChannel = null;
        }
        sharedNpcRoomId = null;
        onSharedNpcsChange = null;
        sharedNpcRealtimeActive = false;
        sharedNpcBroadcastMode = true;
        lastSharedNpcFingerprint = '';
        sharedNpcRefreshInFlight = false;
        sharedNpcRefreshQueued = false;
    }

    function broadcastSharedNpcState(npcs) {
        if (!broadcastChannel || !npcs?.length) return;
        broadcast('npc_state', { npcs });
    }

    async function fetchSharedNpcs(roomId) {
        const { data, error } = await supabase
            .from('game_room_npcs')
            .select('*')
            .eq('room_id', roomId)
            .gt('hp', 0);
        if (error) throw error;
        return data || [];
    }

    async function refreshSharedNpcs(roomId) {
        if (!supabase || !roomId) return [];
        const rows = await fetchSharedNpcs(roomId);
        const fingerprint = fingerprintSharedNpcRows(rows);
        if (fingerprint === lastSharedNpcFingerprint) return rows;
        lastSharedNpcFingerprint = fingerprint;
        onSharedNpcsChange?.(rows);
        return rows;
    }

    function scheduleRefreshSharedNpcs(roomId) {
        if (!roomId) return;
        if (sharedNpcRefreshTimer) return;
        sharedNpcRefreshTimer = setTimeout(async () => {
            sharedNpcRefreshTimer = null;
            if (sharedNpcRefreshInFlight) {
                sharedNpcRefreshQueued = true;
                return;
            }
            sharedNpcRefreshInFlight = true;
            try {
                await refreshSharedNpcs(roomId);
            } finally {
                sharedNpcRefreshInFlight = false;
                if (sharedNpcRefreshQueued) {
                    sharedNpcRefreshQueued = false;
                    scheduleRefreshSharedNpcs(roomId);
                }
            }
        }, NPC_REFRESH_DEBOUNCE_MS);
    }

    async function getRoomHostUserId(roomId) {
        const { data, error } = await supabase
            .from('game_room_members')
            .select('user_id')
            .eq('room_id', roomId)
            .eq('status', 'active')
            .order('joined_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return data?.user_id || null;
    }

    async function isRoomHost(roomId, userId) {
        if (!roomId || !userId) return false;
        const hostId = await getRoomHostUserId(roomId);
        return hostId === userId;
    }

    async function ensureSharedNpcs(roomId, buildNpcRow, maxCount = MAX_SHARED_NPCS) {
        if (!supabase || !roomId || typeof buildNpcRow !== 'function') return;
        const rows = await fetchSharedNpcs(roomId);
        let needed = maxCount - rows.length;
        while (needed > 0) {
            const row = buildNpcRow();
            const { error } = await supabase.from('game_room_npcs').insert({
                room_id: roomId,
                ...row,
            });
            if (error) {
                console.error('[realtime] ensureSharedNpcs failed:', error);
                break;
            }
            needed -= 1;
        }
        await refreshSharedNpcs(roomId);
    }

    async function updateSharedNpc(npcId, fields) {
        if (!supabase || !npcId) return;
        const { error } = await supabase
            .from('game_room_npcs')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', npcId);
        if (error) console.error('[realtime] updateSharedNpc failed:', error);
    }

    async function updateSharedNpcHp(npcId, hp) {
        await updateSharedNpc(npcId, { hp: Math.max(0, hp) });
    }

    async function deleteSharedNpc(npcId) {
        if (!supabase || !npcId) return;
        const { error } = await supabase.from('game_room_npcs').delete().eq('id', npcId);
        if (error) console.error('[realtime] deleteSharedNpc failed:', error);
    }

    async function syncSharedNpcBatch(npcs) {
        if (!supabase || !npcs?.length) return;
        const updatedAt = new Date().toISOString();
        const payload = npcs.map(npc => ({
            id: npc.id,
            room_id: sharedNpcRoomId,
            x: npc.x,
            y: npc.y,
            hp: npc.hp,
            last_attack_at: npc.last_attack_at ?? 0,
            stunned_until: npc.stunned_until ?? 0,
            rooted_until: npc.rooted_until ?? 0,
            provoke_until: npc.provoke_until ?? 0,
            provoke_target_id: npc.provoke_target_id || null,
            updated_at: updatedAt,
        }));
        const { error } = await supabase
            .from('game_room_npcs')
            .upsert(payload, { onConflict: 'id' });
        if (error) console.error('[realtime] syncSharedNpcBatch failed:', error);
    }

    function startSharedNpcPolling(roomId) {
        if (sharedNpcPollTimer) clearInterval(sharedNpcPollTimer);
        if (sharedNpcRealtimeActive) {
            sharedNpcPollTimer = null;
            return;
        }
        sharedNpcPollTimer = setInterval(() => {
            refreshSharedNpcs(roomId);
        }, NPC_POLL_FALLBACK_MS);
    }

    function subscribeSharedNpcChanges(roomId) {
        if (!supabase || !roomId) return Promise.resolve(false);
        const filter = `room_id=eq.${roomId}`;
        const onDbChange = () => scheduleRefreshSharedNpcs(roomId);
        sharedNpcChannel = supabase
            .channel(`shared-npcs:${roomId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'game_room_npcs', filter },
                onDbChange,
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'game_room_npcs', filter },
                onDbChange,
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'game_room_npcs', filter },
                onDbChange,
            );
        return new Promise(resolve => {
            const timeout = setTimeout(() => resolve(false), 8000);
            sharedNpcChannel.subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    resolve(true);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    clearTimeout(timeout);
                    resolve(false);
                }
            });
        });
    }

    async function initSharedNpcs({ roomId, isHost, buildNpcRow, onChange, useBroadcast = true, maxCount = MAX_SHARED_NPCS }) {
        if (!supabase || !roomId) return { ok: false };
        try {
            stopSharedNpcs();
            sharedNpcRoomId = roomId;
            sharedNpcBroadcastMode = useBroadcast !== false;
            onSharedNpcsChange = onChange || null;
            await refreshSharedNpcs(roomId);
            if (isHost) await ensureSharedNpcs(roomId, buildNpcRow, maxCount);
            sharedNpcRealtimeActive = await subscribeSharedNpcChanges(roomId);
            startSharedNpcPolling(roomId);
            return { ok: true, realtime: sharedNpcRealtimeActive, broadcast: sharedNpcBroadcastMode };
        } catch (error) {
            lastError = error.message;
            console.error('[realtime] initSharedNpcs failed:', error);
            stopSharedNpcs();
            return { ok: false, reason: error.message };
        }
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        realtime: {
            isEnabled,
            getLastError,
            joinVisit,
            leaveAll,
            findOrJoinGoldRushRoom,
            joinGoldRushRoom,
            leaveGoldRushRoom,
            findOrJoinSurvivalRoom,
            getSurvivalRoomMembers,
            waitForSurvivalTeam,
            joinSurvivalRoom,
            leaveSurvivalRoom,
            getRemotePlayers,
            broadcast,
            updateLocalPresenceFields,
            getRoomId,
            isRoomHost,
            initSharedNpcs,
            ensureSharedNpcs,
            refreshSharedNpcs,
            updateSharedNpcHp,
            deleteSharedNpc,
            syncSharedNpcBatch,
            broadcastSharedNpcState,
            stopSharedNpcs,
        },
    };
})(window);
