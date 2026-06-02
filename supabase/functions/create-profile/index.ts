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

function usernameFromEmail(email: string) {
  const local = (email.split("@")[0] || "player").replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, "");
  return local.length >= 2 ? local.slice(0, 20) : `player${Date.now().toString(36).slice(-6)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

    const auth = await requireAuthUser(req);
    if (!auth.ok) return json(401, { error: auth.reason });

    const body = (await req.json().catch(() => ({}))) as Body;
    let username = normalizeUsername(body.username || "");
    if (username.length < 2) {
      const meta = (auth.user.user_metadata?.username as string) || "";
      username = normalizeUsername(meta);
    }
    if (username.length < 2 && auth.user.email) {
      username = usernameFromEmail(auth.user.email);
    }
    if (username.length < 2) {
      return json(400, { error: "用户名至少需要2个字符" });
    }

    const admin = adminClient();

    const { data: existing, error: existingErr } = await admin
      .from("users")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();
    if (existingErr) {
      return json(500, { error: `读取用户失败：${existingErr.message}` });
    }
    if (existing?.id) return json(200, { user: existing });

    const { data: byName } = await admin
      .from("users")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (byName?.id) {
      username = `${username}_${auth.user.id.slice(0, 6)}`;
    }

    const { data: user, error: createErr } = await admin
      .from("users")
      .insert({
        auth_user_id: auth.user.id,
        username,
        nickname: username,
        bio: "",
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
    if (createErr) {
      return json(500, { error: `创建档案失败：${createErr.message}` });
    }

    return json(200, { user });
  } catch (e) {
    return json(500, {
      error: `create-profile 异常：${e instanceof Error ? e.message : String(e)}`,
    });
  }
});
