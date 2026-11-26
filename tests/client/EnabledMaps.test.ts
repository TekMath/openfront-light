// openfront-light: map subset of the light self-host image (OPENFRONT_MAPS).
import {
  GameMapType,
  listedMaps,
  maps,
} from "@openfront/engine-api/game/GameTypes";
import { describe, expect, it } from "vitest";
import {
  defaultMap,
  enabledMapTypes,
  filterEnabledMaps,
  isMapEnabled,
  mapDirName,
} from "../../src/client/utilities/EnabledMaps";

describe("EnabledMaps", () => {
  it("enables every map when no subset is baked in", () => {
    expect(enabledMapTypes()).toEqual(listedMaps.map((m) => m.type));
    expect(filterEnabledMaps(maps)).toHaveLength(maps.length);
    expect(defaultMap()).toBe(GameMapType.World);
  });

  it("uses the map directory names", () => {
    expect(mapDirName(GameMapType.AmazonRiver)).toBe("amazonriver");
    expect(mapDirName(GameMapType.World)).toBe("world");
  });

  it("restricts lists to the subset", () => {
    const subset = new Set(["europe", "iceland"]);
    expect(enabledMapTypes(subset)).toEqual([
      GameMapType.Europe,
      GameMapType.Iceland,
    ]);
    expect(filterEnabledMaps(maps, subset).map((m) => m.type)).toEqual([
      GameMapType.Europe,
      GameMapType.Iceland,
    ]);
    expect(isMapEnabled(GameMapType.World, subset)).toBe(false);
  });

  it("falls back to the first embedded map when World is left out", () => {
    expect(defaultMap(new Set(["iceland", "europe"]))).toBe(GameMapType.Europe);
    expect(defaultMap(new Set(["world", "europe"]))).toBe(GameMapType.World);
  });
});
