const list = document.getElementById("messages");
const statusEl = document.getElementById("status");
const nicknameInput = document.getElementById("nickname");
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

function addHistory(messages) {
  for (const m of messages ?? []) {
    if (m.type === "join" || m.type === "leave") addSystemMessage(m.text);
  }
}

const protocol = location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${protocol}//${location.host}`);

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
  }
});

function tryJoin() {
  if (joined || ws.readyState !== WebSocket.OPEN) return;
  const raw = nicknameInput ? nicknameInput.value : "";
  ws.send(JSON.stringify({ type: "join", nickname: (raw ?? "").trim() }));
}

ws.addEventListener("open", tryJoin);
if (nicknameInput) {
  nicknameInput.addEventListener("change", tryJoin);
}
if (sendBtn) sendBtn.addEventListener("click", tryJoin);
if (inputEl) {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryJoin();
  });
}

if (list && statusEl) scrollBottom();
