/**
 * Supabase 后端压测（只读 + 可选 presence 写入）
 * 用法: node scripts/loadtest-supabase.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !ANON_KEY) {
    console.error('缺少环境变量: SUPABASE_URL / SUPABASE_ANON_KEY');
    console.error('示例: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/loadtest-supabase.mjs');
    process.exit(1);
}

const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
};

async function rest(path, options = {}) {
    const start = performance.now();
    let res;
    try {
        res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
            ...options,
            headers: { ...headers, ...options.headers },
        });
        const text = await res.text();
        let body = text;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            // keep text
        }
        return {
            ok: res.ok,
            status: res.status,
            ms: performance.now() - start,
            body,
        };
    } catch (err) {
        return {
            ok: false,
            status: 0,
            ms: performance.now() - start,
            error: err.message,
        };
    }
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

async function runConcurrent(label, count, fn) {
    const started = performance.now();
    const results = await Promise.all(Array.from({ length: count }, () => fn()));
    const elapsed = performance.now() - started;
    const ok = results.filter(r => r.ok).length;
    const fail = results.length - ok;
    const latencies = results.map(r => r.ms);
    const statuses = {};
    results.forEach(r => {
        const key = r.status || 'ERR';
        statuses[key] = (statuses[key] || 0) + 1;
    });
    return {
        label,
        count,
        ok,
        fail,
        successRate: ((ok / count) * 100).toFixed(1) + '%',
        totalMs: Math.round(elapsed),
        rps: (count / (elapsed / 1000)).toFixed(1),
        p50: percentile(latencies, 50).toFixed(0),
        p95: percentile(latencies, 95).toFixed(0),
        p99: percentile(latencies, 99).toFixed(0),
        statuses,
        sampleError: results.find(r => !r.ok)?.body || results.find(r => !r.ok)?.error,
    };
}

async function fetchSampleUserIds(limit = 20) {
    const r = await rest(`users?select=id,username&limit=${limit}`);
    if (!r.ok || !Array.isArray(r.body)) return [];
    return r.body;
}

async function main() {
    console.log('=== NCUT 校园勇士 Supabase 压测 ===\n');
    console.log('目标:', SUPABASE_URL);
    console.log('时间:', new Date().toISOString(), '\n');

    const health = await rest('users?select=id&limit=1');
    if (!health.ok) {
        console.error('无法连接 Supabase REST API:', health.status, health.body || health.error);
        process.exit(1);
    }
    console.log('连通性: OK (users 查询 latency', health.ms.toFixed(0), 'ms)\n');

    const levels = [10, 25, 50, 100, 200, 300, 500];

    console.log('--- 阶段 A: 模拟登录 (users 按 username 查询) ---');
    const loginResults = [];
    for (const n of levels) {
        const r = await runConcurrent(`login-select x${n}`, n, () =>
            rest('users?select=id,username,nickname,ncut_coins&username=eq.__loadtest_nonexistent__&limit=1')
        );
        loginResults.push(r);
        console.log(formatRow(r));
        if (r.fail > n * 0.05 || r.statuses['429']) break;
        await sleep(500);
    }

    console.log('\n--- 阶段 B: 模拟参观模式 DB 心跳 upsert (优化后, 10s/次) ---');
    const sampleUsers = await fetchSampleUserIds(5);
    const visitHeartbeatResults = [];
    if (!sampleUsers.length) {
        console.log('跳过: 无用户样本，改用轻量查询代替');
        for (const n of [10, 50, 100, 200, 300, 500]) {
            const r = await runConcurrent(`visit-heartbeat-read x${n}`, n, () =>
                rest('player_presence?select=user_id&mode=eq.visit&limit=1')
            );
            visitHeartbeatResults.push(r);
            console.log(formatRow(r));
            if (r.fail > n * 0.05) break;
            await sleep(300);
        }
    } else {
        const uid = sampleUsers[0].id;
        for (const n of [10, 25, 50, 100, 200, 300, 500]) {
            let i = 0;
            const r = await runConcurrent(`visit-heartbeat-upsert x${n}`, n, () => {
                i += 1;
                return rest('player_presence?on_conflict=user_id', {
                    method: 'POST',
                    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify({
                        user_id: uid,
                        mode: 'visit',
                        room_id: null,
                        nickname: `visit_hb_${i}`,
                        x: Math.random() * 500,
                        y: Math.random() * 500,
                        hp: 100,
                        max_hp: 100,
                        status: 'active',
                        updated_at: new Date().toISOString(),
                    }),
                });
            });
            visitHeartbeatResults.push(r);
            console.log(formatRow(r));
            if (r.fail > n * 0.05 || r.statuses['429']) break;
            await sleep(400);
        }
    }

    console.log('\n--- 阶段 B2: 旧参观模式轮询 (对比, 已移除) ---');
    const pollResults = [];
    for (const n of [10, 50, 100, 200]) {
        const r = await runConcurrent(`presence-poll-legacy x${n}`, n, () =>
            rest('player_presence?select=user_id,x,y,updated_at&mode=eq.visit&order=updated_at.desc&limit=50')
        );
        pollResults.push(r);
        console.log(formatRow(r));
        await sleep(300);
    }

    const sampleUsersForUpsert = sampleUsers.length ? sampleUsers : await fetchSampleUserIds(5);
    console.log('\n--- 阶段 C: 模拟 presence 心跳 upsert (摸金/通用) ---');
    if (!sampleUsersForUpsert.length) {
        console.log('跳过: 数据库中无用户样本');
    } else {
        const uid = sampleUsers[0].id;
        const upsertLevels = [10, 25, 50, 100, 200];
        for (const n of upsertLevels) {
            let i = 0;
            const r = await runConcurrent(`presence-upsert x${n}`, n, () => {
                i += 1;
                return rest('player_presence?on_conflict=user_id', {
                    method: 'POST',
                    headers: {
                        Prefer: 'resolution=merge-duplicates,return=minimal',
                    },
                    body: JSON.stringify({
                        user_id: uid,
                        mode: 'visit',
                        room_id: null,
                        nickname: `loadtest_${i}`,
                        x: Math.random() * 1000,
                        y: Math.random() * 1000,
                        hp: 100,
                        max_hp: 100,
                        status: 'active',
                        updated_at: new Date().toISOString(),
                    }),
                });
            });
            console.log(formatRow(r));
            if (r.fail > n * 0.05 || r.statuses['429']) break;
            await sleep(500);
        }
        await rest(`player_presence?user_id=eq.${uid}`, { method: 'DELETE' }).catch(() => {});
    }

    console.log('\n--- 阶段 D: 模拟大厅刷新 (users + inventories 串联) ---');
    const lobbyLevels = [10, 25, 50, 100, 200];
    for (const n of lobbyLevels) {
        const r = await runConcurrent(`lobby-refresh x${n}`, n, async () => {
            const u = await rest('users?select=id,username,ncut_coins&limit=1');
            if (!u.ok || !Array.isArray(u.body) || !u.body[0]) return u;
            const id = u.body[0].id;
            const inv = await rest(`inventories?select=item_id,quantity&user_id=eq.${id}`);
            return { ...inv, ms: u.ms + inv.ms, ok: u.ok && inv.ok };
        });
        console.log(formatRow(r));
        if (r.fail > n * 0.05 || r.statuses['429']) break;
        await sleep(500);
    }

    console.log('\n=== 1000 并发用户估算 ===');
    const maxLogin = loginResults.filter(r => parseFloat(r.successRate) >= 95).pop();
    const maxVisitHb = visitHeartbeatResults.filter(r => parseFloat(r.successRate) >= 95).pop();
    console.log('登录查询峰值(95%+成功):', maxLogin ? `${maxLogin.count} 并发, ${maxLogin.rps} req/s` : '未测到');
    console.log('参观 DB 心跳峰值(95%+成功):', maxVisitHb ? `${maxVisitHb.count} 并发, ${maxVisitHb.rps} req/s` : '未测到');

    const visitPerUser = 1 / 10;
    const visitPerUserLegacy = 2;
    const goldrushPerUser = 1 / 3 + 0.25;
    console.log('\n每用户 REST 估算 (优化后代码):');
    console.log(`  参观模式(新): ~${visitPerUser} req/s (10s DB心跳, 位置走 Realtime Broadcast)`);
    console.log(`  参观模式(旧): ~${visitPerUserLegacy} req/s (1s upsert + 1s poll)`);
    console.log(`  摸金模式: ~${goldrushPerUser.toFixed(2)} req/s (3s DB心跳 + 4s poll) + Realtime 广播`);

    if (maxVisitHb) {
        const maxUsersByVisit = Math.floor(parseFloat(maxVisitHb.rps) / visitPerUser);
        const maxUsersLegacy = pollResults.length
            ? Math.floor(parseFloat(pollResults[pollResults.length - 1]?.rps || 0) / visitPerUserLegacy)
            : 0;
        console.log(`\n按 DB 心跳瓶颈粗算参观模式 simultaneous 上限(新): ~${maxUsersByVisit} 人`);
        if (maxUsersLegacy) {
            console.log(`按轮询瓶颈粗算参观模式 simultaneous 上限(旧): ~${maxUsersLegacy} 人`);
        }
    }
    console.log('\n注意: Realtime WebSocket 连接数、Postgres 连接池、Supabase 套餐限额未在本脚本中压测。');
    console.log('1000 人同时在线通常需要 Pro 套餐 + Realtime 优化 + 房间分片。');
}

function formatRow(r) {
    return [
        r.label.padEnd(22),
        `ok=${r.ok}/${r.count}`,
        `rate=${r.successRate}`,
        `rps=${r.rps}`,
        `p50=${r.p50}ms`,
        `p95=${r.p95}ms`,
        `status=${JSON.stringify(r.statuses)}`,
        r.sampleError ? `err=${JSON.stringify(r.sampleError).slice(0, 80)}` : '',
    ].join(' | ');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
