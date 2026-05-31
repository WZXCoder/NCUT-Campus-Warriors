-- 多人同步专用 SQL（在 Supabase SQL Editor 中执行一次即可）
-- 若已执行过完整 supabase-schema.sql 末尾，可跳过

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

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        if not exists (
            select 1 from pg_publication_tables
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

-- 摸金房间共享 NPC（全房间最多 5 个，所有玩家看见同一套）
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

-- 生存模式排行榜扩展字段
alter table public.game_runs add column if not exists survival_subtype text default 'solo';
alter table public.game_runs add column if not exists team_members jsonb;
alter table public.game_runs add column if not exists room_id uuid references public.game_rooms(id) on delete set null;
