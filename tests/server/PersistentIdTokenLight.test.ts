import { afterEach, describe, expect, it, vi } from "vitest";
import { GameEnv } from "../../src/core/configuration/Config";
import { verifyClientToken } from "../../src/server/jwt";
import { ServerEnv } from "../../src/server/ServerEnv";

// openfront-light: no API issues JWTs, so a prod server must accept the bare
// persistentID a signed-out client sends (create_game, join, rejoin).
const persistentId = "123e4567-e89b-42d3-a456-426614174000";

describe("bare persistentID token outside Dev", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    ServerEnv.setApiEnabledForTests(false);
  });

  it("is accepted when the API is disabled (the light default)", async () => {
    vi.spyOn(ServerEnv, "env").mockReturnValue(GameEnv.Prod);
    expect(await verifyClientToken(persistentId)).toEqual({
      type: "success",
      persistentId,
      claims: null,
    });
  });

  it("is refused when the API is enabled (upstream behaviour)", async () => {
    vi.spyOn(ServerEnv, "env").mockReturnValue(GameEnv.Prod);
    ServerEnv.setApiEnabledForTests(true);
    expect(await verifyClientToken(persistentId)).toEqual({
      type: "error",
      message: "persistent ID not allowed in production",
    });
  });
});
