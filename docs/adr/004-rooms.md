# 004 - 多房间模型

- Status: accepted
- Date: 2026-09-22
- Context: 第二轮 grilling。单房间已实现（issues #1–#6），现在长出多房间。`server/index.ts` 当前是全局 `history` + `clients`，多房间意味着按房切分，这是最大的 shape 变化。
- Decision:
  - 房间：输入房名即进房，不存在则创建；房名即 key，以 `#` + 房名展示（如 `#lab`）。
  - 术语：聊天室指整个站点，房间指单个频道（解决第一轮 glossary 的 overloaded word）。
  - 昵称按房间独立，进房时重取；房内规则不变（允许重名，空昵称给 `guest-<随机>`）。
  - 空房保留（内存与历史都在），不销毁；重启语义由持久化 ADR 决定。
  - 房名进 URL（`?room=lab`），刷新/分享直达；与第一轮"断线手动刷新重连"行为天然配对。
  - 无房间列表；房名是口头约定的 key。
- Consequences: 服务端 `history`/`clients` 需按房切分（`Map<room, ...>`）；协议需携带房名；前端需房间输入 + URL 同步。
