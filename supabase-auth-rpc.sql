-- 在 Supabase SQL Editor 执行（可重复执行，不删数据）
-- 解决：登录成功但进大厅失败 / permission denied / 注册后无档案

-- 0) 确保基础读取权限
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on table public.inventories to anon, authenticated;

alter table public.users enable row level security;
alter table public.users no force row level security;

drop policy if exists "users public select" on public.users;
create policy "users public select" on public.users
  for select to anon, authenticated using (true);

drop policy if exists "users auth update own" on public.users;
create policy "users auth update own" on public.users
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- 1) 内部：确保新手背包（服务端写入，不走前端 RLS）
create or replace function public._ensure_starter_inventory(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.inventories where user_id = p_user_id limit 1) then
    return;
  end if;
  insert into public.inventories (user_id, item_id, quantity) values
    (p_user_id, 'weapon_knife', 1),
    (p_user_id, 'tool_shovel', 1),
    (p_user_id, 'tool_boots', 1)
  on conflict (user_id, item_id) do nothing;
end;
$$;

-- 2) 老账号：用户名+密码登录（密码校验与前端 hashPassword 一致）
create or replace function public.legacy_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_expected text;
begin
  select * into v_user
  from public.users
  where username = trim(p_username)
  limit 1;

  if not found then
    raise exception '用户名或密码错误';
  end if;

  v_expected := encode(convert_to(trim(p_username) || ':' || p_password, 'UTF8'), 'base64');
  if v_user.password_hash is distinct from v_expected and v_user.password_hash is distinct from '__AUTH__' then
    raise exception '用户名或密码错误';
  end if;
  if v_user.password_hash = '__AUTH__' then
    raise exception '该账号已绑定邮箱，请使用邮箱+密码登录';
  end if;

  perform public._ensure_starter_inventory(v_user.id);

  return jsonb_build_object(
    'id', v_user.id,
    'auth_user_id', v_user.auth_user_id,
    'username', v_user.username,
    'nickname', v_user.nickname,
    'bio', v_user.bio,
    'ncut_coins', v_user.ncut_coins,
    'current_skin_item_id', v_user.current_skin_item_id,
    'backpack_capacity', v_user.backpack_capacity,
    'daily_tasks', v_user.daily_tasks,
    'achievements', v_user.achievements,
    'achievement_stats', v_user.achievement_stats
  );
end;
$$;

revoke all on function public.legacy_login(text, text) from public;
grant execute on function public.legacy_login(text, text) to anon, authenticated;

-- 3) 邮箱登录后：创建/获取游戏档案
create or replace function public.ensure_game_profile(p_username text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth uuid := auth.uid();
  v_user public.users%rowtype;
  v_name text;
begin
  if v_auth is null then
    raise exception '未登录，请先完成邮箱验证后再登录';
  end if;

  select * into v_user from public.users where auth_user_id = v_auth;
  if found then
    perform public._ensure_starter_inventory(v_user.id);
    return to_jsonb(v_user);
  end if;

  v_name := trim(coalesce(p_username, ''));
  if length(v_name) < 2 then
    raise exception '用户名至少需要2个字符';
  end if;

  if exists (select 1 from public.users where username = v_name) then
    v_name := v_name || '_' || left(replace(v_auth::text, '-', ''), 6);
  end if;

  insert into public.users (
    auth_user_id, username, nickname, bio, password_hash,
    ncut_coins, current_skin_item_id, backpack_capacity,
    daily_tasks, achievements, achievement_stats
  ) values (
    v_auth, v_name, v_name, '', '__AUTH__',
    3000, null, 50,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  )
  returning * into v_user;

  perform public._ensure_starter_inventory(v_user.id);
  return to_jsonb(v_user);
end;
$$;

revoke all on function public.ensure_game_profile(text) from public;
grant execute on function public.ensure_game_profile(text) to authenticated;

-- 4) 通知 PostgREST 重新加载 schema（避免刚创建函数后前端调用不到）
notify pgrst, 'reload schema';
