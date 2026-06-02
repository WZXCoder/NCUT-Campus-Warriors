create extension if not exists "uuid-ossp";

create table if not exists public.users (
    id uuid primary key default uuid_generate_v4(),
    auth_user_id uuid unique,
    username text unique not null,
    nickname text,
    password_hash text not null,
    avatar_color text default '#4A90D9',
    ncut_coins integer not null default 3000,
    current_skin_item_id text,
    backpack_capacity integer not null default 50,
    daily_tasks jsonb not null default '{}'::jsonb,
    achievements jsonb not null default '{}'::jsonb,
    achievement_stats jsonb not null default '{}'::jsonb,
    bio text not null default '',
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 兼容你之前创建过的 users 表：去掉邮箱必填，并补齐游戏字段。
alter table public.users add column if not exists nickname text;
alter table public.users add column if not exists password_hash text;
alter table public.users add column if not exists auth_user_id uuid;
alter table public.users add column if not exists avatar_color text default '#4A90D9';
alter table public.users add column if not exists ncut_coins integer not null default 3000;
alter table public.users add column if not exists current_skin_item_id text;
alter table public.users add column if not exists backpack_capacity integer not null default 50;
alter table public.users add column if not exists daily_tasks jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists achievements jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists achievement_stats jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists bio text not null default '';
alter table public.users add column if not exists last_seen_at timestamptz not null default now();
alter table public.users add column if not exists updated_at timestamptz not null default now();
alter table public.users alter column password_hash set not null;
update public.users set nickname = username where nickname is null or trim(nickname) = '';
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'users'
          and column_name = 'email'
    ) then
        alter table public.users alter column email drop not null;
    end if;
end $$;

create table if not exists public.items (
    id text primary key,
    type text not null,
    name text not null,
    price integer not null default 0,
    value integer not null default 0,
    asset_path text,
    metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.inventories (
    user_id uuid not null,
    item_id text not null,
    quantity integer not null default 1,
    metadata jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (user_id, item_id)
);

create table if not exists public.game_runs (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null,
    mode text not null default 'goldrush',
    status text not null,
    carried_items jsonb not null default '[]'::jsonb,
    looted_items jsonb not null default '[]'::jsonb,
    survival_seconds integer not null default 0,
    kills integer not null default 0,
    created_at timestamptz not null default now(),
    finished_at timestamptz
);

alter table public.game_runs add column if not exists survival_seconds integer not null default 0;
alter table public.game_runs add column if not exists kills integer not null default 0;
alter table public.game_runs add column if not exists survival_subtype text default 'solo';
alter table public.game_runs add column if not exists team_members jsonb;
alter table public.game_runs add column if not exists room_id uuid references public.game_rooms(id) on delete set null;

create table if not exists public.friend_requests (
    id uuid primary key default uuid_generate_v4(),
    from_user_id uuid not null references public.users(id) on delete cascade,
    to_user_id uuid not null references public.users(id) on delete cascade,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (from_user_id, to_user_id)
);

create table if not exists public.friendships (
    user_id uuid not null references public.users(id) on delete cascade,
    friend_id uuid not null references public.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, friend_id)
);

create table if not exists public.chat_messages (
    id uuid primary key default uuid_generate_v4(),
    from_user_id uuid not null references public.users(id) on delete cascade,
    to_user_id uuid not null references public.users(id) on delete cascade,
    content text not null,
    created_at timestamptz not null default now()
);

alter table public.friend_requests add column if not exists updated_at timestamptz not null default now();

-- 如果之前用 auth.users 建过外键，先移除再指向自建 users 表。
alter table public.inventories drop constraint if exists inventories_user_id_fkey;
alter table public.game_runs drop constraint if exists game_runs_user_id_fkey;
alter table public.inventories
    add constraint inventories_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
alter table public.game_runs
    add constraint game_runs_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;

