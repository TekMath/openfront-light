// openfront-light: the light self-host image can embed only a subset of the
// maps (OPENFRONT_MAPS at build time, see Dockerfile.light and
// docs/SelfHost.md): the map binaries are ~600 MB of the ~660 MB of assets.
// vite.config.ts bakes the subset in as __ENABLED_MAPS__ (lowercase map
// directory names, the same names FetchGameMapLoader loads from), or null for
// every map, the upstream behaviour.
import { GameMapType, MapInfo } from "../../core/game/Game";

declare const __ENABLED_MAPS__: string[] | null | undefined;

function bakedSubset(): ReadonlySet<string> | null {
  const subset =
    typeof __ENABLED_MAPS__ === "undefined" ? null : __ENABLED_MAPS__;
  return subset === null ? null : new Set(subset);
}

const enabledDirs = bakedSubset();

// The directory a map's assets live in: resources/maps/<enum key lowercased>.
export function mapDirName(map: GameMapType): string {
  const key = (
    Object.keys(GameMapType) as Array<keyof typeof GameMapType>
  ).find((k) => GameMapType[k] === map);
  return (key ?? "").toLowerCase();
}

export function isMapEnabled(
  map: GameMapType,
  subset: ReadonlySet<string> | null = enabledDirs,
): boolean {
  return subset === null || subset.has(mapDirName(map));
}

export function filterEnabledMaps(
  list: readonly MapInfo[],
  subset: ReadonlySet<string> | null = enabledDirs,
): MapInfo[] {
  return list.filter((m) => isMapEnabled(m.type, subset));
}

export function enabledMapTypes(
  subset: ReadonlySet<string> | null = enabledDirs,
): GameMapType[] {
  return Object.values(GameMapType).filter((m) => isMapEnabled(m, subset));
}

// The map a modal starts on: World as upstream, else the first embedded map.
export function defaultMap(
  subset: ReadonlySet<string> | null = enabledDirs,
): GameMapType {
  if (isMapEnabled(GameMapType.World, subset)) return GameMapType.World;
  return enabledMapTypes(subset)[0] ?? GameMapType.World;
}
