# CONTEXT.md

## Goal

以一个极简聊天室项目为载体，完整走通 Matt skills 套件的 main flow（grill → to-spec → to-tickets → implement → code-review）。

## Glossary

- **聊天室（chat room）**：单个共享房间，所有进入的人看到同一份消息流。
- **昵称（nickname）**：用户进入时自取的显示名，无账号、无登录，先到先得。
- **消息（message）**：`{ nickname, text, at }`，内存存储，重启丢失。
- **本机运行（local-only）**：`npm run dev` 在本机跑起来即成功，不做部署。

## Decisions

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

## Open questions

无。本轮 grilling 收束，可进入 `/to-spec`。
