const list = document.getElementById("messages");
const statusEl = document.getElementById("status");

if (list && statusEl) {
  list.scrollTop = list.scrollHeight;
}
