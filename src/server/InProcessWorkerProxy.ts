// openfront-light: in-process replacement for the nginx routing in
// nginx.conf / generate-nginx-upstream.sh, used by the light self-host image
// (Dockerfile.light). A PaaS such as Clever Cloud exposes ONE port and
// terminates TLS itself, so the master (listening on that port) forwards the
// worker traffic to the workers on 127.0.0.1:3001+N:
//
//   - /wN/... (HTTP and WebSocket upgrades) -> worker N, path kept as is:
//     the worker strips its own prefix (WorkerPathPrefix.ts).
//   - the create-game endpoints -> a random worker, like the
//     `openfront_workers` nginx upstream (the worker mints a self-owned id).
//
// Plain node:http / node:net: a handful of players and 2-3 games never need
// more, and it adds no dependency.
import type { RequestHandler } from "express";
import http, { type IncomingMessage } from "http";
import net from "net";
import type { Duplex } from "stream";

const WORKER_PATH = /^\/w(\d+)(?:[/?]|$)/;

export const RANDOM_WORKER_PATHS = new Set([
  "/api/create_game",
  "/api/adminbot/create_game",
  "/api/adminbot/create_pool",
]);

export interface WorkerProxyOptions {
  numWorkers: number;
  // Port of worker N is basePort + N (Worker.ts listens on 3001 + WORKER_ID).
  basePort?: number;
  host?: string;
  // Injectable for tests.
  random?: () => number;
}

// Which worker port a request goes to, or null when the master serves it.
export function workerPortFor(
  url: string,
  opts: WorkerProxyOptions,
): number | null {
  const basePort = opts.basePort ?? 3001;
  const pathOnly = url.split("?")[0];
  if (RANDOM_WORKER_PATHS.has(pathOnly)) {
    const random = opts.random ?? Math.random;
    return basePort + Math.floor(random() * opts.numWorkers);
  }
  const match = WORKER_PATH.exec(url);
  if (match === null) return null;
  const index = Number(match[1]);
  // An index past the last worker would proxy to a port nothing listens on.
  if (!Number.isInteger(index) || index >= opts.numWorkers) return null;
  return basePort + index;
}

function forwardedHeaders(req: IncomingMessage): http.OutgoingHttpHeaders {
  const remote = req.socket.remoteAddress ?? "";
  const prior = req.headers["x-forwarded-for"];
  const encrypted = (req.socket as { encrypted?: boolean }).encrypted === true;
  return {
    ...req.headers,
    "x-forwarded-for": prior ? `${prior}, ${remote}` : remote,
    "x-forwarded-proto":
      req.headers["x-forwarded-proto"] ?? (encrypted ? "https" : "http"),
  };
}

// Express middleware for the HTTP side. Mount it before any body parser: the
// request body is streamed to the worker untouched.
export function workerHttpProxy(opts: WorkerProxyOptions): RequestHandler {
  const host = opts.host ?? "127.0.0.1";
  return (req, res, next) => {
    const port = workerPortFor(req.originalUrl, opts);
    if (port === null) {
      next();
      return;
    }
    const proxyReq = http.request(
      {
        host,
        port,
        method: req.method,
        path: req.originalUrl,
        headers: forwardedHeaders(req),
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.status(502).json({ error: "worker unavailable" });
      } else {
        res.destroy();
      }
    });
    req.pipe(proxyReq);
  };
}

// `upgrade` listener for the WebSocket side: replays the handshake to the
// worker and splices the two sockets together.
export function workerUpgradeProxy(
  opts: WorkerProxyOptions,
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const host = opts.host ?? "127.0.0.1";
  return (req, socket, head) => {
    const port = workerPortFor(req.url ?? "", opts);
    if (port === null) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = net.connect(port, host, () => {
      const headers = forwardedHeaders(req);
      let handshake = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        for (const v of Array.isArray(value) ? value : [value]) {
          handshake += `${name}: ${v}\r\n`;
        }
      }
      upstream.write(handshake + "\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.setNoDelay(true);
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
    socket.on("close", () => upstream.destroy());
  };
}
