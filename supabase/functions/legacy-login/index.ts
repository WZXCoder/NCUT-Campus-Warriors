import { corsHeaders } from "../_shared/cors.ts";
import { adminClient } from "../_shared/auth.ts";

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
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const body = (await req.json().catch(() => ({}))) as Body;
  const username = (body.username || "").trim();
  const password = body.password || "";
  if (username.length < 2) return json(400, { error: "请输入用户名" });
  if (password.length < 6) return json(400, { error: "请输入密码" });

  const admin = adminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error) return json(500, { error: "读取用户失败" });
  if (!user?.id) return json(403, { error: "用户名或密码错误" });

  const expected = hashPassword(username, password);
  if (user.password_hash !== expected) {
    return json(403, { error: "用户名或密码错误" });
  }

  // 不把 password_hash 回传给前端
  const { password_hash: _ph, ...safeUser } = user as Record<string, unknown>;
  return json(200, { user: safeUser });
});

