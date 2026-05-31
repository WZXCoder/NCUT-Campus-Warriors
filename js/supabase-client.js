(function(global) {
    const SUPABASE_URL = 'https://lwybcgloshymklseaysk.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_TwqUBHPZSWtgUzGrfIXFug_vTvyNPQf';

    let sharedClient = null;

    function hasConfig() {
        return (
            SUPABASE_URL &&
            SUPABASE_ANON_KEY &&
            !SUPABASE_URL.includes('YOUR_') &&
            !SUPABASE_ANON_KEY.includes('YOUR_') &&
            global.supabase
        );
    }

    function createClient() {
        if (!hasConfig()) return null;
        if (!sharedClient) {
            sharedClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            hasConfig,
            createClient,
        },
    };
})(window);
