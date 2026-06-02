# Supabase 数据库脚本说明

按顺序在 **Supabase → SQL Editor** 中执行（均可重复执行，不会删表）。

| 顺序 | 文件 | 作用 |
|------|------|------|
| 1 | [01-tables.sql](./01-tables.sql) | 游戏表结构、索引、外键、防刷触发器、Realtime |
| 2 | [01-items-seed.sql](./01-items-seed.sql) | 物品目录（宝石/武器/皮肤等，背包写入校验用） |
| 3 | [02-rls.sql](./02-rls.sql) | 行级安全策略（RLS）与基础读取权限 |
| 4 | [03-auth.sql](./03-auth.sql) | 注册/登录：数字验证码 + 限流（RPC） |
| 5 | [04-game-rpc.sql](./04-game-rpc.sql) | 每日任务保存/领取、金币变更（RPC） |

## 前端对应关系

- 注册/登录：`issue_captcha` → `auth_register` / `auth_login`
- 每日任务 / 金币：`game_save_daily_tasks`、`game_claim_daily_task`、`game_set_coins`
- 代码：`js/captcha.js`、`js/store.js`
- **不要**在前端直接 `insert` 到 `users` 表（由 RPC 在服务端创建）

## 可选维护

- 清理恶意 `test*` 用户：在 SQL Editor 自行 `delete from public.users where username ilike 'test%';`（会级联删关联数据）
- 清空生存排行榜（仅必要时）：`delete from public.game_runs where mode = 'survival';`

## 旧文件说明

根目录下的 `supabase-schema.sql` 等已合并进本目录，新环境请只执行 `sql/` 内脚本。
