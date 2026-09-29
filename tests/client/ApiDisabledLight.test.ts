import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: { jwtAudience: () => "localhost" },
}));

import { apiEnabled } from "../../src/client/ApiBase";
import { userAuth } from "../../src/client/Auth";
import { fetchCosmetics } from "../../src/client/Cosmetics";

// openfront-light: a self-hosted server has no closed-source API. The client
// must not call it (JWT refresh, cosmetics catalog) and must not warn about
// it on every page load.
describe("client without the closed-source API", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => {
      throw new TypeError("no API here");
    });
    vi.stubGlobal("fetch", fetchMock);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is off by default", () => {
    expect(apiEnabled()).toBe(false);
  });

  it("answers signed out without refreshing or warning", async () => {
    expect(await userAuth()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns no cosmetics catalog without fetching or warning", async () => {
    expect(await fetchCosmetics()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
