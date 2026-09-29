import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientEnv } from "../../src/client/ClientEnv";
import {
  backendReachable,
  backendUnreachableConfirmed,
  ensureServerList,
  refreshServerList,
  resetServerList,
  retryServerList,
  startServerListPolling,
  stopServerListPolling,
} from "../../src/client/ServerList";

// openfront-light: a self-hosted server has no closed-source API, so the
// client never asks it for the server list. Before this, every heartbeat
// failed and, after two, Create / Join lobby were greyed out with "Can't
// reach OpenFront servers".
describe("server list in the light build", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.BOOTSTRAP_CONFIG = {
      gameEnv: "dev",
      numWorkers: 2,
      turnstileSiteKey: "",
      jwtAudience: "localhost",
      instanceId: "test",
      gitCommit: "test",
    };
    ClientEnv.reset();
    resetServerList();
    fetchMock = vi.fn(async () => {
      throw new TypeError("no API here");
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    stopServerListPolling();
    resetServerList();
    vi.unstubAllGlobals();
    window.BOOTSTRAP_CONFIG = undefined;
    ClientEnv.reset();
  });

  it("never requests the list, and falls back to the page's own server", async () => {
    startServerListPolling();
    expect(await ensureServerList()).toBe("fallback");
    expect(await retryServerList()).toBe("fallback");
    expect(await refreshServerList()).toBe("fallback");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never reports the backend as unreachable", async () => {
    for (let i = 0; i < 5; i++) {
      await ensureServerList();
      await retryServerList();
    }
    expect(backendReachable()).toBeNull();
    expect(backendUnreachableConfirmed()).toBe(false);
  });
});