create index if not exists idx_users_username on public.users(username);
create unique index if not exists idx_users_auth_user_id on public.users(auth_user_id) where auth_user_id is not null;
create index if not exists idx_inventories_user_id on public.inventories(user_id);
create index if not exists idx_game_runs_user_id on public.game_runs(user_id);
create index if not exists idx_friend_requests_to_user on public.friend_requests(to_user_id, status);
create index if not exists idx_friendships_user_id on public.friendships(user_id);
create index if not exists idx_chat_messages_pair on public.chat_messages(from_user_id, to_user_id, created_at desc);

alter table public.users enable row level security;
alter table public.items enable row level security;
alter table public.inventories enable row level security;
alter table public.game_runs enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Users can view their own profile" on public.users;
drop policy if exists "users public select" on public.users;
drop policy if exists "users public insert" on public.users;
drop policy if exists "users public update" on public.users;
drop policy if exists "items are readable" on public.items;
drop policy if exists "inventories are readable for rankings" on public.inventories;
drop policy if exists "users insert own inventory" on public.inventories;
drop policy if exists "users update own inventory" on public.inventories;
drop policy if exists "users delete own inventory" on public.inventories;
drop policy if exists "inventories public all" on public.inventories;
drop policy if exists "users read own runs" on public.game_runs;
drop policy if exists "users insert own runs" on public.game_runs;
drop policy if exists "game runs public all" on public.game_runs;
drop policy if exists "friend requests public all" on public.friend_requests;
drop policy if exists "friendships public all" on public.friendships;
drop policy if exists "chat messages public all" on public.chat_messages;

-- 纯静态前端直连 Supabase 时无法使用 auth.uid()。
-- 这些策略用于免费原型部署；正式防作弊版本建议改为 Edge Functions 或后端校验。
create policy "users public select" on public.users
    for select using (true);

-- 生产环境：禁止匿名脚本直接写 users；只允许 service_role（Edge Function / 后端）写入。
create policy "users service insert" on public.users
    for insert with check (auth.role() = 'service_role');

create policy "users service update" on public.users
    for update using (auth.role() = 'service_role');

-- 注册限流：仅 service_role 可读写（由 Edge Function 基于 IP 控制注册频率）
create table if not exists public.signup_rate_limits (
    bucket text primary key,
    ip text not null,
    hour_start timestamptz not null,
    count integer not null default 0,
    updated_at timestamptz not null default now()
);

