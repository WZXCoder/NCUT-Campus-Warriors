# Supabase 数据库脚本说明

按顺序在 **Supabase → SQL Editor** 中执行（均可重复执行，不会删表）。

| 顺序 | 文件 | 作用 |
|------|------|------|
| 1 | [01-tables.sql](./01-tables.sql) | 游戏表结构、索引、外键、防刷触发器、Realtime |
| 2 | [01-items-seed.sql](./01-items-seed.sql) | 物品目录（宝石/武器/皮肤等，背包写入校验用） |
| 3 | [02-rls.sql](./02-rls.sql) | 行级安全策略（RLS）与基础读取权限 |
| 4 | [03-auth.sql](./03-auth.sql) | 注册/登录：数字验证码 + 限流（RPC） |
| 5 | [04-game-rpc.sql](./04-game-rpc.sql) | 每日任务、金币、背包容量、换肤（RPC） |
| 6 | [05-user-guard-fix.sql](./05-user-guard-fix.sql) | 修复 RPC 改币被触发器误拦（报 ncut_coins cannot be updated 时必跑） |

## 前端对应关系

- 注册/登录：`issue_captcha` → `auth_register` / `auth_login`
- 每日任务 / 金币 / 背包 / 皮肤：`game_save_daily_tasks`、`game_claim_daily_task`、`game_set_coins`、`game_set_backpack_capacity`、`game_set_current_skin`
- 代码：`js/captcha.js`、`js/store.js`
- **不要**在前端直接 `insert` 到 `users` 表（由 RPC 在服务端创建）

## 可选维护

- 清理恶意 `test*` 用户：在 SQL Editor 自行 `delete from public.users where username ilike 'test%';`（会级联删关联数据）
- 清空生存排行榜（仅必要时）：`delete from public.game_runs where mode = 'survival';`

## 架构说明

- **不使用** Supabase Edge Functions；注册/登录/验证码/金币与每日任务均通过 **PostgreSQL RPC**（`03-auth.sql`、`04-game-rpc.sql`）完成。
- 多人同步见项目根目录 [REALTIME_SETUP.md](../REALTIME_SETUP.md)，由前端 `js/realtime.js` + Realtime/Broadcast 实现。
- **共享 NPC**：摸金房间 ≥2 人、生存双人/四人时，怪物/NPC 写入 `game_room_npcs`，房主补怪，全员同步位置与血量。
