-- 可选：邮箱登录后允许已绑定用户更新自己的档案（昵称/简介等）
-- 执行一次即可，不删数据

drop policy if exists "users auth update own" on public.users;
create policy "users auth update own" on public.users
  for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
