import EventEmitter from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MasterLobbyService } from "../../src/server/MasterLobbyService";
import { startPolling } from "../../src/server/PollingLoop";
import { ServerEnv } from "../../src/server/ServerEnv";

// openfront-light: the self-hosted master is built with public lobby
// scheduling turned off, so only solo and private games exist.

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({
      error: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

vi.mock("../../src/server/PollingLoop", () => ({
  startPolling: vi.fn(),
}));

function createMockWorker(): EventEmitter & { send: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
  };
  emitter.send = vi.fn();
  return emitter;
}

function schedulerTask(): () => Promise<void> {
  const calls = vi.mocked(startPolling).mock.calls;
  const call = calls.find(([, intervalMs]) => intervalMs === 1000);
  if (call === undefined) throw new Error("scheduler loop was not started");
  return call[0];
}

describe("MasterLobbyService with public lobbies disabled", () => {
  let worker: ReturnType<typeof createMockWorker>;
  let service: MasterLobbyService;
  let playlist: { gameConfig: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.stubEnv("DOMAIN", "localhost");
    vi.spyOn(ServerEnv, "numWorkers").mockReturnValue(1);
    playlist = { gameConfig: vi.fn(async () => ({})) };
    const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any;
    service = new MasterLobbyService(playlist as any, log, false, false);
    worker = createMockWorker();
    service.registerWorker(0, worker as any);
    worker.emit("message", { type: "workerReady", workerId: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(startPolling).mockClear();
  });

  it("never creates a scheduled public lobby", async () => {
    await schedulerTask()();
    await schedulerTask()();
    const creates = worker.send.mock.calls.filter(
      ([msg]) => msg.type === "createGame",
    );
    expect(creates).toHaveLength(0);
    expect(playlist.gameConfig).not.toHaveBeenCalled();
  });

  it("refuses a coordinator's request to create a public lobby", async () => {
    service.coordinatorHandlers().onCreateGame({
      publicGameType: "ffa",
    } as any);
    await Promise.resolve();
    const creates = worker.send.mock.calls.filter(
      ([msg]) => msg.type === "createGame",
    );
    expect(creates).toHaveLength(0);
  });

  it("still advertises hosted lobbies reported by workers", async () => {
    worker.emit("message", {
      type: "lobbyList",
      lobbies: [
        {
          gameID: "HOSTED01",
          publicGameType: "hosted",
          numClients: 1,
          createdAt: 1,
        },
      ],
    });
    const broadcast = vi
      .mocked(startPolling)
      .mock.calls.find(([, intervalMs]) => intervalMs === 500);
    await broadcast![0]();
    const msgs = worker.send.mock.calls.filter(
      ([msg]) => msg.type === "lobbiesBroadcast",
    );
    const last = msgs[msgs.length - 1][0];
    expect(last.publicGames.games.hosted.map((l: any) => l.gameID)).toEqual([
      "HOSTED01",
    ]);
    expect(last.publicGames.games.ffa).toHaveLength(0);
  });
});
