(function(global) {
    const { supabaseConfig } = global.NCUTMap;
    const LOCAL_KEY = 'ncut_game_state_v2';
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
    const MAX_MESSAGE_LENGTH = 500;
    const PUBLIC_USER_COLUMNS = 'id, username, nickname, bio, last_seen_at, current_skin_item_id';

    const supabase = supabaseConfig.createClient();

    function loadLocalDb() {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return { users: {}, currentUserId: null, runs: [], friendRequests: [], friendships: [], chatMessages: [] };
        try {
            const db = JSON.parse(raw);
            db.friendRequests = db.friendRequests || [];
            db.friendships = db.friendships || [];
            db.chatMessages = db.chatMessages || [];
            return db;
        } catch {
            return { users: {}, currentUserId: null, runs: [], friendRequests: [], friendships: [], chatMessages: [] };
        }
    }

    function saveLocalDb(db) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
    }

    function getCurrentUserId() {
        return global.NCUTMap.store.getUser()?.id || null;
    }

    function requireCurrentUserId() {
        const userId = getCurrentUserId();
        if (!userId) throw new Error('请先登录');
        return userId;
    }

    function getDisplayName(user) {
        return global.NCUTMap.store.getDisplayName(user);
    }

    function isOnline(lastSeenAt) {
        if (!lastSeenAt) return false;
        return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
    }

    function sanitizePublicUser(row) {
        if (!row) return null;
        return {
            id: row.id,
            username: row.username,
            nickname: row.nickname || row.username || '玩家',
            bio: row.bio || '',
            online: isOnline(row.last_seen_at || row.lastSeenAt),
            lastSeenAt: row.last_seen_at || row.lastSeenAt || null,
            currentSkinItemId: row.current_skin_item_id || row.currentSkinItemId || null,
        };
    }

    async function heartbeatOnline() {
        const userId = getCurrentUserId();
        if (!userId) return;
        const now = new Date().toISOString();
        if (supabase) {
            await supabase.from('users').update({ last_seen_at: now, updated_at: now }).eq('id', userId);
            return;
        }
        const db = loadLocalDb();
        const user = db.users[userId];
        if (user) {
            user.lastSeenAt = now;
            saveLocalDb(db);
        }
    }

    async function searchUsersByNickname(keyword) {
        keyword = keyword.trim();
        if (keyword.length < 1) return [];
        const userId = requireCurrentUserId();
        if (supabase) {
            const safeKeyword = keyword.replace(/[%_\\]/g, '\\$&');
            const { data, error } = await supabase
                .from('users')
                .select(PUBLIC_USER_COLUMNS)
                .or(`nickname.ilike.%${safeKeyword}%,username.ilike.%${safeKeyword}%`)
                .neq('id', userId)
                .limit(20);
            if (error) throw new Error(error.message);
            return (data || []).map(sanitizePublicUser);
        }
        const db = loadLocalDb();
        return Object.values(db.users)
            .filter(user => user.id !== userId && (
                (user.nickname || user.username || '').includes(keyword)
                || (user.username || '').includes(keyword)
            ))
            .slice(0, 20)
            .map(user => sanitizePublicUser({
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                bio: user.bio,
                last_seen_at: user.lastSeenAt,
                current_skin_item_id: user.currentSkinItemId,
            }));
    }

    async function getPublicProfile(userId) {
        if (!userId) throw new Error('玩家不存在');
        if (supabase) {
            const { data, error } = await supabase
                .from('users')
                .select(PUBLIC_USER_COLUMNS)
                .eq('id', userId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) throw new Error('玩家不存在');
            return sanitizePublicUser(data);
        }
        const db = loadLocalDb();
        const user = db.users[userId];
        if (!user) throw new Error('玩家不存在');
        return sanitizePublicUser({
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            bio: user.bio,
            last_seen_at: user.lastSeenAt,
            current_skin_item_id: user.currentSkinItemId,
        });
    }

    async function areFriends(userId, friendId) {
        if (supabase) {
            const { data, error } = await supabase
                .from('friendships')
                .select('user_id')
                .eq('user_id', userId)
                .eq('friend_id', friendId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            return Boolean(data);
        }
        const db = loadLocalDb();
        return db.friendships.some(row => row.userId === userId && row.friendId === friendId);
    }

    async function getFriendRelation(targetUserId) {
        const userId = requireCurrentUserId();
        if (userId === targetUserId) return { status: 'self' };
        if (await areFriends(userId, targetUserId)) return { status: 'friend' };
        if (supabase) {
            const { data, error } = await supabase
                .from('friend_requests')
                .select('id, from_user_id, to_user_id, status')
                .or(`and(from_user_id.eq.${userId},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${userId})`)
                .eq('status', 'pending')
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) return { status: 'none' };
            if (data.from_user_id === userId) return { status: 'pending_sent', requestId: data.id };
            return { status: 'pending_received', requestId: data.id };
        }
        const db = loadLocalDb();
        const req = db.friendRequests.find(row => row.status === 'pending' && (
            (row.fromUserId === userId && row.toUserId === targetUserId)
            || (row.fromUserId === targetUserId && row.toUserId === userId)
        ));
        if (!req) return { status: 'none' };
        if (req.fromUserId === userId) return { status: 'pending_sent', requestId: req.id };
        return { status: 'pending_received', requestId: req.id };
    }

    async function sendFriendRequest(toUserId) {
        const userId = requireCurrentUserId();
        if (userId === toUserId) throw new Error('不能添加自己为好友');
        const relation = await getFriendRelation(toUserId);
        if (relation.status === 'friend') throw new Error('已经是好友');
        if (relation.status === 'pending_sent') throw new Error('好友申请已发送');
        if (relation.status === 'pending_received') throw new Error('对方已向你发送申请，请在好友面板中确认');
        if (supabase) {
            const { error } = await supabase.from('friend_requests').insert({
                from_user_id: userId,
                to_user_id: toUserId,
                status: 'pending',
            });
            if (error) throw new Error(error.message);
            return;
        }
        const db = loadLocalDb();
        db.friendRequests.push({
            id: 'freq_' + Date.now().toString(36),
            fromUserId: userId,
            toUserId,
            status: 'pending',
            createdAt: new Date().toISOString(),
        });
        saveLocalDb(db);
    }

    async function getIncomingFriendRequests() {
        const userId = requireCurrentUserId();
        if (supabase) {
            const { data, error } = await supabase
                .from('friend_requests')
                .select('id, from_user_id, created_at')
                .eq('to_user_id', userId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            const fromIds = [...new Set((data || []).map(row => row.from_user_id))];
            let userMap = {};
            if (fromIds.length) {
                const { data: users, error: userError } = await supabase
                    .from('users')
                    .select(PUBLIC_USER_COLUMNS)
                    .in('id', fromIds);
                if (userError) throw new Error(userError.message);
                userMap = Object.fromEntries((users || []).map(user => [user.id, user]));
            }
            return (data || []).map(row => ({
                id: row.id,
                fromUser: sanitizePublicUser(userMap[row.from_user_id]),
                createdAt: row.created_at,
            })).filter(item => item.fromUser);
        }
        const db = loadLocalDb();
        return db.friendRequests
            .filter(row => row.toUserId === userId && row.status === 'pending')
            .map(row => {
                const fromUser = db.users[row.fromUserId];
                return {
                    id: row.id,
                    fromUser: sanitizePublicUser({
                        id: fromUser.id,
                        username: fromUser.username,
                        nickname: fromUser.nickname,
                        bio: fromUser.bio,
                        last_seen_at: fromUser.lastSeenAt,
                        current_skin_item_id: fromUser.currentSkinItemId,
                    }),
                    createdAt: row.createdAt,
                };
            });
    }

    async function acceptFriendRequest(requestId) {
        const userId = requireCurrentUserId();
        if (supabase) {
            const { data: request, error } = await supabase
                .from('friend_requests')
                .select('id, from_user_id, to_user_id, status')
                .eq('id', requestId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!request || request.to_user_id !== userId || request.status !== 'pending') {
                throw new Error('好友申请不存在');
            }
            await supabase.from('friend_requests').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', requestId);
            await supabase.from('friendships').upsert([
                { user_id: userId, friend_id: request.from_user_id },
                { user_id: request.from_user_id, friend_id: userId },
            ], { onConflict: 'user_id,friend_id' });
            return;
        }
        const db = loadLocalDb();
        const request = db.friendRequests.find(row => row.id === requestId && row.toUserId === userId && row.status === 'pending');
        if (!request) throw new Error('好友申请不存在');
        request.status = 'accepted';
        db.friendships.push({ userId, friendId: request.fromUserId, createdAt: new Date().toISOString() });
        db.friendships.push({ userId: request.fromUserId, friendId: userId, createdAt: new Date().toISOString() });
        saveLocalDb(db);
    }

    async function rejectFriendRequest(requestId) {
        const userId = requireCurrentUserId();
        if (supabase) {
            const { data: request, error } = await supabase
                .from('friend_requests')
                .select('id, to_user_id, status')
                .eq('id', requestId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!request || request.to_user_id !== userId || request.status !== 'pending') {
                throw new Error('好友申请不存在');
            }
            await supabase.from('friend_requests').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', requestId);
            return;
        }
        const db = loadLocalDb();
        const request = db.friendRequests.find(row => row.id === requestId && row.toUserId === userId && row.status === 'pending');
        if (!request) throw new Error('好友申请不存在');
        request.status = 'rejected';
        saveLocalDb(db);
    }

    async function getFriends() {
        const userId = requireCurrentUserId();
        if (supabase) {
            const { data, error } = await supabase
                .from('friendships')
                .select('friend_id')
                .eq('user_id', userId);
            if (error) throw new Error(error.message);
            const friendIds = (data || []).map(row => row.friend_id);
            if (!friendIds.length) return [];
            const { data: users, error: userError } = await supabase
                .from('users')
                .select(PUBLIC_USER_COLUMNS)
                .in('id', friendIds);
            if (userError) throw new Error(userError.message);
            const friends = (users || []).map(sanitizePublicUser).filter(Boolean);
            return friends.sort((a, b) => Number(!b.online) - Number(!a.online) || a.nickname.localeCompare(b.nickname, 'zh-CN'));
        }
        const db = loadLocalDb();
        const friends = db.friendships
            .filter(row => row.userId === userId)
            .map(row => db.users[row.friendId])
            .filter(Boolean)
            .map(user => sanitizePublicUser({
                id: user.id,
                username: user.username,
                nickname: user.nickname,
                bio: user.bio,
                last_seen_at: user.lastSeenAt,
                current_skin_item_id: user.currentSkinItemId,
            }));
        return friends.sort((a, b) => Number(!b.online) - Number(!a.online) || a.nickname.localeCompare(b.nickname, 'zh-CN'));
    }

    async function getMessages(friendId, limit = 80) {
        const userId = requireCurrentUserId();
        if (!(await areFriends(userId, friendId))) throw new Error('只能与好友聊天');
        if (supabase) {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('id, from_user_id, to_user_id, content, created_at')
                .or(`and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`)
                .order('created_at', { ascending: true })
                .limit(limit);
            if (error) throw new Error(error.message);
            return (data || []).map(row => ({
                id: row.id,
                fromUserId: row.from_user_id,
                toUserId: row.to_user_id,
                content: row.content,
                createdAt: row.created_at,
                mine: row.from_user_id === userId,
            }));
        }
        const db = loadLocalDb();
        return db.chatMessages
            .filter(row => (
                (row.fromUserId === userId && row.toUserId === friendId)
                || (row.fromUserId === friendId && row.toUserId === userId)
            ))
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .slice(-limit)
            .map(row => ({
                id: row.id,
                fromUserId: row.fromUserId,
                toUserId: row.toUserId,
                content: row.content,
                createdAt: row.createdAt,
                mine: row.fromUserId === userId,
            }));
    }

    async function sendMessage(friendId, content) {
        content = content.trim();
        if (!content) throw new Error('消息不能为空');
        if (content.length > MAX_MESSAGE_LENGTH) throw new Error(`消息不能超过${MAX_MESSAGE_LENGTH}字`);
        const userId = requireCurrentUserId();
        if (!(await areFriends(userId, friendId))) throw new Error('只能与好友聊天');
        if (supabase) {
            const { error } = await supabase.from('chat_messages').insert({
                from_user_id: userId,
                to_user_id: friendId,
                content,
            });
            if (error) throw new Error(error.message);
            return;
        }
        const db = loadLocalDb();
        db.chatMessages.push({
            id: 'msg_' + Date.now().toString(36),
            fromUserId: userId,
            toUserId: friendId,
            content,
            createdAt: new Date().toISOString(),
        });
        saveLocalDb(db);
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        social: {
            heartbeatOnline,
            searchUsersByNickname,
            getPublicProfile,
            getFriendRelation,
            sendFriendRequest,
            getIncomingFriendRequests,
            acceptFriendRequest,
            rejectFriendRequest,
            getFriends,
            getMessages,
            sendMessage,
            isOnline,
        },
    };
})(window);
