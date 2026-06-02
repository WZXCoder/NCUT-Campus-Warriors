import { corsHeaders } from "../_shared/cors.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return json(410, {
    error:
      "此注册接口已弃用：请改用 Supabase Auth 邮箱注册（并在验证后调用 create-profile / link-legacy）",
  });
});

