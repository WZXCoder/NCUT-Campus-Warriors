import { corsHeaders } from "../_shared/cors.ts";
import { adminClient, requireAuthUser } from "../_shared/auth.ts";

type Body = {
  username?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function normalizeUsername(u: string) {
  return u.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const auth = await requireAuthUser(req);
  if (!auth.ok) return json(401, { error: auth.reason });

  const body = (await req.json().catch(() => ({}))) as Body;
  const username = normalizeUsername(body.username || "");
  if (username.length < 2) return json(400, { error: "用户名至少需要2个字符" });

  const admin = adminClient();

  // 已存在映射：直接返回
  const { data: existing, error: existingErr } = await admin
    .from("users")
    .select("*")
    .eq("auth_user_id", auth.userId)
    .maybeSingle();
  if (existingErr) return json(500, { error: "读取用户失败" });
  if (existing?.id) return json(200, { user: existing });

  // 用户名唯一性
  const { data: byName, error: byNameErr } = await admin
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (byNameErr) return json(500, { error: "校验用户名失败" });
  if (byName?.id) return json(409, { error: "用户名已存在" });

  const { data: user, error: createErr } = await admin
    .from("users")
    .insert({
      auth_user_id: auth.userId,
      username,
      nickname: username,
      bio: "",
      // 兼容旧逻辑：Auth 用户不再使用该字段登录，这里写一个占位，避免 NOT NULL 约束失败
      password_hash: "__AUTH__",
      ncut_coins: 3000,
      current_skin_item_id: null,
      backpack_capacity: 50,
      daily_tasks: {},
      achievements: {},
      achievement_stats: {},
    })
    .select("*")
    .single();
  if (createErr) return json(500, { error: "创建档案失败" });

  return json(200, { user });
});

