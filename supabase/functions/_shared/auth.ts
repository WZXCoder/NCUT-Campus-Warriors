import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export function getSupabaseUrl() {
  return (
    Deno.env.get("SUPABASE_URL") ||
    Deno.env.get("PROJECT_URL") ||
    ""
  );
}

export function getServiceRoleKey() {
  return (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") ||
    ""
  );
}

export function getAnonKey(req?: Request) {
  return (
    Deno.env.get("SUPABASE_ANON_KEY") ||
    req?.headers.get("apikey") ||
    ""
  );
}

export function adminClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "服务端缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（Edge Function 环境变量未就绪）",
    );
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAuthUser(req: Request) {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getAnonKey(req);
  if (!supabaseUrl || !anonKey) {
    return { ok: false as const, reason: "服务端配置不完整" };
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false as const, reason: "缺少登录信息，请先邮箱登录" };
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id) {
    return {
      ok: false as const,
      reason: error?.message || "登录已失效，请重新邮箱登录",
    };
  }
  return { ok: true as const, user: data.user };
}
