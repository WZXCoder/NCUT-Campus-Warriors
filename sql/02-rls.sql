-- 02-rls.sql：行级安全（RLS）与前端读取权限
-- 需先执行 01-tables.sql

-- 启用 RLS
alter table public.users enable row level security;
alter table public.items enable row level security;
alter table public.inventories enable row level security;
alter table public.game_runs enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.chat_messages enable row level security;
alter table public.game_rooms enable row level security;
alter table public.game_room_members enable row level security;
alter table public.player_presence enable row level security;
alter table public.game_room_npcs enable row level security;

-- 清理旧策略名
drop policy if exists "Users can view their own profile" on public.users;
drop policy if exists "users public select" on public.users;
drop policy if exists "users public insert" on public.users;
drop policy if exists "users public update" on public.users;
drop policy if exists "users service insert" on public.users;
drop policy if exists "users service update" on public.users;
drop policy if exists "users auth update own" on public.users;

-- users：可读；禁止前端直接注册（改由 03-auth.sql 的 RPC 写入）
create policy "users public select" on public.users
    for select to anon, authenticated using (true);

create policy "users service insert" on public.users
    for insert with check (auth.role() = 'service_role');

create policy "users service update" on public.users
    for update using (auth.role() = 'service_role');

-- 其它游戏表：原型阶段允许匿名读写（正式防作弊可改为 RPC）
drop policy if exists "items are readable" on public.items;
create policy "items are readable" on public.items for select using (true);

drop policy if exists "inventories public all" on public.inventories;
create policy "inventories public all" on public.inventories
    for all using (true) with check (true);

drop policy if exists "game runs public all" on public.game_runs;
create policy "game runs public all" on public.game_runs
    for all using (true) with check (true);

drop policy if exists "friend requests public all" on public.friend_requests;
create policy "friend requests public all" on public.friend_requests
    for all using (true) with check (true);

drop policy if exists "friendships public all" on public.friendships;
create policy "friendships public all" on public.friendships
    for all using (true) with check (true);

drop policy if exists "chat messages public all" on public.chat_messages;
create policy "chat messages public all" on public.chat_messages
    for all using (true) with check (true);

drop policy if exists "game rooms public all" on public.game_rooms;
create policy "game rooms public all" on public.game_rooms
    for all using (true) with check (true);

drop policy if exists "game room members public all" on public.game_room_members;
create policy "game room members public all" on public.game_room_members
    for all using (true) with check (true);

drop policy if exists "player presence public all" on public.player_presence;
create policy "player presence public all" on public.player_presence
    for all using (true) with check (true);

drop policy if exists "game room npcs public all" on public.game_room_npcs;
create policy "game room npcs public all" on public.game_room_npcs
    for all using (true) with check (true);

-- 表级权限（避免 permission denied）
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on table public.inventories to anon, authenticated;
