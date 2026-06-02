-- 05-user-guard-fix.sql：修复 game_* RPC 更新金币/每日任务时被触发器误拦
-- 症状：出售宝石、领取每日任务报 "ncut_coins cannot be updated"
-- 原因：SECURITY DEFINER 以 postgres 执行，旧触发器只放行 service_role
-- 执行后请再执行一次 04-game-rpc.sql（已内置 set_config 标记）

create or replace function public._users_guard_is_privileged()
returns boolean
language plpgsql
stable
as $$
begin
  if coalesce(current_setting('ncut.game_rpc', true), '') = '1' then
    return true;
  end if;
  return current_user in (
    'service_role',
    'postgres',
    'supabase_admin',
    'supabase_storage_admin',
    'authenticator'
  );
end;
$$;

create or replace function public._guard_users_update()
returns trigger
language plpgsql
as $$
declare
  delta_coins integer;
  max_coin_delta constant integer := 300000;
begin
  if new.password_hash is distinct from old.password_hash then
    if not public._users_guard_is_privileged() then
      raise exception 'password_hash cannot be updated';
    end if;
  end if;

  if new.ncut_coins is null or new.ncut_coins < 0 then
    raise exception 'ncut_coins must be >= 0';
  end if;

  if not public._users_guard_is_privileged() then
    if new.ncut_coins is distinct from old.ncut_coins then
      raise exception 'ncut_coins cannot be updated';
    end if;
    if new.backpack_capacity is distinct from old.backpack_capacity then
      raise exception 'backpack_capacity cannot be updated';
    end if;
    if new.daily_tasks is distinct from old.daily_tasks then
      raise exception 'daily_tasks cannot be updated';
    end if;
    if new.achievements is distinct from old.achievements then
      raise exception 'achievements cannot be updated';
    end if;
    if new.achievement_stats is distinct from old.achievement_stats then
      raise exception 'achievement_stats cannot be updated';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at cannot be updated';
    end if;
  else
    if new.ncut_coins > 200000 then
      raise exception 'ncut_coins exceeds max allowed';
    end if;
    delta_coins := new.ncut_coins - old.ncut_coins;
    if abs(delta_coins) > max_coin_delta then
      raise exception 'ncut_coins delta too large';
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