alter table public.signup_rate_limits enable row level security;
drop policy if exists "signup_rate_limits service all" on public.signup_rate_limits;
create policy "signup_rate_limits service all" on public.signup_rate_limits
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 邀请码注册：仅 service_role 可读写
create table if not exists public.invite_codes (
    code text primary key,
    remaining integer not null default 1,
    disabled boolean not null default false,
    expires_at timestamptz,
    note text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;
drop policy if exists "invite_codes service all" on public.invite_codes;
create policy "invite_codes service all" on public.invite_codes
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "items are readable" on public.items
    for select using (true);

create policy "inventories public all" on public.inventories
    for all using (true) with check (true);

create policy "game runs public all" on public.game_runs
    for all using (true) with check (true);

create policy "friend requests public all" on public.friend_requests
    for all using (true) with check (true);

create policy "friendships public all" on public.friendships
    for all using (true) with check (true);

create policy "chat messages public all" on public.chat_messages
    for all using (true) with check (true);

-- 清空生存模式排行榜历史（按需执行；执行一次后可注释掉，避免每次重跑 schema 都清空）
delete from public.game_runs where mode = 'survival';

-- ========== 多人房间（参观 Presence + 摸金匹配） ==========
create table if not exists public.game_rooms (
    id uuid primary key default uuid_generate_v4(),
    mode text not null default 'goldrush',
    status text not null default 'open',
    max_players integer not null default 10,
    player_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.game_room_members (
    room_id uuid not null references public.game_rooms(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    nickname text not null default '',
    status text not null default 'active',
    joined_at timestamptz not null default now(),
    left_at timestamptz,
    primary key (room_id, user_id)
);

create index if not exists idx_game_rooms_mode_status on public.game_rooms(mode, status, player_count);
create index if not exists idx_game_room_members_room on public.game_room_members(room_id, status);

alter table public.game_rooms enable row level security;
alter table public.game_room_members enable row level security;

drop policy if exists "game rooms public all" on public.game_rooms;
drop policy if exists "game room members public all" on public.game_room_members;

create policy "game rooms public all" on public.game_rooms
    for all using (true) with check (true);

create policy "game room members public all" on public.game_room_members
    for all using (true) with check (true);

-- 玩家位置同步（自建登录无 Supabase Auth 时，用 DB + Realtime postgres_changes / 轮询）
create table if not exists public.player_presence (
    user_id uuid primary key references public.users(id) on delete cascade,
    mode text not null,
    room_id uuid references public.game_rooms(id) on delete cascade,
    nickname text not null default '',
    x double precision not null default 0,
    y double precision not null default 0,
    hp integer not null default 100,
    max_hp integer not null default 100,
    status text not null default 'active',
    skin_color text default '#4A90D9',
    skin_item_id text,
    updated_at timestamptz not null default now()
);

create index if not exists idx_player_presence_mode_room on public.player_presence(mode, room_id, updated_at desc);

alter table public.player_presence enable row level security;

drop policy if exists "player presence public all" on public.player_presence;
create policy "player presence public all" on public.player_presence
    for all using (true) with check (true);

-- 将 player_presence 加入 Realtime publication（postgres_changes 推送；未配置时客户端仍会轮询 DB）
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        if not exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'player_presence'
        ) then
            alter publication supabase_realtime add table public.player_presence;
        end if;
    end if;
exception when others then
    raise notice 'player_presence publication skipped: %', sqlerrm;
end $$;

-- Realtime Broadcast 授权（PVP 伤害广播；若报错可忽略，不影响 DB 位置同步）
do $$
begin
    if exists (
        select 1 from information_schema.tables
        where table_schema = 'realtime' and table_name = 'messages'
    ) then
        execute 'drop policy if exists "realtime messages public" on realtime.messages';
        execute 'create policy "realtime messages public" on realtime.messages as permissive for all to public using (true) with check (true)';
    end if;
exception when others then
    raise notice 'realtime.messages policy skipped: %', sqlerrm;
end $$;

create table if not exists public.game_room_npcs (
    id uuid primary key default uuid_generate_v4(),
    room_id uuid not null references public.game_rooms(id) on delete cascade,
    name text not null default 'NPC',
    x double precision not null default 0,
    y double precision not null default 0,
    hp integer not null default 30,
    max_hp integer not null default 30,
    attack integer not null default 5,
    attack_range double precision not null default 15,
    speed double precision not null default 0.3,
    attack_interval integer not null default 600,
    image_index integer not null default 0,
    last_attack_at bigint not null default 0,
    stunned_until bigint not null default 0,
    rooted_until bigint not null default 0,
    provoke_until bigint not null default 0,
    provoke_target_id uuid,
    updated_at timestamptz not null default now()
);

create index if not exists idx_game_room_npcs_room on public.game_room_npcs(room_id);

alter table public.game_room_npcs enable row level security;

drop policy if exists "game room npcs public all" on public.game_room_npcs;
create policy "game room npcs public all" on public.game_room_npcs
    for all using (true) with check (true);

-- ========= 紧急止血：关键字段写入保护（无 Auth 场景） =========
-- 说明：在仍允许匿名写库的前提下，至少防止 ncut_coins 被一次性改成离谱数值，
-- 并禁止修改 password_hash 等敏感字段。长期方案应迁移到 Auth/RPC/Edge Functions。

create or replace function public._guard_users_update()
returns trigger
language plpgsql
as $$
declare
  delta_coins integer;
begin
  -- 禁止修改密码（避免直接接管账号）
  if new.password_hash is distinct from old.password_hash then
    if current_user <> 'service_role' then
      raise exception 'password_hash cannot be updated';
    end if;
  end if;

  -- 基本合法性
  if new.ncut_coins is null or new.ncut_coins < 0 then
    raise exception 'ncut_coins must be >= 0';
  end if;

  -- 非 service_role：只允许改“非敏感字段”，严禁改币/背包/成就等关键字段
  if current_user <> 'service_role' then
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
    -- service_role：仍保留合理的经济上限与单次变化限制（防止误操作/脚本跑飞）
    if new.ncut_coins > 200000 then
      raise exception 'ncut_coins exceeds max allowed';
    end if;
    delta_coins := new.ncut_coins - old.ncut_coins;
    if abs(delta_coins) > 5000 then
      raise exception 'ncut_coins delta too large';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_users_update on public.users;
create trigger trg_guard_users_update
before update on public.users
for each row
execute function public._guard_users_update();

-- ========= 轻量防爆：inventories / game_runs 写入保护（不改变现有 RLS，尽量不影响体验） =========
-- 目标：在匿名写库仍开启的情况下，阻止“离谱数值/伪造外键/巨型 payload”把表写爆。

create or replace function public._guard_inventories_write()
returns trigger
language plpgsql
as $$
declare
  max_qty integer := 999;
begin
  -- user_id / item_id 必须存在（防止伪造写入）
  if not exists (select 1 from public.users u where u.id = new.user_id) then
    raise exception 'invalid user_id';
  end if;
  if not exists (select 1 from public.items i where i.id = new.item_id) then
    raise exception 'invalid item_id';
  end if;

  if new.quantity is null or new.quantity < 0 then
    raise exception 'quantity must be >= 0';
  end if;
  if new.quantity > max_qty then
    raise exception 'quantity too large';
  end if;

  -- 禁止更新主键字段（防止把别人的背包挪到自己名下）
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or new.item_id is distinct from old.item_id then
      raise exception 'cannot change inventory primary key';
    end if;
  end if;

  -- 更新节奏统一
  new.updated_at := now();

  -- 限制 metadata 体积（避免塞超大 JSON）
  if length(coalesce(new.metadata::text, '')) > 4000 then
    raise exception 'metadata too large';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_inventories_write on public.inventories;
create trigger trg_guard_inventories_write
before insert or update on public.inventories
for each row
execute function public._guard_inventories_write();

create or replace function public._guard_game_runs_write()
returns trigger
language plpgsql
as $$
declare
  carried_len integer;
  looted_len integer;
begin
  if not exists (select 1 from public.users u where u.id = new.user_id) then
    raise exception 'invalid user_id';
  end if;

  -- 禁止更改归属与创建时间
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'cannot change user_id';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'cannot change created_at';
    end if;
  end if;

  -- 数值边界（防止写爆排行榜/统计）
  if new.survival_seconds is null or new.survival_seconds < 0 or new.survival_seconds > 7200 then
    raise exception 'invalid survival_seconds';
  end if;
  if new.kills is null or new.kills < 0 or new.kills > 500 then
    raise exception 'invalid kills';
  end if;

  -- JSON 数组体积限制
  carried_len := coalesce(jsonb_array_length(new.carried_items), 0);
  looted_len := coalesce(jsonb_array_length(new.looted_items), 0);
  if carried_len > 120 or looted_len > 200 then
    raise exception 'items payload too large';
  end if;

  -- 字段体积限制（避免超大 JSON）
  if length(coalesce(new.carried_items::text, '')) > 20000 then
    raise exception 'carried_items too large';
  end if;
  if length(coalesce(new.looted_items::text, '')) > 30000 then
    raise exception 'looted_items too large';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_game_runs_write on public.game_runs;
create trigger trg_guard_game_runs_write
before insert or update on public.game_runs
for each row
execute function public._guard_game_runs_write();

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = 'game_room_npcs'
        ) then
            alter publication supabase_realtime add table public.game_room_npcs;
        end if;
    end if;
exception when others then
    raise notice 'game_room_npcs publication skipped: %', sqlerrm;
end $$;
