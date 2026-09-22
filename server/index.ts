import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");

export async function startServer(port = 3000): Promise<{ url: string; close: () => Promise<void> }> {
  const httpServer: Server = createServer(async (req, res) => {
    const pathname = normalize(new URL(req.url ?? "/", "http://x").pathname);
    const filePath = join(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

const isMain = process.argv[1] !== undefined && import.meta.filename === process.argv[1];
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const { url } = await startServer(port);
  console.log(`chat room listening on ${url}`);
}
