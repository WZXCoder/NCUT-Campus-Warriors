-- 在 Supabase SQL Editor 执行一次（不删数据）
-- 用数据库 RPC 完成登录/建档案，不依赖 Edge Function 是否部署成功

-- 1) 老账号：用户名+密码登录（服务端校验，不暴露 password_hash）
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
  if v_user.password_hash is distinct from v_expected then
    raise exception '用户名或密码错误';
  end if;

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

-- 2) 邮箱登录后：自动创建/获取游戏档案（需要已登录 JWT）
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

  return to_jsonb(v_user);
end;
$$;

revoke all on function public.ensure_game_profile(text) from public;
grant execute on function public.ensure_game_profile(text) to authenticated;

-- 3) 邮箱用户允许更新自己的档案（昵称/任务/成就等）
drop policy if exists "users auth update own" on public.users;
create policy "users auth update own" on public.users
  for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
