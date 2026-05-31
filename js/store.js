(function(global) {
    const { assets, supabaseConfig } = global.NCUTMap;
    const LOCAL_KEY = 'ncut_game_state_v2';
    const DEFAULT_COINS = 3000;
    const DEFAULT_BACKPACK_CAPACITY = 50;
    const USER_SELECT_COLUMNS = 'id, username, nickname, bio, ncut_coins, current_skin_item_id, backpack_capacity, daily_tasks, achievements, achievement_stats';
    const MAX_BIO_LENGTH = 100;
    const DAILY_TASKS = [
        { id: 'login', name: '每日登录', reward: 100 },
        { id: 'goldrush_extract', name: '每日摸金模式成功撤离', reward: 300 },
        { id: 'visit', name: '每日参观校园', reward: 100 },
        { id: 'survival', name: '每日玩一局生存模式', reward: 200 },
        { id: 'survival_30s', name: '每日生存模式存活30s', reward: 300, target: 30, progressKind: 'max' },
        { id: 'survival_10_kills', name: '每日生存模式累计击杀10个怪物', reward: 200, target: 10, progressKind: 'sum' },
    ];
    const ACHIEVEMENTS = [
        { id: 'survival_60', name: 'NCUT稳心者', description: '生存模式，存活60s' },
        { id: 'survival_180', name: 'NCUT余生者', description: '生存模式，存活180s' },
        { id: 'survival_20_kills', name: 'NCUT奋战者', description: '生存模式，单局击杀20只怪物' },
        { id: 'survival_50_kills', name: 'NCUT守护者', description: '生存模式，单局击杀50只怪物' },
        { id: 'survival_1000_kills', name: 'NCUT爆杀者', description: '生存模式，累计击杀1000只怪物' },
        { id: 'survival_100_medkits', name: 'NCUT回春者', description: '生存模式累计使用医疗包100次' },
        { id: 'goldrush_fast_extract', name: 'NCUT速逃者', description: '摸金模式60s内完成撤离1次' },
        { id: 'goldrush_high_health', name: 'NCUT铁壁者', description: '摸金模式撤离时生命值大于80，1次' },
        { id: 'goldrush_full_load', name: 'NCUT满载者', description: '摸金模式撤离时，单局拾取并带走10件物品' },
        { id: 'goldrush_1000_gems', name: 'NCUT聚财家', description: '摸金模式累计收集1000颗宝石' },
        { id: 'collectible_1', name: 'NCUT珍藏家', description: '累计收集1个收藏品' },
        { id: 'goldrush_no_kill', name: 'NCUT潜行客', description: '摸金模式不击杀任意NPC或玩家成功撤离一次' },
        { id: 'visit_1', name: 'NCUT探险家', description: '进入参观模式1次' },
        { id: 'goldrush_100_extracts', name: 'NCUT常胜家', description: '摸金模式累计成功撤离100次' },
        { id: 'login_100_days', name: 'NCUT常客', description: '累计登录100天' },
    ];

    const local = {
        currentUser: null,
        db: loadLocalDb(),
    };

    const supabase = supabaseConfig.createClient();

    function loadLocalDb() {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return { users: {}, currentUserId: null, runs: [] };
        try {
            return JSON.parse(raw);
        } catch {
            return { users: {}, currentUserId: null, runs: [] };
        }
    }

    function saveLocalDb() {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(local.db));
    }

    function hashPassword(username, password) {
        return btoa(unescape(encodeURIComponent(`${username}:${password}`)));
    }

    function createStarterInventory() {
        return {
            weapon_knife: 1,
            tool_shovel: 1,
            tool_boots: 1,
        };
    }

    function sanitizeUser(user) {
        if (!user) return null;
        return {
            id: user.id,
            username: user.username,
            nickname: user.nickname ?? user.username ?? '',
            bio: user.bio ?? '',
            ncutCoins: user.ncutCoins ?? user.ncut_coins ?? DEFAULT_COINS,
            currentSkinItemId: user.currentSkinItemId ?? user.current_skin_item_id ?? null,
            backpackCapacity: user.backpackCapacity ?? user.backpack_capacity ?? DEFAULT_BACKPACK_CAPACITY,
            dailyTasks: user.dailyTasks ?? user.daily_tasks ?? null,
            achievements: user.achievements ?? null,
            achievementStats: user.achievementStats ?? user.achievement_stats ?? null,
        };
    }

    function getChinaDateKey(date = new Date()) {
        const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        return chinaTime.toISOString().slice(0, 10);
    }

    function normalizeDailyTasks(raw) {
        const today = getChinaDateKey();
        const state = raw && raw.date === today ? raw : { date: today, tasks: {} };
        DAILY_TASKS.forEach(task => {
            const existing = state.tasks[task.id] || {};
            const entry = {
                completed: Boolean(existing.completed),
                claimed: Boolean(existing.claimed),
            };
            if (task.target) {
                entry.progress = Number(existing.progress) || 0;
                if (!entry.completed && entry.progress >= task.target) {
                    entry.completed = true;
                    entry.progress = task.target;
                }
            }
            state.tasks[task.id] = entry;
        });
        return state;
    }

    function normalizeAchievements(raw) {
        const state = raw && typeof raw === 'object' ? raw : { unlocked: {} };
        state.unlocked = state.unlocked || {};
        return state;
    }

    function normalizeAchievementStats(raw) {
        return {
            survivalKills: raw?.survivalKills || 0,
            survivalMedkits: raw?.survivalMedkits || 0,
            goldrushExtracts: raw?.goldrushExtracts || 0,
            goldrushGems: raw?.goldrushGems || 0,
            goldrushCollectibles: raw?.goldrushCollectibles || 0,
            loginDays: raw?.loginDays || 0,
            lastLoginDate: raw?.lastLoginDate || null,
        };
    }

    function unlockAchievement(state, id) {
        if (!state.unlocked[id]) {
            state.unlocked[id] = new Date().toISOString();
        }
    }

    function getDisplayName(user) {
        if (!user) return '玩家';
        return (user.nickname || user.username || '玩家').trim();
    }

    function validateNickname(nickname) {
        nickname = nickname.trim();
        if (nickname.length < 2) throw new Error('昵称至少需要2个字符');
        if (nickname.length > 12) throw new Error('昵称不能超过12个字符');
        return nickname;
    }

    function validateBio(bio) {
        bio = bio.trim();
        if (bio.length > MAX_BIO_LENGTH) throw new Error(`简介不能超过${MAX_BIO_LENGTH}字`);
        return bio;
    }

    async function ensureNicknameField() {
        if (!local.currentUser) return;
        if (supabase) {
            const { data, error } = await supabase
                .from('users')
                .select('nickname, username')
                .eq('id', local.currentUser.id)
                .single();
            if (error || !data || data.nickname) {
                if (data?.nickname) await refreshProfile();
                return;
            }
            const { data: updated, error: updateError } = await supabase
                .from('users')
                .update({ nickname: data.username, updated_at: new Date().toISOString() })
                .eq('id', local.currentUser.id)
                .select(USER_SELECT_COLUMNS)
                .single();
            if (!updateError && updated) local.currentUser = sanitizeUser(updated);
            return;
        }
        const user = local.db.users[local.db.currentUserId];
        if (!user || user.nickname) return;
        user.nickname = user.username;
        saveLocalDb();
        local.currentUser = sanitizeUser(user);
    }

    function getLocalUserByName(username) {
        return Object.values(local.db.users).find(user => user.username === username) || null;
    }

    function requireLocalUser() {
        const user = local.db.users[local.db.currentUserId];
        if (!user) throw new Error('请先登录');
        return user;
    }

    function upsertLocalUser(user) {
        local.db.users[user.id] = user;
        local.db.currentUserId = user.id;
        local.currentUser = sanitizeUser(user);
        saveLocalDb();
        return local.currentUser;
    }

    async function signUp(username, password) {
        username = username.trim();
        if (username.length < 2) throw new Error('用户名至少需要2个字符');
        if (password.length < 6) throw new Error('密码至少需要6位');

        if (supabase) {
            const existing = await getSupabaseUserByName(username);
            if (existing) throw new Error('用户名已存在');
            const { data, error } = await supabase
                .from('users')
                .insert({
                    username,
                    nickname: username,
                    bio: '',
                    password_hash: hashPassword(username, password),
                    ncut_coins: DEFAULT_COINS,
                    current_skin_item_id: null,
                    backpack_capacity: DEFAULT_BACKPACK_CAPACITY,
                    daily_tasks: normalizeDailyTasks(),
                    achievements: normalizeAchievements(),
                    achievement_stats: normalizeAchievementStats(),
                })
                .select(USER_SELECT_COLUMNS)
                .single();
            if (error) throw new Error(error.message);
            await ensureStarterInventory(data.id);
            local.db.currentUserId = data.id;
            saveLocalDb();
            local.currentUser = sanitizeUser(data);
            await ensureNicknameField();
            await markDailyTask('login');
            await recordLoginAchievement();
            return { user: local.currentUser };
        }

        if (getLocalUserByName(username)) throw new Error('用户名已存在');
        const user = {
            id: 'user_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
            username,
            nickname: username,
            bio: '',
            password: hashPassword(username, password),
            ncutCoins: DEFAULT_COINS,
            currentSkinItemId: null,
            backpackCapacity: DEFAULT_BACKPACK_CAPACITY,
            dailyTasks: normalizeDailyTasks(),
            achievements: normalizeAchievements(),
            achievementStats: normalizeAchievementStats(),
            inventory: createStarterInventory(),
            createdAt: new Date().toISOString(),
        };
        const result = { user: upsertLocalUser(user) };
        await markDailyTask('login');
        await recordLoginAchievement();
        return result;
    }

    async function signIn(username, password) {
        username = username.trim();
        if (supabase) {
            const user = await getSupabaseUserByName(username, true);
            if (!user || user.password_hash !== hashPassword(username, password)) {
                throw new Error('用户名或密码错误');
            }
            await ensureStarterInventory(user.id);
            local.db.currentUserId = user.id;
            saveLocalDb();
            local.currentUser = sanitizeUser(user);
            await ensureNicknameField();
            await markDailyTask('login');
            await recordLoginAchievement();
            return { user: local.currentUser };
        }

        const user = getLocalUserByName(username);
        if (!user || user.password !== hashPassword(username, password)) {
            throw new Error('用户名或密码错误');
        }
        user.inventory = user.inventory || createStarterInventory();
        const result = { user: upsertLocalUser(user) };
        await ensureNicknameField();
        await markDailyTask('login');
        await recordLoginAchievement();
        return result;
    }

    async function signOut() {
        local.db.currentUserId = null;
        local.currentUser = null;
        saveLocalDb();
    }

    async function init() {
        if (!localStorage.getItem('ncut_survival_rank_cleared_v1')) {
            local.db.runs = (local.db.runs || []).filter(run => run.mode !== 'survival');
            saveLocalDb();
            localStorage.setItem('ncut_survival_rank_cleared_v1', '1');
        }

        if (supabase) {
            if (local.db.currentUserId) {
                const { data, error } = await supabase
                    .from('users')
                    .select(USER_SELECT_COLUMNS)
                    .eq('id', local.db.currentUserId)
                    .maybeSingle();
                if (!error && data) {
                    local.currentUser = sanitizeUser(data);
                    await ensureNicknameField();
                    await markDailyTask('login');
                    await recordLoginAchievement();
                } else {
                    local.db.currentUserId = null;
                    saveLocalDb();
                }
            }
            return { usingSupabase: true, configured: true };
        }

        const user = local.db.users[local.db.currentUserId];
        local.currentUser = sanitizeUser(user);
        if (local.currentUser) {
            await ensureNicknameField();
            await markDailyTask('login');
            await recordLoginAchievement();
        }
        return { usingSupabase: false, configured: false };
    }

    async function getSupabaseUserByName(username, includePassword = false) {
        const columns = includePassword
            ? `password_hash, ${USER_SELECT_COLUMNS}`
            : USER_SELECT_COLUMNS;
        const { data, error } = await supabase
            .from('users')
            .select(columns)
            .eq('username', username)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
    }

    async function ensureStarterInventory(userId) {
        if (!supabase) return;
        const existing = await supabase
            .from('inventories')
            .select('item_id')
            .eq('user_id', userId)
            .limit(1);
        if (!existing.error && existing.data && existing.data.length > 0) return;
        const rows = Object.entries(createStarterInventory()).map(([item_id, quantity]) => ({
            user_id: userId,
            item_id,
            quantity,
        }));
        await supabase.from('inventories').upsert(rows, { onConflict: 'user_id,item_id' });
    }

    function getUser() {
        return local.currentUser;
    }

    function isLoggedIn() {
        return Boolean(local.currentUser);
    }

    async function refreshProfile() {
        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('users')
                .select(USER_SELECT_COLUMNS)
                .eq('id', local.currentUser.id)
                .single();
            if (error) throw new Error(error.message);
            local.currentUser = sanitizeUser(data);
            return local.currentUser;
        }
        local.currentUser = sanitizeUser(local.db.users[local.db.currentUserId]);
        return local.currentUser;
    }

    async function getInventory() {
        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('inventories')
                .select('item_id, quantity')
                .eq('user_id', local.currentUser.id)
                .gt('quantity', 0);
            if (error) throw new Error(error.message);
            return normalizeInventory(Object.fromEntries(data.map(row => [row.item_id, row.quantity])));
        }
        const user = requireLocalUser();
        return normalizeInventory(user.inventory || {});
    }

    function normalizeInventory(inventoryMap) {
        return Object.entries(inventoryMap)
            .filter(([, quantity]) => quantity > 0)
            .map(([itemId, quantity]) => ({
                item: assets.getItemById(itemId),
                itemId,
                quantity,
            }))
            .filter(entry => entry.item);
    }

    async function setCoins(nextCoins) {
        nextCoins = Math.max(0, Math.floor(nextCoins));
        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('users')
                .update({ ncut_coins: nextCoins, updated_at: new Date().toISOString() })
                .eq('id', local.currentUser.id)
                .select(USER_SELECT_COLUMNS)
                .single();
            if (error) throw new Error(error.message);
            local.currentUser = sanitizeUser(data);
            return local.currentUser;
        }
        const user = requireLocalUser();
        user.ncutCoins = nextCoins;
        saveLocalDb();
        local.currentUser = sanitizeUser(user);
        return local.currentUser;
    }

    async function saveDailyTasksState(nextState) {
        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('users')
                .update({ daily_tasks: nextState, updated_at: new Date().toISOString() })
                .eq('id', local.currentUser.id)
                .select(USER_SELECT_COLUMNS)
                .single();
            if (error) throw new Error(error.message);
            local.currentUser = sanitizeUser(data);
            return nextState;
        }
        const user = requireLocalUser();
        user.dailyTasks = nextState;
        saveLocalDb();
        local.currentUser = sanitizeUser(user);
        return nextState;
    }

    async function getDailyTasks() {
        const profile = await refreshProfile();
        const state = normalizeDailyTasks(profile.dailyTasks);
        const changed = JSON.stringify(state) !== JSON.stringify(profile.dailyTasks);
        if (changed) await saveDailyTasksState(state);
        return DAILY_TASKS.map(task => ({
            ...task,
            completed: state.tasks[task.id].completed,
            claimed: state.tasks[task.id].claimed,
            progress: task.target ? (state.tasks[task.id].progress || 0) : undefined,
        }));
    }

    async function recordSurvivalDailyTasks({ seconds = 0, kills = 0 } = {}) {
        if (!local.currentUser) return;

        const state = normalizeDailyTasks(local.currentUser.dailyTasks);
        let changed = false;

        const surviveTask = DAILY_TASKS.find(task => task.id === 'survival_30s');
        const surviveEntry = state.tasks.survival_30s;
        if (surviveTask && surviveEntry && !surviveEntry.completed) {
            const runSeconds = Math.max(0, Math.floor(seconds));
            if (runSeconds > (surviveEntry.progress || 0)) {
                surviveEntry.progress = runSeconds;
                changed = true;
            }
            if (runSeconds >= surviveTask.target) {
                surviveEntry.completed = true;
                surviveEntry.progress = surviveTask.target;
                changed = true;
            }
        }

        const killTask = DAILY_TASKS.find(task => task.id === 'survival_10_kills');
        const killEntry = state.tasks.survival_10_kills;
        if (killTask && killEntry && !killEntry.completed) {
            const runKills = Math.max(0, Math.floor(kills));
            if (runKills > 0) {
                killEntry.progress = (killEntry.progress || 0) + runKills;
                changed = true;
            }
            if (killEntry.progress >= killTask.target) {
                killEntry.completed = true;
                killEntry.progress = killTask.target;
                changed = true;
            }
        }

        if (changed) await saveDailyTasksState(state);
    }

    async function markDailyTask(taskId) {
        if (!local.currentUser || !DAILY_TASKS.some(task => task.id === taskId)) return;
        const state = normalizeDailyTasks(local.currentUser.dailyTasks);
        if (state.tasks[taskId].completed) return;
        state.tasks[taskId].completed = true;
        await saveDailyTasksState(state);
    }

    async function claimDailyTask(taskId) {
        const task = DAILY_TASKS.find(item => item.id === taskId);
        if (!task) throw new Error('任务不存在');
        const profile = await refreshProfile();
        const state = normalizeDailyTasks(profile.dailyTasks);
        const current = state.tasks[taskId];
        if (!current.completed) throw new Error('任务尚未完成');
        if (current.claimed) throw new Error('奖励已领取');
        current.claimed = true;
        await saveDailyTasksState(state);
        const latest = await refreshProfile();
        await setCoins(latest.ncutCoins + task.reward);
        return getDailyTasks();
    }

    async function saveAchievementState(achievements, stats) {
        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('users')
                .update({ achievements, achievement_stats: stats, updated_at: new Date().toISOString() })
                .eq('id', local.currentUser.id)
                .select(USER_SELECT_COLUMNS)
                .single();
            if (error) throw new Error(error.message);
            local.currentUser = sanitizeUser(data);
            return;
        }
        const user = requireLocalUser();
        user.achievements = achievements;
        user.achievementStats = stats;
        saveLocalDb();
        local.currentUser = sanitizeUser(user);
    }

    async function getAchievements() {
        const profile = await refreshProfile();
        const achievements = normalizeAchievements(profile.achievements);
        const stats = normalizeAchievementStats(profile.achievementStats);
        return ACHIEVEMENTS.map(item => ({
            ...item,
            unlocked: Boolean(achievements.unlocked[item.id]),
            unlockedAt: achievements.unlocked[item.id] || null,
            progress: getAchievementProgress(item.id, stats),
        }));
    }

    function getAchievementProgress(id, stats) {
        const progressMap = {
            survival_1000_kills: `${Math.min(stats.survivalKills, 1000)} / 1000`,
            survival_100_medkits: `${Math.min(stats.survivalMedkits, 100)} / 100`,
            goldrush_1000_gems: `${Math.min(stats.goldrushGems, 1000)} / 1000`,
            collectible_1: `${Math.min(stats.goldrushCollectibles, 1)} / 1`,
            goldrush_100_extracts: `${Math.min(stats.goldrushExtracts, 100)} / 100`,
            login_100_days: `${Math.min(stats.loginDays, 100)} / 100`,
        };
        return progressMap[id] || '';
    }

    async function recordLoginAchievement() {
        const profile = await refreshProfile();
        const achievements = normalizeAchievements(profile.achievements);
        const stats = normalizeAchievementStats(profile.achievementStats);
        const today = getChinaDateKey();
        if (stats.lastLoginDate !== today) {
            stats.lastLoginDate = today;
            stats.loginDays += 1;
        }
        if (stats.loginDays >= 100) unlockAchievement(achievements, 'login_100_days');
        await saveAchievementState(achievements, stats);
    }

    async function recordVisitAchievement() {
        const profile = await refreshProfile();
        const achievements = normalizeAchievements(profile.achievements);
        const stats = normalizeAchievementStats(profile.achievementStats);
        unlockAchievement(achievements, 'visit_1');
        await saveAchievementState(achievements, stats);
    }

    async function recordSurvivalAchievements(result) {
        const profile = await refreshProfile();
        const achievements = normalizeAchievements(profile.achievements);
        const stats = normalizeAchievementStats(profile.achievementStats);
        stats.survivalKills += result.kills || 0;
        stats.survivalMedkits += result.medkitsUsed || 0;
        if ((result.seconds || 0) >= 60) unlockAchievement(achievements, 'survival_60');
        if ((result.seconds || 0) >= 180) unlockAchievement(achievements, 'survival_180');
        if ((result.kills || 0) >= 20) unlockAchievement(achievements, 'survival_20_kills');
        if ((result.kills || 0) >= 50) unlockAchievement(achievements, 'survival_50_kills');
        if (stats.survivalKills >= 1000) unlockAchievement(achievements, 'survival_1000_kills');
        if (stats.survivalMedkits >= 100) unlockAchievement(achievements, 'survival_100_medkits');
        await saveAchievementState(achievements, stats);
    }

    async function recordGoldrushAchievements(result) {
        if (result.status !== 'success') return;
        const profile = await refreshProfile();
        const achievements = normalizeAchievements(profile.achievements);
        const stats = normalizeAchievementStats(profile.achievementStats);
        const lootedItems = result.lootedItems || [];
        const gemCount = lootedItems.filter(itemId => assets.getItemById(itemId)?.type === 'gem').length;
        const collectibleCount = lootedItems.filter(itemId => assets.getItemById(itemId)?.type === 'collectible').length;
        stats.goldrushExtracts += 1;
        stats.goldrushGems += gemCount;
        stats.goldrushCollectibles += collectibleCount;
        if ((result.durationSeconds || Infinity) <= 60) unlockAchievement(achievements, 'goldrush_fast_extract');
        if ((result.health || 0) > 80) unlockAchievement(achievements, 'goldrush_high_health');
        if (lootedItems.length >= 10) unlockAchievement(achievements, 'goldrush_full_load');
        if ((result.killCount || 0) === 0) unlockAchievement(achievements, 'goldrush_no_kill');
        if (stats.goldrushGems >= 1000) unlockAchievement(achievements, 'goldrush_1000_gems');
        if (stats.goldrushCollectibles >= 1) unlockAchievement(achievements, 'collectible_1');
        if (stats.goldrushExtracts >= 100) unlockAchievement(achievements, 'goldrush_100_extracts');
        await saveAchievementState(achievements, stats);
    }

    async function addInventoryItem(itemId, amount = 1) {
        if (amount === 0) return getInventory();
        if (supabase && local.currentUser) {
            const inventory = await getInventory();
            const current = inventory.find(entry => entry.itemId === itemId)?.quantity || 0;
            const next = Math.max(0, current + amount);
            const row = { user_id: local.currentUser.id, item_id: itemId, quantity: next };
            const { error } = await supabase
                .from('inventories')
                .upsert(row, { onConflict: 'user_id,item_id' });
            if (error) throw new Error(error.message);
            return getInventory();
        }
        const user = requireLocalUser();
        user.inventory = user.inventory || {};
        user.inventory[itemId] = Math.max(0, (user.inventory[itemId] || 0) + amount);
        if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
        saveLocalDb();
        return getInventory();
    }

    async function buyItem(itemId) {
        const item = assets.getItemById(itemId);
        if (!item) throw new Error('物品不存在');
        if (item.type === 'gem') throw new Error('宝石不能在商城购买');
        const profile = await refreshProfile();
        const inventory = await getInventory();
        const owned = inventory.some(entry => entry.itemId === itemId && entry.quantity > 0);
        if (item.type === 'skin' && owned) throw new Error('皮肤已解锁');
        if ((item.type === 'skill_active' || item.type === 'skill_passive') && owned) throw new Error('技能已拥有');
        if (profile.ncutCoins < item.price) throw new Error('货币不足');
        await setCoins(profile.ncutCoins - item.price);
        if (item.type === 'capacity') {
            await increaseBackpackCapacity(item.capacityBonus || 50);
            return { profile: await refreshProfile(), inventory: await getInventory() };
        }
        if (item.type === 'rename_card') {
            await addInventoryItem(itemId, 1);
            return { profile: await refreshProfile(), inventory: await getInventory() };
        }
        if (item.type === 'skill_active' || item.type === 'skill_passive') {
            await addInventoryItem(itemId, 1);
            return { profile: await refreshProfile(), inventory: await getInventory() };
        }
        if (item.type !== 'skin') {
            const usage = getInventoryUsageFromEntries(inventory);
            if (usage >= profile.backpackCapacity) {
                await setCoins(profile.ncutCoins);
                throw new Error('背包容量不足，请先购买背包扩容卡');
            }
        }
        await addInventoryItem(itemId, 1);
        return { profile: await refreshProfile(), inventory: await getInventory() };
    }

    async function increaseBackpackCapacity(amount) {
        const profile = await refreshProfile();
        const nextCapacity = (profile.backpackCapacity || DEFAULT_BACKPACK_CAPACITY) + amount;
        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('users')
                .update({ backpack_capacity: nextCapacity, updated_at: new Date().toISOString() })
                .eq('id', local.currentUser.id)
                .select(USER_SELECT_COLUMNS)
                .single();
            if (error) throw new Error(error.message);
            local.currentUser = sanitizeUser(data);
            return local.currentUser;
        }
        const user = requireLocalUser();
        user.backpackCapacity = nextCapacity;
        saveLocalDb();
        local.currentUser = sanitizeUser(user);
        return local.currentUser;
    }

    async function useRenameCard(nickname) {
        nickname = validateNickname(nickname);
        const inventory = await getInventory();
        const owned = inventory.find(entry => entry.itemId === 'item_rename_card')?.quantity || 0;
        if (owned <= 0) throw new Error('没有改名卡，请先在商城购买');
        await addInventoryItem('item_rename_card', -1);
        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('users')
                .update({ nickname, updated_at: new Date().toISOString() })
                .eq('id', local.currentUser.id)
                .select(USER_SELECT_COLUMNS)
                .single();
            if (error) throw new Error(error.message);
            local.currentUser = sanitizeUser(data);
            return local.currentUser;
        }
        const user = requireLocalUser();
        user.nickname = nickname;
        saveLocalDb();
        local.currentUser = sanitizeUser(user);
        return local.currentUser;
    }

    async function setBio(bio) {
        bio = validateBio(bio);
        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('users')
                .update({ bio, updated_at: new Date().toISOString() })
                .eq('id', local.currentUser.id)
                .select(USER_SELECT_COLUMNS)
                .single();
            if (error) throw new Error(error.message);
            local.currentUser = sanitizeUser(data);
            return local.currentUser;
        }
        const user = requireLocalUser();
        user.bio = bio;
        saveLocalDb();
        local.currentUser = sanitizeUser(user);
        return local.currentUser;
    }

    async function sellItem(itemId, amount = 1) {
        const item = assets.getItemById(itemId);
        if (!item) throw new Error('物品不存在');
        if (item.type === 'collectible' || item.type === 'skin' || item.type === 'capacity' || item.type === 'rename_card') {
            throw new Error('该物品不可出售');
        }
        const inventory = await getInventory();
        const current = inventory.find(entry => entry.itemId === itemId)?.quantity || 0;
        if (current < amount) throw new Error('背包数量不足');
        
        let sellPrice = 0;
        if (item.type === 'gem') {
            sellPrice = item.value;
        } else if (item.price) {
            sellPrice = Math.floor(item.price * 0.2);
        }
        
        if (sellPrice <= 0) throw new Error('该物品无法出售');
        
        const profile = await refreshProfile();
        await addInventoryItem(itemId, -amount);
        await setCoins(profile.ncutCoins + sellPrice * amount);
        return { profile: await refreshProfile(), inventory: await getInventory() };
    }

    async function setCurrentSkin(itemId) {
        if (itemId === 'skin_default') itemId = null;
        if (itemId) {
            const inventory = await getInventory();
            if (!inventory.some(entry => entry.itemId === itemId && entry.quantity > 0)) {
                throw new Error('皮肤未解锁');
            }
        }

        if (supabase && local.currentUser) {
            const { data, error } = await supabase
                .from('users')
                .update({ current_skin_item_id: itemId, updated_at: new Date().toISOString() })
                .eq('id', local.currentUser.id)
                .select(USER_SELECT_COLUMNS)
                .single();
            if (error) throw new Error(error.message);
            local.currentUser = sanitizeUser(data);
            return local.currentUser;
        }
        const user = requireLocalUser();
        user.currentSkinItemId = itemId;
        saveLocalDb();
        local.currentUser = sanitizeUser(user);
        return local.currentUser;
    }

    async function recordRun(status, carriedItems, lootedItems) {
        if (supabase && local.currentUser) {
            await supabase.from('game_runs').insert({
                user_id: local.currentUser.id,
                mode: 'goldrush',
                status,
                carried_items: carriedItems,
                looted_items: lootedItems,
                finished_at: new Date().toISOString(),
            });
            return;
        }
        local.db.runs.push({
            id: Date.now().toString(36),
            userId: local.currentUser?.id,
            status,
            carriedItems,
            lootedItems,
            finishedAt: new Date().toISOString(),
        });
        saveLocalDb();
    }

    async function clearSurvivalRankings() {
        if (supabase) {
            const { error } = await supabase.from('game_runs').delete().eq('mode', 'survival');
            if (error) throw new Error(error.message);
        }
        local.db.runs = (local.db.runs || []).filter(run => run.mode !== 'survival');
        saveLocalDb();
    }

    async function recordSurvivalRun(seconds, kills, meta = {}) {
        const {
            subtype = 'solo',
            teamMembers = null,
            roomId = null,
        } = meta;
        const payload = {
            user_id: local.currentUser?.id,
            mode: 'survival',
            status: 'finished',
            survival_seconds: seconds,
            kills,
            survival_subtype: subtype,
            team_members: teamMembers,
            room_id: roomId,
            finished_at: new Date().toISOString(),
        };
        if (supabase && local.currentUser) {
            await supabase.from('game_runs').insert(payload);
            return;
        }
        local.db.runs.push({
            id: Date.now().toString(36),
            userId: local.currentUser?.id,
            mode: 'survival',
            status: 'finished',
            survivalSeconds: seconds,
            kills,
            survivalSubtype: subtype,
            teamMembers,
            roomId,
            finishedAt: new Date().toISOString(),
        });
        saveLocalDb();
    }

    async function applyRunResult(result) {
        const { status, carriedItems = [], lootedItems = [] } = result;
        if (status === 'success') {
            for (const itemId of lootedItems) {
                await addInventoryItem(itemId, 1);
            }
        } else {
            for (const itemId of carriedItems) {
                await addInventoryItem(itemId, -1);
            }
        }
        await recordRun(status, carriedItems, lootedItems);
        return { profile: await refreshProfile(), inventory: await getInventory() };
    }

    function getInventoryUsageFromEntries(entries) {
        return entries.reduce((sum, entry) => {
            const item = entry.item || assets.getItemById(entry.itemId);
            if (!item || item.type === 'skin' || item.type === 'capacity' || item.type === 'rename_card') return sum;
            return sum + entry.quantity;
        }, 0);
    }

    async function getBackpackUsage() {
        return getInventoryUsageFromEntries(await getInventory());
    }

    function getCollectionValueFromEntries(entries) {
        return entries.reduce((sum, entry) => {
            const item = entry.item || assets.getItemById(entry.itemId);
            if (!item) return sum;
            return sum + (item.collectionValue || 0) * entry.quantity;
        }, 0);
    }

    function aggregateBestSurvivalRuns(runs, displayNameById, subtype = 'solo') {
        const filtered = (runs || []).filter(run => (run.survival_subtype || run.survivalSubtype || 'solo') === subtype);
        if (subtype === 'solo') {
            const bestByUser = new Map();
            filtered.forEach(run => {
                const userId = run.userId || run.user_id;
                if (!userId) return;
                const value = run.survival_seconds ?? run.survivalSeconds ?? 0;
                const kills = run.kills ?? 0;
                const existing = bestByUser.get(userId);
                if (!existing || value > existing.value || (value === existing.value && kills > existing.kills)) {
                    bestByUser.set(userId, {
                        userId,
                        nickname: displayNameById[userId] || userId || '玩家',
                        value,
                        kills,
                    });
                }
            });
            return [...bestByUser.values()]
                .sort((a, b) => b.value - a.value || b.kills - a.kills)
                .slice(0, 100);
        }

        const bestByTeam = new Map();
        filtered.forEach(run => {
            const members = run.team_members || run.teamMembers || [];
            if (!members.length) return;
            const teamKey = members.map(member => member.user_id || member.userId).filter(Boolean).sort().join('|');
            if (!teamKey) return;
            const value = run.survival_seconds ?? run.survivalSeconds ?? 0;
            const kills = run.kills ?? 0;
            const nickname = members.map(member => member.nickname || displayNameById[member.user_id || member.userId] || '玩家').join('，');
            const existing = bestByTeam.get(teamKey);
            if (!existing || value > existing.value || (value === existing.value && kills > existing.kills)) {
                bestByTeam.set(teamKey, {
                    teamKey,
                    userId: members[0]?.user_id || members[0]?.userId || null,
                    nickname,
                    members,
                    value,
                    kills,
                });
            }
        });
        return [...bestByTeam.values()]
            .sort((a, b) => b.value - a.value || b.kills - a.kills)
            .slice(0, 100);
    }

    async function getRankings() {
        if (supabase) {
            const coinRows = await supabase
                .from('users')
                .select('id, username, nickname, ncut_coins')
                .order('ncut_coins', { ascending: false })
                .limit(100);
            const invRows = await supabase
                .from('inventories')
                .select('user_id, item_id, quantity')
                .gt('quantity', 0);
            const profileRows = await supabase
                .from('users')
                .select('id, username, nickname');
            const displayNameById = Object.fromEntries((profileRows.data || []).map(row => [
                row.id,
                (row.nickname || row.username || '玩家').trim(),
            ]));
            const collectionValues = {};
            if (!invRows.error) {
                invRows.data.forEach(row => {
                    const item = assets.getItemById(row.item_id);
                    if (!item?.collectionValue) return;
                    collectionValues[row.user_id] = (collectionValues[row.user_id] || 0) + item.collectionValue * row.quantity;
                });
            }
            const survivalRows = await supabase
                .from('game_runs')
                .select('user_id, survival_seconds, kills, survival_subtype, team_members')
                .eq('mode', 'survival');
            return {
                coins: (coinRows.data || []).map(row => ({
                    userId: row.id,
                    nickname: (row.nickname || row.username || '玩家').trim(),
                    value: row.ncut_coins,
                })),
                skins: Object.entries(collectionValues)
                    .map(([userId, value]) => ({
                        userId,
                        nickname: displayNameById[userId] || userId,
                        value,
                    }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 100),
                survivalSolo: aggregateBestSurvivalRuns(survivalRows.data || [], displayNameById, 'solo'),
                survivalDuo: aggregateBestSurvivalRuns(survivalRows.data || [], displayNameById, 'duo'),
                survivalSquad: aggregateBestSurvivalRuns(survivalRows.data || [], displayNameById, 'squad'),
            };
        }

        const users = Object.values(local.db.users);
        const displayNameById = Object.fromEntries(users.map(user => [
            user.id,
            getDisplayName(user),
        ]));
        return {
            coins: users
                .map(user => ({ userId: user.id, nickname: getDisplayName(user), value: user.ncutCoins || 0 }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 100),
            skins: users
                .map(user => ({
                    userId: user.id,
                    nickname: getDisplayName(user),
                    value: getCollectionValueFromEntries(normalizeInventory(user.inventory || {})),
                }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 100),
            survivalSolo: aggregateBestSurvivalRuns(
                (local.db.runs || []).filter(run => run.mode === 'survival'),
                displayNameById,
                'solo',
            ),
            survivalDuo: aggregateBestSurvivalRuns(
                (local.db.runs || []).filter(run => run.mode === 'survival'),
                displayNameById,
                'duo',
            ),
            survivalSquad: aggregateBestSurvivalRuns(
                (local.db.runs || []).filter(run => run.mode === 'survival'),
                displayNameById,
                'squad',
            ),
        };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        store: {
            ...(global.NCUTMap.store || {}),
            init,
            signUp,
            signIn,
            signOut,
            getUser,
            isLoggedIn,
            getDisplayName,
            refreshProfile,
            getInventory,
            buyItem,
            sellItem,
            useRenameCard,
            setBio,
            setCurrentSkin,
            addInventoryItem,
            applyRunResult,
            recordSurvivalRun,
            getDailyTasks,
            markDailyTask,
            claimDailyTask,
            recordSurvivalDailyTasks,
            getAchievements,
            recordVisitAchievement,
            recordSurvivalAchievements,
            recordGoldrushAchievements,
            getBackpackUsage,
            getInventoryUsageFromEntries,
            getCollectionValueFromEntries,
            getRankings,
            clearSurvivalRankings,
            usingSupabase: () => Boolean(supabase),
        },
    };
})(window);
