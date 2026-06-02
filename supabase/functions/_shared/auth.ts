import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export function getSupabaseUrl() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  if (!url) throw new Error("Missing SUPABASE_URL");
  return url;
}

export function getAnonKey() {
  const key = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!key) throw new Error("Missing SUPABASE_ANON_KEY");
  return key;
}

export function getServiceRoleKey() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

export async function requireAuthUser(req: Request) {
  const supabaseUrl = getSupabaseUrl();
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ||
    req.headers.get("apikey") ||
    "";
  if (!anonKey) {
    return { ok: false as const, reason: "服务端缺少 apikey，无法校验登录态" };
  }
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) {
    return { ok: false as const, reason: "缺少登录信息，请先邮箱登录" };
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { authorization: authHeader } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id) {
    return { ok: false as const, reason: "登录已失效，请重新邮箱登录" };
  }
  return { ok: true as const, userId: data.user.id };
}

export function adminClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

