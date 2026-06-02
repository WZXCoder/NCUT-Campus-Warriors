-- 03-auth.sql：用户名+密码注册登录（数字验证码 + 限流）
-- 需先执行 01-tables.sql、02-rls.sql

-- ---------- 表 ----------
create table if not exists public.auth_captcha_challenges (
    id uuid primary key default gen_random_uuid(),
    answer_hash text not null,
    device_id text not null default '',
    expires_at timestamptz not null,
    used boolean not null default false,
    created_at timestamptz not null default now()
);
create index if not exists idx_auth_captcha_expires on public.auth_captcha_challenges(expires_at);

create table if not exists public.auth_rate_limits (
    bucket text primary key,
    count integer not null default 0,
    window_start timestamptz not null,
    updated_at timestamptz not null default now()
);

alter table public.auth_captcha_challenges enable row level security;
alter table public.auth_rate_limits enable row level security;

drop policy if exists "auth_captcha service all" on public.auth_captcha_challenges;
create policy "auth_captcha service all" on public.auth_captcha_challenges
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "auth_rate_limits service all" on public.auth_rate_limits;
create policy "auth_rate_limits service all" on public.auth_rate_limits
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ---------- 内部函数（使用 md5，无需 pgcrypto）----------
create or replace function public._auth_captcha_hash(p_id uuid, p_code text)
returns text language sql immutable as $$
  select md5(p_id::text || ':' || trim(p_code) || ':ncut_captcha_v1');
$$;

create or replace function public._auth_check_rate_limit(p_bucket text, p_max integer, p_window_minutes integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.auth_rate_limits%rowtype; v_now timestamptz := now();
begin
  select * into v_row from public.auth_rate_limits where bucket = p_bucket;
  if not found then
    insert into public.auth_rate_limits(bucket, count, window_start, updated_at) values (p_bucket, 1, v_now, v_now);
    return;
  end if;
  if v_row.window_start < v_now - (p_window_minutes || ' minutes')::interval then
    update public.auth_rate_limits set count = 1, window_start = v_now, updated_at = v_now where bucket = p_bucket;
    return;
  end if;
  if v_row.count >= p_max then raise exception '操作过于频繁，请稍后再试'; end if;
  update public.auth_rate_limits set count = v_row.count + 1, updated_at = v_now where bucket = p_bucket;
end; $$;

create or replace function public._auth_verify_captcha(p_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_row public.auth_captcha_challenges%rowtype; v_hash text;
begin
  if p_id is null or trim(p_code) = '' then return false; end if;
  select * into v_row from public.auth_captcha_challenges where id = p_id;
  if not found or v_row.used or v_row.expires_at < now() then return false; end if;
  v_hash := public._auth_captcha_hash(p_id, p_code);
  if v_row.answer_hash is distinct from v_hash then return false; end if;
  update public.auth_captcha_challenges set used = true where id = p_id;
  return true;
end; $$;

create or replace function public._ensure_starter_inventory(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.inventories where user_id = p_user_id limit 1) then return; end if;
  insert into public.inventories (user_id, item_id, quantity) values
    (p_user_id, 'weapon_knife', 1), (p_user_id, 'tool_shovel', 1), (p_user_id, 'tool_boots', 1)
  on conflict (user_id, item_id) do nothing;
end; $$;

-- ---------- 对外 RPC ----------
-- 发验证码：30 次/小时/设备
create or replace function public.issue_captcha(p_device_id text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_code text; v_device text := coalesce(trim(p_device_id), '');
begin
  perform public._auth_check_rate_limit('captcha:' || coalesce(nullif(v_device, ''), 'global'), 30, 60);
  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into public.auth_captcha_challenges(id, answer_hash, device_id, expires_at)
  values (v_id, public._auth_captcha_hash(v_id, v_code), v_device, now() + interval '5 minutes');
  return jsonb_build_object('captcha_id', v_id, 'digits', v_code);
end; $$;
revoke all on function public.issue_captcha(text) from public;
grant execute on function public.issue_captcha(text) to anon, authenticated;

-- 注册：5 次/小时/设备
create or replace function public.auth_register(
    p_username text, p_password text, p_captcha_id uuid, p_captcha_code text, p_device_id text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user public.users%rowtype; v_device text := coalesce(trim(p_device_id), ''); v_expected text;
begin
  perform public._auth_check_rate_limit('register:' || coalesce(nullif(v_device, ''), 'global'), 5, 60);
  if not public._auth_verify_captcha(p_captcha_id, p_captcha_code) then raise exception '验证码错误或已过期'; end if;
  if length(trim(p_username)) < 2 then raise exception '用户名至少需要2个字符'; end if;
  if length(p_password) < 6 then raise exception '密码至少需要6位'; end if;
  if exists (select 1 from public.users where username = trim(p_username)) then raise exception '用户名已存在'; end if;
  v_expected := encode(convert_to(trim(p_username) || ':' || p_password, 'UTF8'), 'base64');
  insert into public.users (username, nickname, bio, password_hash, ncut_coins, backpack_capacity, daily_tasks, achievements, achievement_stats)
  values (trim(p_username), trim(p_username), '', v_expected, 3000, 50, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
  returning * into v_user;
  perform public._ensure_starter_inventory(v_user.id);
  return jsonb_build_object('id', v_user.id, 'username', v_user.username, 'nickname', v_user.nickname, 'bio', v_user.bio,
    'ncut_coins', v_user.ncut_coins, 'current_skin_item_id', v_user.current_skin_item_id, 'backpack_capacity', v_user.backpack_capacity,
    'daily_tasks', v_user.daily_tasks, 'achievements', v_user.achievements, 'achievement_stats', v_user.achievement_stats);
end; $$;
revoke all on function public.auth_register(text, text, uuid, text, text) from public;
grant execute on function public.auth_register(text, text, uuid, text, text) to anon, authenticated;

-- 登录：15 次/15 分钟/设备
create or replace function public.auth_login(
    p_username text, p_password text, p_captcha_id uuid, p_captcha_code text, p_device_id text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user public.users%rowtype; v_device text := coalesce(trim(p_device_id), ''); v_expected text;
begin
  perform public._auth_check_rate_limit('login:' || coalesce(nullif(v_device, ''), 'global'), 15, 15);
  if not public._auth_verify_captcha(p_captcha_id, p_captcha_code) then raise exception '验证码错误或已过期'; end if;
  select * into v_user from public.users where username = trim(p_username) limit 1;
  if not found then raise exception '用户名或密码错误'; end if;
  v_expected := encode(convert_to(trim(p_username) || ':' || p_password, 'UTF8'), 'base64');
  if v_user.password_hash is distinct from v_expected then raise exception '用户名或密码错误'; end if;
  perform public._ensure_starter_inventory(v_user.id);
  return jsonb_build_object('id', v_user.id, 'auth_user_id', v_user.auth_user_id, 'username', v_user.username, 'nickname', v_user.nickname, 'bio', v_user.bio,
    'ncut_coins', v_user.ncut_coins, 'current_skin_item_id', v_user.current_skin_item_id, 'backpack_capacity', v_user.backpack_capacity,
    'daily_tasks', v_user.daily_tasks, 'achievements', v_user.achievements, 'achievement_stats', v_user.achievement_stats);
end; $$;
revoke all on function public.auth_login(text, text, uuid, text, text) from public;
grant execute on function public.auth_login(text, text, uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
