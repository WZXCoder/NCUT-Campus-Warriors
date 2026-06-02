(function(global) {
    const DEVICE_KEY = 'ncut_device_id_v1';

    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    }

    async function issueCaptcha() {
        const supabase = global.NCUTMap?.supabaseConfig?.createClient?.();
        if (!supabase) throw new Error('未连接数据库');
        const { data, error } = await supabase.rpc('issue_captcha', {
            p_device_id: getDeviceId(),
        });
        if (error) {
            const msg = error.message || '';
            if (msg.includes('issue_captcha') || msg.includes('Could not find')) {
                throw new Error('请先在 Supabase 按 sql/README.md 执行 01→02→03');
            }
            throw new Error(msg);
        }
        if (!data?.captcha_id || !data?.digits) {
            throw new Error('获取验证码失败');
        }
        return { id: data.captcha_id, digits: String(data.digits) };
    }

    global.NCUTMap = {
        ...global.NCUTMap,
        captcha: {
            getDeviceId,
            issueCaptcha,
        },
    };
})(window);
