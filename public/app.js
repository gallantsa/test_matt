const list = document.getElementById("messages");
const statusEl = document.getElementById("status");
const nicknameInput = document.getElementById("nickname");
const roomInput = document.getElementById("room");

function currentRoom() {
  const fromUrl = new URLSearchParams(location.search).get("room");
  const raw = (roomInput && roomInput.value.trim()) || fromUrl || "lobby";
  return raw.trim() || "lobby";
}

if (roomInput) {
  const fromUrl = new URLSearchParams(location.search).get("room");
  if (fromUrl) roomInput.value = fromUrl;
  roomInput.addEventListener("change", () => {
    const r = roomInput.value.trim() || "lobby";
    const url = new URL(location.href);
    url.searchParams.set("room", r);
    location.href = url.toString();
  });
}
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");

let myNickname = null;
let joined = false;

function escapeText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function scrollBottom() {
  if (list) list.scrollTop = list.scrollHeight;
}

function addSystemMessage(text) {
  if (!list) return;
  const li = document.createElement("li");
  li.className = "system";
  li.textContent = text;
  list.appendChild(li);
  scrollBottom();
}

function addChatMessage(nickname, text, at) {
  if (!list) return;
  const li = document.createElement("li");
  const name = document.createElement("b");
  name.textContent = `${nickname} `;
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = at ? new Date(at).toLocaleTimeString() : "";
  const body = document.createElement("span");
  body.textContent = ` ${text}`;
  li.appendChild(name);
  li.appendChild(time);
  li.appendChild(body);
  list.appendChild(li);
  scrollBottom();
}

function addHistory(messages) {
  for (const m of messages ?? []) {
    if (m.type === "join" || m.type === "leave") addSystemMessage(m.text);
    else if (m.type === "chat") addChatMessage(m.nickname, m.text, m.at);
  }
}

const protocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsRoom = new URLSearchParams(location.search).get("room") || currentRoom();
const ws = new WebSocket(`${protocol}//${location.host}?room=${encodeURIComponent(wsRoom)}`);

if (statusEl) {
  ws.addEventListener("close", () => statusEl.classList.add("offline"));
  ws.addEventListener("error", () => statusEl.classList.add("offline"));
}

ws.addEventListener("message", (event) => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }
  if (data.type === "history") {
    addHistory(data.messages);
  } else if (data.type === "joined") {
    myNickname = data.nickname;
    joined = true;
    if (nicknameInput) {
      nicknameInput.value = myNickname;
      nicknameInput.disabled = true;
    }
  } else if (data.type === "join" || data.type === "leave") {
    addSystemMessage(data.text);
  } else if (data.type === "chat") {
    addChatMessage(data.nickname, data.text, data.at);
  }
});

function tryJoin() {
  if (joined || ws.readyState !== WebSocket.OPEN) return;
  const raw = nicknameInput ? nicknameInput.value : "";
  ws.send(JSON.stringify({ type: "join", nickname: (raw ?? "").trim(), room: currentRoom() }));
}

function sendChat() {
  if (!joined || ws.readyState !== WebSocket.OPEN) return;
  const text = inputEl ? inputEl.value.trim() : "";
  if (!text) return;
  ws.send(JSON.stringify({ type: "chat", text }));
  if (inputEl) inputEl.value = "";
}

ws.addEventListener("open", tryJoin);
if (nicknameInput) {
  nicknameInput.addEventListener("change", tryJoin);
}
if (sendBtn) {
  sendBtn.addEventListener("click", () => {
    if (!joined) tryJoin();
    else sendChat();
  });
}
if (inputEl) {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!joined) tryJoin();
      else sendChat();
    }
  });
}

if (list && statusEl) scrollBottom();
