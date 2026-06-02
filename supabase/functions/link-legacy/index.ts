import { corsHeaders } from "../_shared/cors.ts";
import { adminClient, requireAuthUser } from "../_shared/auth.ts";

type Body = {
  username?: string;
  password?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function hashPassword(username: string, password: string) {
  const utf8 = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (let i = 0; i < utf8.length; i++) binary += String.fromCharCode(utf8[i]);
  return btoa(binary);
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
    const username = (body.username || "").trim();
    const password = body.password || "";
    if (username.length < 2) return json(400, { error: "请输入旧用户名" });
    if (password.length < 6) return json(400, { error: "请输入旧密码" });

    const admin = adminClient();

    const { data: already, error: alreadyErr } = await admin
      .from("users")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();
    if (alreadyErr) {
      return json(500, { error: `读取用户失败：${alreadyErr.message}` });
    }
    if (already?.id) return json(200, { user: already });

    const { data: legacy, error: legacyErr } = await admin
      .from("users")
      .select("id, username, password_hash, auth_user_id")
      .eq("username", username)
      .maybeSingle();
    if (legacyErr) {
      return json(500, { error: `读取旧账号失败：${legacyErr.message}` });
    }
    if (!legacy?.id) return json(403, { error: "旧账号不存在" });
    if (legacy.auth_user_id) return json(409, { error: "该旧账号已绑定邮箱" });

    const expected = hashPassword(username, password);
    if (legacy.password_hash !== expected) {
      return json(403, { error: "旧用户名或密码错误" });
    }

    const { data: linked, error: linkErr } = await admin
      .from("users")
      .update({ auth_user_id: auth.user.id, updated_at: new Date().toISOString() })
      .eq("id", legacy.id)
      .is("auth_user_id", null)
      .select("*")
      .single();
    if (linkErr) {
      return json(500, { error: `绑定失败：${linkErr.message}` });
    }

    return json(200, { user: linked });
  } catch (e) {
    return json(500, {
      error: `link-legacy 异常：${e instanceof Error ? e.message : String(e)}`,
    });
  }
});
