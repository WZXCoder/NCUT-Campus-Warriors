-- 04-game-rpc.sql：金币与每日任务（绕过 users 表 anon 不可 update 的限制）
-- 需先执行 01 → 02 → 03

create or replace function public._game_user_json(p_user public.users)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p_user.id,
    'auth_user_id', p_user.auth_user_id,
    'username', p_user.username,
    'nickname', p_user.nickname,
    'bio', p_user.bio,
    'ncut_coins', p_user.ncut_coins,
    'current_skin_item_id', p_user.current_skin_item_id,
    'backpack_capacity', p_user.backpack_capacity,
    'daily_tasks', p_user.daily_tasks,
    'achievements', p_user.achievements,
    'achievement_stats', p_user.achievement_stats
  );
$$;

create or replace function public._game_rpc_begin()
returns void language plpgsql as $$
begin
  perform set_config('ncut.game_rpc', '1', true);
end;
$$;

-- 保存每日任务进度（完成/领取状态）
create or replace function public.game_save_daily_tasks(p_user_id uuid, p_daily_tasks jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user public.users%rowtype;
begin
  perform public._game_rpc_begin();
  if p_user_id is null then raise exception 'invalid user_id'; end if;
  if p_daily_tasks is null or jsonb_typeof(p_daily_tasks) <> 'object' then
    raise exception 'invalid daily_tasks';
  end if;
  update public.users
  set daily_tasks = p_daily_tasks, updated_at = now()
  where id = p_user_id
  returning * into v_user;
  if not found then raise exception 'user not found'; end if;
  return public._game_user_json(v_user);
end; $$;

-- 设置金币（单次变动上限：允许背包批量出售宝石等正常玩法）
create or replace function public.game_set_coins(p_user_id uuid, p_coins integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.users%rowtype;
  v_delta integer;
  v_next integer;
  v_max_delta constant integer := 300000;
begin
  perform public._game_rpc_begin();
  if p_user_id is null then raise exception 'invalid user_id'; end if;
  v_next := greatest(0, coalesce(p_coins, 0));
  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  if v_next > 200000 then raise exception 'ncut_coins exceeds max allowed'; end if;
  v_delta := v_next - v_user.ncut_coins;
  if abs(v_delta) > v_max_delta then raise exception 'ncut_coins delta too large'; end if;
  update public.users set ncut_coins = v_next, updated_at = now() where id = p_user_id
  returning * into v_user;
  return public._game_user_json(v_user);
end; $$;

-- 领取每日任务奖励（服务端校验任务与金额）
create or replace function public.game_claim_daily_task(p_user_id uuid, p_task_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.users%rowtype;
  v_state jsonb;
  v_entry jsonb;
  v_reward integer;
  v_today text;
begin
  perform public._game_rpc_begin();
  if p_user_id is null then raise exception 'invalid user_id'; end if;
  v_reward := case trim(p_task_id)
    when 'login' then 100
    when 'goldrush_extract' then 300
    when 'visit' then 100
    when 'survival' then 200
    when 'survival_30s' then 300
    when 'survival_10_kills' then 200
    else null
  end;
  if v_reward is null then raise exception '任务不存在'; end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;

  v_today := to_char((now() at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD');
  v_state := coalesce(v_user.daily_tasks, '{}'::jsonb);
  if coalesce(v_state->>'date', '') <> v_today then
    raise exception '任务尚未完成';
  end if;

  v_entry := coalesce(v_state->'tasks'->trim(p_task_id), '{}'::jsonb);
  if coalesce((v_entry->>'completed')::boolean, false) is not true then
    raise exception '任务尚未完成';
  end if;
  if coalesce((v_entry->>'claimed')::boolean, false) is true then
    raise exception '奖励已领取';
  end if;

  v_state := jsonb_set(
    v_state,
    array['tasks', trim(p_task_id), 'claimed'],
    'true'::jsonb,
    true
  );

  if v_user.ncut_coins + v_reward > 200000 then
    raise exception 'ncut_coins exceeds max allowed';
  end if;

  update public.users
  set
    daily_tasks = v_state,
    ncut_coins = v_user.ncut_coins + v_reward,
    updated_at = now()
  where id = p_user_id
  returning * into v_user;

  return public._game_user_json(v_user);
end; $$;

-- 设置背包容量（购买扩容卡；仅允许增加，上限 2000）
create or replace function public.game_set_backpack_capacity(p_user_id uuid, p_capacity integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.users%rowtype;
begin
  perform public._game_rpc_begin();
  if p_user_id is null then raise exception 'invalid user_id'; end if;
  if p_capacity is null or p_capacity < 50 or p_capacity > 2000 then
    raise exception 'invalid backpack_capacity';
  end if;
  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  if p_capacity < v_user.backpack_capacity then
    raise exception 'backpack_capacity cannot decrease';
  end if;
  update public.users
  set backpack_capacity = p_capacity, updated_at = now()
  where id = p_user_id
  returning * into v_user;
  return public._game_user_json(v_user);
end; $$;

-- 更换当前皮肤（null 表示默认皮肤；须已解锁）
create or replace function public.game_set_current_skin(p_user_id uuid, p_skin_item_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.users%rowtype;
  v_skin_id text;
begin
  perform public._game_rpc_begin();
  if p_user_id is null then raise exception 'invalid user_id'; end if;
  v_skin_id := nullif(trim(p_skin_item_id), '');
  if v_skin_id is not null then
    if not exists (
      select 1 from public.inventories
      where user_id = p_user_id and item_id = v_skin_id and quantity > 0
    ) then
      raise exception '皮肤未解锁';
    end if;
  end if;
  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  update public.users
  set current_skin_item_id = v_skin_id, updated_at = now()
  where id = p_user_id
  returning * into v_user;
  return public._game_user_json(v_user);
end; $$;

-- 修改个人简介
create or replace function public.game_set_bio(p_user_id uuid, p_bio text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user public.users%rowtype;
  v_bio text;
begin
  perform public._game_rpc_begin();
  if p_user_id is null then raise exception 'invalid user_id'; end if;
  v_bio := trim(coalesce(p_bio, ''));
  if char_length(v_bio) > 100 then
    raise exception 'bio too long';
  end if;
  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  update public.users
  set bio = v_bio, updated_at = now()
  where id = p_user_id
  returning * into v_user;
  return public._game_user_json(v_user);
end; $$;

revoke all on function public.game_save_daily_tasks(uuid, jsonb) from public;
revoke all on function public.game_set_coins(uuid, integer) from public;
revoke all on function public.game_claim_daily_task(uuid, text) from public;
revoke all on function public.game_set_backpack_capacity(uuid, integer) from public;
revoke all on function public.game_set_current_skin(uuid, text) from public;
revoke all on function public.game_set_bio(uuid, text) from public;
grant execute on function public.game_save_daily_tasks(uuid, jsonb) to anon, authenticated;
grant execute on function public.game_set_coins(uuid, integer) to anon, authenticated;
grant execute on function public.game_claim_daily_task(uuid, text) to anon, authenticated;
grant execute on function public.game_set_backpack_capacity(uuid, integer) to anon, authenticated;
grant execute on function public.game_set_current_skin(uuid, text) to anon, authenticated;
grant execute on function public.game_set_bio(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
