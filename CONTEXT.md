# CONTEXT.md

## Goal

以一个极简聊天室项目为载体，完整走通 Matt skills 套件的 main flow（grill → to-spec → to-tickets → implement → code-review）。

## Glossary

- **聊天室（chat room）**：整个站点。包含多个房间。
- **房间（room）**：单个频道，以 `#` + 房名标识（如 `#lab`）；每个房间有独立的消息流、成员与历史。
- **昵称（nickname）**：按房间独立，进入房间时自取；无账号、无登录；房内允许重名。
- **消息（message）**：`{ nickname, text, at }`。
- **本机运行（local-only）**：`npm run dev` 在本机跑起来即成功，不做部署。

## Decisions

第一轮（单房间，已实现，issues #1–#6 关闭；history off-by-one 已由 `/diagnosing-bugs` 修复）：

- 技术栈：熟悉的 TS/Node，后端 `ws`（或 `socket.io`），前端极简页面。见 `docs/adr/001-stack.md`。
- 范围：单房间 + 昵称 + 内存存储，不做多房间/持久化/登录。
- 成功标准：走通 main flow 为必须；代码里预留一个小坑方便之后练 `diagnosing-bugs`。
- 运行方式：本机运行即可。

- 消息协议：JSON 分 type（`chat` / `join` / `leave`）。见 `docs/adr/002-protocol.md`。
- 昵称：允许重名；空昵称分配 `guest-<随机>`。
- 历史：内存保留最近 100 条，新连接推送。
- UI：昵称框 + 消息列表 + 输入框，手写 CSS、自动滚底、断线状态条；断线手动刷新重连。见 `docs/adr/003-ui-layout.md`。
- 布局：单包 `server/` + `public/`，`npm run dev` 一键启动。
- repo：已初始化，remote 为 `git@github.com:gallantsa/test_matt.git`。

第二轮（多房间 + 持久化，grilling 中）：

- 房间：输入房名即进房，不存在则创建；房名即 key。见 `docs/adr/004-rooms.md`。
- 术语：聊天室指站点，房间指单个频道（`#lab`）。
- 昵称按房间独立，进房时重取。
- 空房运行时保留在内存中，不销毁。
- 房名进 URL（`?room=lab`），刷新/分享直达；无房间列表，房名口头约定。
- 持久化：只存 `chat` 消息（join/leave 纯内存）；每房一个 JSON 文件 `data/<房名>.json`；每房仍只留最近 100 条。见 `docs/adr/005-persistence.md`。

## Open questions

无。本轮 grilling 收束，可进入 `/to-spec`。
