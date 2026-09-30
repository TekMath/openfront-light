// openfront-light: the single-port light image forwards worker traffic from
// the master (src/server/InProcessWorkerProxy.ts) instead of nginx.
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import {
  workerHttpProxy,
  workerPortFor,
  workerUpgradeProxy,
} from "../../src/server/InProcessWorkerProxy";

describe("workerPortFor", () => {
  const opts = { numWorkers: 2, basePort: 3001, random: () => 0.99 };

  it("routes /wN/ paths to worker N", () => {
    expect(workerPortFor("/w0/api/game/abc", opts)).toBe(3001);
    expect(workerPortFor("/w1", opts)).toBe(3002);
    expect(workerPortFor("/w1?x=1", opts)).toBe(3002);
  });

  it("leaves master paths and unknown workers alone", () => {
    expect(workerPortFor("/", opts)).toBeNull();
    expect(workerPortFor("/api/health", opts)).toBeNull();
    expect(workerPortFor("/w2/api", opts)).toBeNull();
    expect(workerPortFor("/wiki", opts)).toBeNull();
  });

  it("sends create-game to a random worker", () => {
    expect(workerPortFor("/api/create_game", opts)).toBe(3002);
    expect(
      workerPortFor("/api/create_game", { ...opts, random: () => 0 }),
    ).toBe(3001);
    expect(workerPortFor("/api/adminbot/create_pool", opts)).toBe(3002);
  });
});

describe("in-process worker proxy", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length > 0) await closers.pop()!();
  });

  async function listen(server: http.Server): Promise<number> {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    closers.push(
      () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    );
    return (server.address() as AddressInfo).port;
  }

  async function setup() {
    const worker = express();
    worker.use(express.json());
    worker.post("/w0/api/echo", (req, res) => {
      res.json({ body: req.body, xff: req.headers["x-forwarded-for"] });
    });
    const workerServer = http.createServer(worker);
    const wss = new WebSocketServer({ server: workerServer });
    wss.on("connection", (ws, req) => {
      ws.on("message", (data) => ws.send(`${req.url}:${data.toString()}`));
    });
    closers.push(async () => wss.close());
    const workerPort = await listen(workerServer);

    const opts = { numWorkers: 1, basePort: workerPort };
    const master = express();
    master.use(workerHttpProxy(opts));
    master.use(express.json());
    master.get("/", (_req, res) => res.send("shell"));
    const masterServer = http.createServer(master);
    masterServer.on("upgrade", workerUpgradeProxy(opts));
    const masterPort = await listen(masterServer);
    return masterPort;
  }

  it("proxies HTTP requests with their body to the worker", async () => {
    const port = await setup();
    const res = await fetch(`http://127.0.0.1:${port}/w0/api/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.body).toEqual({ hello: "world" });
    expect(json.xff).toContain("127.0.0.1");
  });

  it("serves master routes itself", async () => {
    const port = await setup();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(await res.text()).toBe("shell");
  });

  it("proxies WebSocket upgrades to the worker", async () => {
    const port = await setup();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/w0/lobbies`);
    const reply = await new Promise<string>((resolve, reject) => {
      ws.on("open", () => ws.send("ping"));
      ws.on("message", (data) => resolve(data.toString()));
      ws.on("error", reject);
    });
    ws.close();
    expect(reply).toBe("/w0/lobbies:ping");
  });

  it("refuses upgrades that name no worker", async () => {
    const port = await setup();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/w5/lobbies`);
    const error = await new Promise<Error>((resolve) =>
      ws.on("error", resolve),
    );
    expect(error.message).toContain("404");
  });
});
