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
            sharedClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
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
