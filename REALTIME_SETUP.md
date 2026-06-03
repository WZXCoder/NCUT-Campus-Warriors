# Supabase Realtime 多人模式配置指南

本文说明如何为 **校园参观（多人同图）** 与 **摸金模式（PVEVP 房间）** 启用 Supabase Realtime。

---

## 一、架构概览

| 功能 | 技术 | 说明 |
|------|------|------|
| 参观 / 摸金位置同步 | **`player_presence` 表** + 每 250ms upsert | 不依赖 Supabase Auth，自建登录可用 |
| 他人位置刷新 | 每 1s 轮询 DB +（可选）`postgres_changes` 推送 | 即使未开表复制，轮询也能多人 |
| 摸金 PVP 伤害 | Realtime **Broadcast** | 需 `realtime.messages` 策略（schema 已含） |
| 摸金房间匹配 | `game_rooms` / `game_room_members` | SQL 入局，满 10 人开新房间 |

> **为何不用 Presence API？** 本项目用自建 `users` 表登录，未走 `supabase.auth`。新版 Realtime 对 Presence/Broadcast 常需 JWT，会导致频道 `CHANNEL_ERROR` 且**静默失败**。改用 DB 同步更稳定。

---

## 二、Supabase 控制台操作（必做）

### 1. 确认 Realtime 已开启

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard) → 你的项目  
2. 左侧 **Project Settings** → **Realtime**  
3. 确认 **Enable Realtime** 为开启状态（默认通常已开）

### 2. 执行数据库 Schema（**必做，否则多人无效**）

1. 左侧 **SQL Editor** → **New query**  
2. 按 [sql/README.md](./sql/README.md) 顺序执行 `sql/01-tables.sql` ～ `sql/05-user-guard-fix.sql`（至少包含表结构、RLS、认证 RPC），其中 `01-tables.sql` 已包含：
   - `game_rooms` / `game_room_members`
   - **`player_presence`**（位置同步核心）
   - `supabase_realtime` publication 添加 `player_presence`
3. 点击 **Run**，确认无红色报错  

验证表是否创建成功：

```sql
select * from public.player_presence limit 5;
```

### 3. （可选）为房间表开启 Postgres Changes

若希望将来用 `postgres_changes` 监听房间人数变化：

1. **Database** → **Publications** → `supabase_realtime`  
2. 勾选 `game_rooms`、`game_room_members`  
3. Save  

> 当前版本**不依赖**表复制，仅用 Presence/Broadcast + 入局前 SQL 查询即可。

### 4. 确认 API 密钥

1. **Project Settings** → **API**  
2. 将 **Project URL** 与 **anon public** key 填入 `js/supabase-client.js`（你项目里应已配置）  
3. 静态前端使用 anon key 即可订阅 Presence/Broadcast

### 5. Row Level Security

schema 中已为 `game_rooms` / `game_room_members` 设置 `using (true)` 开放策略（与现有原型一致）。  
**正式环境**建议收紧 RLS，并将敏感写操作收口到 RPC（见 `sql/04-game-rpc.sql` 等）。

---

## 三、本地验证步骤

### 参观模式

1. 两个浏览器（或普通 + 无痕）分别登录**不同账号**  
2. 均进入 **参观模式**  
3. 预期：
   - 右上角 **在线玩家** 列表出现对方昵称  
   - 地图上能看到对方角色（蓝色系圆点 + 昵称）  
   - 移动时位置约 0.2s 刷新一次  

### 摸金模式

1. 账号 A 先进入摸金 → 提示「已创建新摸金房间」  
2. 账号 B 再进入 → 应提示「加入摸金房间（当前约 2 人）」  
3. 预期：
   - HUD 显示 `房间 xxx…｜2/10 人`  
   - 地图上看到对方（红色摸金客 + 血条）  
   - **K 攻击** 可打对方；NPC 逻辑与原先一致（最多 5 个 NPC）  
4. A 撤离成功或死亡后，C 再入局 → 应进入**同一 roomId**（若未满 10 且房间仍 active）  
5. 第 11 个玩家 → 自动 **create** 新房间  

---

## 四、房间动态逻辑说明

```
查找顺序：
  game_rooms WHERE mode='goldrush' AND status IN ('open','active')
  ORDER BY created_at ASC
  → 取 active 成员数 < 10 的第一个房间

加入：
  upsert game_room_members (status='active')
  重算 player_count

离开（死亡 / 撤离 / 返回大厅）：
  update members.status = 'dead' | 'extracted' | 'left'
  重算 player_count；若为 0 则 room.status = 'closed'
```

因此「前 8 人出局、9/10 仍在局内」时，新玩家会补进该房间，直到满 10 人。

---

## 五、代码入口（便于二次开发）

| 文件 | 作用 |
|------|------|
| `js/realtime.js` | Presence/Broadcast、房间匹配 API |
| `js/app.js` | 参观/摸金接入、HUD 在线列表 |
| `js/goldrush.js` | 真人 PVP、移除 AI 摸金客 |
| `js/renderer.js` | 参观模式绘制其他玩家 |
| `sql/01-tables.sql` | 房间表、presence、触发器等 DDL |

主要 API：

```javascript
NCUTMap.realtime.joinVisit(user, nickname, getPosition, { onPresenceChange })
NCUTMap.realtime.findOrJoinGoldRushRoom(user, nickname)
NCUTMap.realtime.joinGoldRushRoom(roomId, user, nickname, getState, handlers)
NCUTMap.realtime.leaveGoldRushRoom(userId, status)
NCUTMap.realtime.getRemotePlayers()
NCUTMap.realtime.broadcast(event, payload)
```

---

## 六、常见问题

### 看不到其他玩家

1. **必须先执行 SQL** 创建 `player_presence` 表（最常见原因）  
2. 进入参观/摸金后，在 Supabase **Table Editor → player_presence** 看是否有两行（两个账号）  
3. 浏览器 **F12 控制台** 是否有 `upsert presence failed` 或 `relation "player_presence" does not exist`  
4. **Ctrl+F5** 强刷两个浏览器  
5. 两账号都必须**已登录**且进入**同一模式**（摸金还需同一 `room_id`）

### 房间人数不准

- 异常退出可能未调用 `leaveGoldRushRoom`；可在 SQL Editor 手动修正：

```sql
-- 将某房间所有成员标为 left 并关闭
update game_room_members set status='left', left_at=now() where room_id='房间UUID';
update game_rooms set player_count=0, status='closed' where id='房间UUID';
```

### Realtime 连接数

Supabase 免费档有并发连接限制；参观全服单频道、摸金按房间分频道，一般足够课堂/demo 使用。

---

## 七、后续可增强项（未实现）

- 服务端权威世界状态（摸金 NPC 当前为客户端本地刷怪）  
- RPC / 服务端校验 PVP 伤害与经济变动  
- 断线重连自动 re-join 同一 room  
- 参观模式按校区/实例分频道  
