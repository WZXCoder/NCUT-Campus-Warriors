(function(global) {
    function getRuntimeConfig() {
        const cfg = global.NCUT_RUNTIME_CONFIG || {};
        return {
            SUPABASE_URL: cfg.SUPABASE_URL || '',
            SUPABASE_ANON_KEY: cfg.SUPABASE_ANON_KEY || '',
        };
    }

    let sharedClient = null;

    function hasConfig() {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = getRuntimeConfig();
        return (
            SUPABASE_URL &&
            SUPABASE_ANON_KEY &&
            !SUPABASE_URL.includes('__SUPABASE_URL__') &&
            !SUPABASE_ANON_KEY.includes('__SUPABASE_ANON_KEY__') &&
            global.supabase
        );
    }

    function createClient() {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = getRuntimeConfig();
        if (!hasConfig()) return null;
        if (!sharedClient) {
            if (SUPABASE_ANON_KEY.startsWith('sb_publishable_')) {
                console.warn(
                    '[NCUT] 当前使用 sb_publishable_ key。若邮箱注册/登录失败，请在帽子云改用 Supabase 控制台 API 页里的 legacy anon key（以 eyJ 开头）。',
                );
            }
            sharedClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                },
                realtime: {
                    params: {
                        eventsPerSecond: 20,
                    },
                },
            });
        }
        return sharedClient;
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        supabaseConfig: {
            getRuntimeConfig,
            hasConfig,
            createClient,
        },
    };
})(window);
