// openfront-light: build-time map subset (OPENFRONT_MAPS) of the light
// self-host image.
import { describe, expect, it } from "vitest";
import {
  filterMapAssets,
  parseMapSubset,
} from "../src/server/PublicAssetManifest";

const available = ["australia", "europe", "iceland", "world"];

describe("parseMapSubset", () => {
  it("means every map when empty", () => {
    expect(parseMapSubset(undefined, available)).toBeNull();
    expect(parseMapSubset("  ", available)).toBeNull();
    expect(parseMapSubset(",", available)).toBeNull();
  });

  it("normalises the list", () => {
    expect(parseMapSubset(" World,europe ,world", available)).toEqual([
      "europe",
      "world",
    ]);
  });

  it("fails on an unknown map", () => {
    expect(() => parseMapSubset("world,atlantis", available)).toThrow(
      /atlantis/,
    );
  });
});

describe("filterMapAssets", () => {
  const manifest = {
    "images/logo.png": "/_assets/images/logo.a.png",
    "maps/world/map.bin": "/_assets/maps/world/map.b.bin",
    "maps/europe/map.bin": "/_assets/maps/europe/map.c.bin",
    "maps/australia/manifest.json": "/_assets/maps/australia/manifest.d.json",
    "maps/australia/map4x.bin": "/_assets/maps/australia/map4x.e.bin",
    "maps/australia/map.bin": "/_assets/maps/australia/map.f.bin",
  };

  it("keeps everything without a subset", () => {
    expect(filterMapAssets(manifest, null)).toBe(manifest);
  });

  it("drops unlisted maps but keeps non-map assets and the preview map", () => {
    expect(Object.keys(filterMapAssets(manifest, ["world"])).sort()).toEqual([
      "images/logo.png",
      "maps/australia/manifest.json",
      "maps/australia/map4x.bin",
      "maps/world/map.bin",
    ]);
  });
});
