import WebSocket from "ws";

export function wsUrl(httpUrl: string, room?: string): string {
  const base = httpUrl.replace(/^http/, "ws");
  return room ? `${base}?room=${encodeURIComponent(room)}` : base;
}

export function waitFor(ws: WebSocket, predicate: (d: any) => boolean, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener("message", onMessage);
      reject(new Error("timed out waiting for message"));
    }, timeoutMs);
    function onMessage(raw: any) {
      try {
        const data = JSON.parse(String(raw));
        if (predicate(data)) {
          clearTimeout(timer);
          ws.removeListener("message", onMessage);
          resolve(data);
        }
      } catch {
        // ignore
      }
    }
    ws.on("message", onMessage);
  });
}

export function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

export function openJoined(url: string, nickname: string, room?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => {
      const joinedP = waitFor(ws, (d) => d.type === "joined");
      ws.send(JSON.stringify({ type: "join", nickname, ...(room ? { room } : {}) }));
      joinedP.then(() => resolve(ws), reject);
    });
    ws.once("error", reject);
  });
}
