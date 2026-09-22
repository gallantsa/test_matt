# 003 - UI 底线与工程布局

- Status: accepted
- Date: 2026-09-22
- Context: 收尾 grilling，定死"长什么样、跑在什么形状里"，让 spec 无歧义。
- Decision:
  - UI：昵称框 + 消息列表 + 输入框；少量手写 CSS（聊天气泡、系统消息灰显）；自动滚到底；断线显示"已断开"状态条。
  - 断线：不做自动重连，用户手动刷新重连（重连后重新拉历史）。
  - 布局：单包，`server/`（Node + ws）+ `public/`（静态页），`npm run dev` 一键启动；不做 monorepo。
- Consequences: 重连去重/历史合并问题不存在；部署超出范围。
