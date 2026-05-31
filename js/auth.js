(function(global) {
    const onlineKey = 'ncut_online_status_v2';
    const ONLINE_WRITE_INTERVAL_MS = 800;
    const ONLINE_STALE_MS = 5 * 60 * 1000;

    let lastWriteAt = 0;
    let lastWriteKey = '';

    async function initSupabase() {
        return global.NCUTMap.store.init();
    }

    function pruneOnlineStatus(statusData, now = Date.now()) {
        Object.keys(statusData).forEach(userId => {
            const entry = statusData[userId];
            if (!entry?.last_update) {
                delete statusData[userId];
                return;
            }
            if (now - new Date(entry.last_update).getTime() > ONLINE_STALE_MS) {
                delete statusData[userId];
            }
        });
    }

    async function updateOnlineStatus(x = 0, y = 0, direction = 'down') {
        const user = global.NCUTMap.store.getUser();
        if (!user) return;

        const roundedX = Math.round(x);
        const roundedY = Math.round(y);
        const writeKey = `${roundedX}|${roundedY}|${direction}`;
        const now = performance.now();
        if (writeKey === lastWriteKey && now - lastWriteAt < ONLINE_WRITE_INTERVAL_MS) {
            return;
        }

        lastWriteKey = writeKey;
        lastWriteAt = now;

        const status = localStorage.getItem(onlineKey);
        const statusData = status ? JSON.parse(status) : {};
        pruneOnlineStatus(statusData);
        statusData[user.id] = {
            user_id: user.id,
            username: user.username,
            nickname: global.NCUTMap.store.getDisplayName(user),
            x: roundedX,
            y: roundedY,
            direction,
            last_update: new Date().toISOString(),
        };
        localStorage.setItem(onlineKey, JSON.stringify(statusData));
    }

    async function getOnlineUsers() {
        const status = localStorage.getItem(onlineKey);
        if (!status) return [];
        const statusData = JSON.parse(status);
        const now = Date.now();
        pruneOnlineStatus(statusData, now);
        return Object.values(statusData);
    }

    async function getUserProfile(userId) {
        const online = await getOnlineUsers();
        const found = online.find(entry => entry.user_id === userId);
        return found ? { username: found.username, nickname: found.nickname || found.username, avatar_color: '#4A90D9' } : null;
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        auth: {
            initSupabase,
            signUp: (...args) => global.NCUTMap.store.signUp(...args),
            signIn: (...args) => global.NCUTMap.store.signIn(...args),
            signOut: (...args) => global.NCUTMap.store.signOut(...args),
            getUser: () => global.NCUTMap.store.getUser(),
            isLoggedIn: () => global.NCUTMap.store.isLoggedIn(),
            updateOnlineStatus,
            getOnlineUsers,
            getUserProfile,
        },
    };
})(window);
