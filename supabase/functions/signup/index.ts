import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

type SignupBody = {
  username?: string;
  password?: string;
  turnstileToken?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function getIp(req: Request) {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "0.0.0.0";
  return xff.split(",")[0]?.trim() || "0.0.0.0";
}

function hourBucket(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  return `${y}${m}${d}${h}`;
}

async function verifyTurnstile(token: string, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  if (!secret) return { ok: false, reason: "服务端未配置 TURNSTILE_SECRET_KEY" };
  if (!token) return { ok: false, reason: "缺少 turnstileToken" };

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  form.set("remoteip", ip);

  const resp = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form },
  );
  const data = (await resp.json().catch(() => null)) as
    | { success?: boolean; ["error-codes"]?: string[] }
    | null;
  if (!data?.success) {
    const codes = Array.isArray(data?.["error-codes"])
      ? data?.["error-codes"].join(",")
      : "unknown";
    return { ok: false, reason: `安全验证失败（${codes}）` };
  }
  return { ok: true as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "服务端未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
  }

  const ip = getIp(req);
  const body = (await req.json().catch(() => ({}))) as SignupBody;
  const username = (body.username || "").trim();
  const password = body.password || "";
  const turnstileToken = (body.turnstileToken || "").trim();

  if (username.length < 2) return json(400, { error: "用户名至少需要2个字符" });
  if (password.length < 6) return json(400, { error: "密码至少需要6位" });

  const ts = await verifyTurnstile(turnstileToken, ip);
  if (!ts.ok) return json(403, { error: ts.reason });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // IP 限流：同一 IP 每小时最多 5 次注册
  const bucket = `${ip}:${hourBucket()}`;
  const hourStart = new Date();
  hourStart.setUTCMinutes(0, 0, 0);

  const { data: limitRow, error: limitErr } = await admin
    .from("signup_rate_limits")
    .select("bucket,count")
    .eq("bucket", bucket)
    .maybeSingle();
  if (limitErr) return json(500, { error: "限流检查失败" });
  const current = limitRow?.count ?? 0;
  if (current >= 5) return json(429, { error: "注册过于频繁，请稍后再试" });

  const { error: upsertErr } = await admin
    .from("signup_rate_limits")
    .upsert(
      {
        bucket,
        ip,
        hour_start: hourStart.toISOString(),
        count: current + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "bucket" },
    );
  if (upsertErr) return json(500, { error: "限流更新失败" });

  // 用户名唯一性
  const { data: exists } = await admin
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (exists?.id) return json(409, { error: "用户名已存在" });

  // 密码哈希：沿用前端 hashPassword(username, password) 的实现（base64(utf8(username:password))）。
  const utf8Bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) binary += String.fromCharCode(utf8Bytes[i]);
  const hash = btoa(binary);

  const { data: user, error: createErr } = await admin
    .from("users")
    .insert({
      username,
      nickname: username,
      bio: "",
      password_hash: hash,
      ncut_coins: 3000,
      current_skin_item_id: null,
      backpack_capacity: 50,
      daily_tasks: {},
      achievements: {},
      achievement_stats: {},
    })
    .select("*")
    .single();
  if (createErr) return json(500, { error: "创建用户失败" });

  return json(200, { user });
});

