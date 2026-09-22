# 002 - 消息协议与会话语义

- Status: accepted
- Date: 2026-09-22
- Context: spec 需要无歧义的消息格式、昵称规则和历史策略。
- Decision:
  - JSON 分 type：`chat` / `join` / `leave`，chat 形如 `{ type: "chat", nickname, text, at }`。
  - 昵称允许重名；空昵称由服务端分配 `guest-<4位随机>`。
  - 服务端内存保留最近 100 条消息，新连接一次性推送历史。
- Consequences: 无账号体系；重启丢消息；重名靠用户自行分辨。
