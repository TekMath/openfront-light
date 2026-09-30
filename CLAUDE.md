# CLAUDE.md

Guidance for Claude Code (and any other coding agent) working in this repository. Read it fully at the start of every session.

## Language rule

**Everything written in this repository must be in English**: code, identifiers, comments, commit messages, PR titles and descriptions, docs, test names, log messages and this file. This holds even when the user talks to you in another language: answer the user in their language, but write repository content in English.

The one exception is translation files: `resources/lang/*.json` other than `en.json` are managed by Crowdin. Never edit them.

## openfront-light: custom modifications (read first)

This checkout is **openfront-light**, a stripped-down fork of OpenFront meant to be self-hosted on a **private, non-public server**. It runs without the closed-source API, so everything that only makes sense on openfront.io (public matchmaking, ads, accounts, store, clans, leaderboards) is removed or hidden. The rest of this file describes upstream OpenFront; where it conflicts with this section, this section wins.

### Rule: document every modification here

**Every change made to this repository must be recorded in the changelog below, in the same commit as the change.** This applies to Claude and to any other agent or contributor. For each entry, give what was changed, why, and which files it touches, so a future upstream merge can tell a deliberate divergence from a bug. Also mark the code itself with an `openfront-light:` comment at each divergence from upstream, so `grep -rn "openfront-light:"` finds them all.

Guidelines for light changes:

- Prefer hiding an entry point or unmounting a component over deleting upstream modules, so upstream merges stay easy. Delete a module only when nothing needs it any more (e.g. the ad code).
- Keep the test suite green: update or remove the tests that asserted removed behaviour, and add tests for new light-specific behaviour.
- Remove UI text keys from `resources/lang/en.json` when they become unused (`tests/TranslationSystem.test.ts` enforces this). Never touch the other language files.

### Changelog

#### 1. No public lobbies: only solo and private games

- **Server**: `MasterLobbyService` takes a `schedulePublicLobbies` constructor flag (default `true`, so the upstream scheduler tests still run). `src/server/Master.ts` passes `false`, so the master never creates scheduled `ffa` / `team` / `special` lobbies and refuses a lobby coordinator's `createGame`. Hosted (private) lobbies are unaffected. Test: `tests/server/MasterLobbyServiceNoPublicLobbies.test.ts`.
- **Client home screen** (`src/client/GameModeSelector.ts`): only **Solo** (+ **Tutorial** for new players) and **Create Lobby** / **Join Lobby** remain. The public lobby cards, the "Upcoming" link to the lobby browser, the Ranked button, and the hosted-lobby badge on Join are removed. The exported gating helpers (`shouldBlockMultiplayerAction`, `shouldBlockJoin`, ...) are kept because `Main.ts` and `DetailedGameViewModal` use them. The public-lobby socket is still opened, but only for its "new build deployed, reload" signal; its lobby snapshots are ignored.
- **Private lobby modal** (`src/client/HostLobbyModal.ts`): the Private/Public listing toggle is no longer rendered (listing needs an API subscription and there is no lobby browser any more). The underlying code is left in place.
- Tests updated: `GameModeSelectorGatingWiring`, `GameModeSelectorRestart`, `ReachabilityGating` (lobby-card cases removed); `tests/client/TrustedJoinGate.test.ts` deleted (it only covered joining public cards from the home screen).

#### 2. No ads, promos or upstream tracking

- Deleted: `src/client/AdGatekeeper.ts`, `src/client/Admiral.ts`, `src/client/HomepagePromos.ts`, `src/client/hud/layers/InGamePromo.ts`, `tests/AdGatekeeper.test.ts`.
- `src/client/Main.ts`: `window.adsEnabled` is always `false`; the Admiral / ad-block gate wiring, the `HomepagePromos` and `FeaturedStream` imports, the Playwire `PageOS` page-view call and the `ramp` / `Bolt` / `PageOS` window typings are removed.
- `index.html`: removed the Playwire (`ramp.js`), Google Ad Manager (`googletag`), Google Ads / Analytics (`gtag`) and Cloudflare Web Analytics tags, the Playwire / Funding Choices CSS, and the `<homepage-promos>`, `<in-game-promo>` and `<featured-stream>` (Twitch) elements. The CrazyGames SDK and Turnstile scripts are kept (other code waits on them); CrazyGames midgame ads only fire on crazygames.com, so they never run here.
- `src/client/hud/GameRenderer.ts`: the `InGamePromo` layer is gone.
- `src/client/MenuChrome.ts`: no longer reopens `<homepage-promos>`.
- `src/client/components/PlayPage.ts`: removed the upstream news banner (`<news-box>`, fed by the API), the Twitch "Streaming Now" panel and the Steam wishlist widget. `src/client/components/Footer.ts`: removed the Steam wishlist button.
- `src/client/hud/layers/WinModal.ts`: removed the end-of-game promos (Steam wishlist, cosmetic store, Discord invite); new players who lose still get the tutorial video.
- Tests updated: `MenuChrome`, `MainInitialize` (`adsEnabled` is now `false`), `GameRendererCreate`, `WinModal`.

#### 3. No links to proprietary / API-backed pages in the menu

- `src/client/components/DesktopNavBar.ts` and `MobileNavBar.ts`: removed the **Store**, **Inventory**, **Leaderboard** and **Clans** links and the profile / login menu (`<nav-account-menu>`). What remains: Play, plus the news (local changelog), help and settings icons (`NavUtilityIcons`). The same account menu is removed from the mobile top bar in `PlayPage.ts`.
- The page components themselves (`store-modal`, `inventory-modal`, `clan-modal`, `account-modal`, ...) are still mounted in `index.html` and reachable by `#modal=` deep links; they are simply no longer linked.
- Footer community links (GitHub, Reddit, Discord, wiki) and the Terms / Privacy pages are kept.
- Tests updated: `NavBars.settings`, `PlayPageTopBar`, `InventoryNavigation`.
- Removed now-unused `en.json` keys: `main.clans`, `main.inventory`, `main.leaderboard`, the public-lobby `mode_selector.*` / `public_lobby.*` keys, and the win-modal promo keys.

#### 4. No server-list API: Create / Join lobby are never greyed out

- **Problem**: the client polls the closed-source API for the server list (`/cluster.json`). Without the API, every heartbeat failed, and after two failures (about 10 s) `backendUnreachableConfirmed()` became true and greyed out Create / Join lobby with "Can't reach OpenFront servers".
- **Fix** (`src/client/ServerList.ts`): a module flag `serverListApiEnabled`, `false` in the light build. `fetchOnce()` returns no list without touching the network, and `startServerListPolling()` starts no heartbeat. Reachability stays unknown (never "confirmed unreachable"), and `apply()` answers `"fallback"`, so every own-server call uses the page's own server from `BOOTSTRAP_CONFIG`, which is what an upstream page does when the API is down.
- `setServerListApiEnabledForTests(true)` turns the upstream behaviour back on. The suites written against it call it: `tests/client/ServerList.test.ts`, `DesktopStatusBar`, `DetailedGameViewModalGatingWiring`, `ReachabilityGating`, `LobbySocket`, `MainInitialize`. The light default is covered by `tests/client/ServerListLight.test.ts`.

#### 5. Quiet Vite dev warning for `resources/` imports

- In dev, Vite's `publicDir` is `resources/`, and the client deliberately imports files from it as modules through the `resources` alias (atlas metadata, `lang/en.json`, `version.txt`, `QuickChat.json`, `countries.json`, ...). Vite printed "Assets in public directory cannot be imported from JavaScript" for each one on every `npm run dev`.
- `vite.config.ts` sets a `customLogger` (`quietResourcesImportWarnings`) that drops only that warning, and only for paths under `/resources/`. All other Vite output is unchanged.

#### 6. No calls to the closed-source API, and no log noise about it

Every background call to the absent API failed and logged, on every start or every few seconds. The calls are now skipped, not just silenced:

- **Server** (`src/server/Worker.ts`): the ranked check-in loops (`startRankedCheckinLoops`, "Error polling 1v1/2v2 lobby") are no longer started, and the `PrivilegeRefresher` (`cosmetics.json` + `reserved_clan_tags`) is never `start()`ed, so `get()` answers with the fail-open checker, as it did when the fetch failed. The now-unused worker `MapPlaylist` is removed.
- **Server** (`src/server/GameServer.ts`): `defaultGameServerDeps().archive` is a no-op. Finished games are not POSTed to the API archive ("error archiving game record").
- **Client** (`src/client/ApiBase.ts`): new `apiEnabled()` switch, `false` in the light build. `userAuth()` (`src/client/Auth.ts`) answers "signed out" without trying `/auth/refresh`, and `fetchCosmetics()` (`src/client/Cosmetics.ts`) returns `null` without fetching. That removes the relayed "Refresh failed", "No JWT found and shouldRefresh is false" and "Error getting cosmetics" warnings. `setApiEnabledForTests(true)` restores the upstream path in the suites written against it (Auth*, Cosmetic*, `AuthLogoutAnnounce`, `GrantedSubscriptionPurchase`, `InventoryRetryCache`). The light default is covered by `tests/client/ApiDisabledLight.test.ts`.
- **Startup noise**: `dotenv.config({ quiet: true })` in `Server.ts`, `Logger.ts` and `WorkerMetrics.ts` (no more "injected env ... tip: ..." banner per process), no "No OTLP endpoint ..., remote logging disabled" line in `Logger.ts` (the normal state here; "OTEL enabled" is still printed when it is on), and `index.html` adds `dev-mode` to `globalThis.litIssuedWarnings` so Lit's "Lit is in dev mode" notice is not relayed to the terminal (Lit's other dev warnings still show). `tests/RenderDesktopDescriptor.test.ts` no longer expects the OTLP line.
- Deliberately kept: Vite's `ws proxy error: ECONNREFUSED`, which can appear once when the browser connects in the ~2 s before the game server's workers listen. It is a real proxy error and would also report a crashed server.

#### 7. Light self-host image (`Dockerfile.light`)

- **Why**: the upstream image (nginx + supervisord + `tsx` + full `node_modules` + every map) is built for openfront.io. A private server for 2-3 games behind a PaaS such as Clever Cloud (one port, TLS at the platform) needs much less. Guide: `docs/SelfHost.md`.
- **Image**: `Dockerfile.light` (+ `Dockerfile.light.dockerignore`) builds the client, bundles the server with esbuild (`npm run build-server-light`, output `dist/server/Server.mjs`, gitignored), and ships only `static/` + `dist/` on `node:24-alpine`. Defaults: `GAME_ENV=prod`, `PORT=8080`, `WORKER_PROXY=inprocess`, `NUM_WORKERS=1`, `INSTANCE_LETTER=a`, the always-pass Turnstile test key. The upstream `Dockerfile` is unchanged.
- **Single port** (`src/server/InProcessWorkerProxy.ts`, mounted in `Master.ts`): with `WORKER_PROXY=inprocess` the master forwards `/wN/` HTTP and WebSocket upgrades to worker N and the create-game endpoints to a random worker, replacing the nginx routing. `ServerEnv.masterPort()` reads `PORT` (default 3000). Test: `tests/server/InProcessWorkerProxy.test.ts`.
- **No `join_verify` call** (`src/server/Worker.ts`): new `ServerEnv.apiEnabled()` (`false`, `setApiEnabledForTests`). Outside Dev, first joins used to call the API's `/join_verify` and fail open after the error. They are now screened locally with `censorPlayer()`, as in Dev.
- **Map subset**: build-time `OPENFRONT_MAPS` (map directory names; empty = all maps, the upstream behaviour). `parseMapSubset` / `filterMapAssets` in `src/server/PublicAssetManifest.ts` drop the other maps from the asset manifest and `static/` (Australia's preview terrain is always kept for the cosmetics preview). `vite.config.ts` bakes `__ENABLED_MAPS__`, read by `src/client/utilities/EnabledMaps.ts`, which filters `MapPicker.ts`, `getRandomMapType()` (`GameConfigHelpers.ts`) and the default map of `SinglePlayerModal.ts` / `HostLobbyModal.ts`. Tests: `tests/MapSubsetAssets.test.ts`, `tests/client/EnabledMaps.test.ts`.
- **README**: `README.md` is rewritten for openfront-light (concept, the prebuilt `ghcr.io/tekmath/openfront-light:latest` image and its maps, building your own image, environment variables). The upstream README is not kept.

#### 8. GitHub Actions: checks, then build and publish the light image

- `.github/workflows/ci.yml` is the only pipeline. On every PR and push it runs lint, Prettier, tests, typecheck + `build-server-light`, and the generated-maps check. When they all pass, it builds `Dockerfile.light` for `linux/amd64`. It pushes to GHCR (`ghcr.io/<owner>/openfront-light`, with a registry layer cache under `:buildcache`) only from `main` (`latest`) and `v*` tags. The maps come from the `OPENFRONT_MAPS` repository variable, with the prebuilt-image selection as the default.
- Removed upstream workflows that deploy to or automate openfront.io: `deploy.yml`, `release.yml`, `pr-gate.yml`, `issue-lifecycle-*.yml`, `pr-author.yml`, `pr-close-on-label.yml`, `pr-description.yml`, `pr-stale.yml`, `cherry-pick-milestone.yml`, `claude-code-review.yml`. The upstream-specific issue templates (`database_request`, `new-contribution-template-*`) are removed too. `scripts/pr-gate/` and `scripts/issue-lifecycle/` are kept (`tests/PrGateRules.test.ts` still covers the former).
- `.github/PULL_REQUEST_TEMPLATE.md` and `CODEOWNERS` now describe this fork instead of upstream's approved-issue process and teams.

#### Known remaining upstream behaviour

- Other API-backed features (store, clans, account pages, ...) still call the API when a player opens them through a `#modal=` deep link; they are not linked from the menu (see 3).
- `npm warn Unknown project config "allow-remote"` (and `allow-file`, `allow-directory`) comes from running npm 11: those `.npmrc` keys exist in npm 12, which the repo requires.
- `tests/DeployIdentity.test.ts > refuses letter "C"` fails on macOS on upstream `HEAD` too (unrelated to the light changes).

## What this project is

OpenFront.io is a real-time multiplayer territorial strategy game played in the browser (a fork and rewrite of WarFront.io). Players expand territory, build structures, form alliances, and fight on maps based on real-world geography.

- Upstream: `https://github.com/openfrontio/OpenFrontIO` (this checkout's `origin`).
- Maintainer with final authority on changes: evan (`@evanpelle`). See `CONTRIBUTING.md` for the approved-issue workflow. PRs without a linked `approved` issue get auto-closed (except small bug fixes).
- License: code is AGPL v3 (with Section 7 attribution terms), assets in `resources/` are CC BY-SA 4.0, and assets in `proprietary/` are All Rights Reserved. See `LICENSING.md`.

## Open source vs proprietary / closed source

Know which parts you can read and change here and which ones only exist elsewhere. **Never invent the behavior of a closed-source component.** If a task depends on one, say so and work only from the contract visible in this repo (Zod schemas, HTTP calls, docs).

### In this repo (open source, editable)

| Area                          | Path                                           |
| ----------------------------- | ---------------------------------------------- |
| Deterministic game simulation | `src/core/`                                    |
| Browser client (UI + WebGL)   | `src/client/`                                  |
| Game server (lobbies, relay)  | `src/server/`                                  |
| Binary wire format library    | `zbin/`                                        |
| Map generator (Go)            | `map-generator/`                               |
| Open assets (CC BY-SA 4.0)    | `resources/`                                   |
| Docker image, nginx, deploy   | `Dockerfile`, `nginx.conf`, `*.sh`             |
| CI and repo automation        | `.github/workflows/`, `scripts/`               |
| Tests                         | `tests/`                                       |
| Agent skills for this repo    | `.claude/skills/` (`run-openfront`, `release`) |

### In this repo but proprietary

- `proprietary/`: logos, favicon, the `OpenFront.ttf` font, and sounds/music. They are **All Rights Reserved** (see `proprietary/LICENSE`). The build resolves each asset from `resources/` first, then from `proprietary/` (`src/server/PublicAssetManifest.ts`, `vite.config.ts`). You may reference these files from code, but never copy them into `resources/`, relicense them, or re-export them.

### Not in this repo (closed source or private; you cannot access them)

| Component                     | What it does                                                                                                                                                                                                                                 | How this repo talks to it                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API** (Cloudflare Worker)   | Auth (JWT issuing, refresh tokens, JWKS), accounts, stats, game archive, leaderboards, clans, friends, cosmetics, store/payments, server registry (instance letters, worker counts), matchmaking and ranked queues, R2 asset upload endpoint | HTTP JSON at `https://api.<DOMAIN>` (`http://localhost:8787` in dev). Schemas: `src/core/ApiSchemas.ts`, `ClanApiSchemas.ts`, `CosmeticSchemas.ts`, `StatsSchemas.ts`. Docs: `docs/API.md`, `docs/Auth.md` |
| **Lobby coordinator**         | One Durable Object per site that merges every master's public lobbies and schedules them                                                                                                                                                     | WebSocket from `src/server/LobbyCoordinatorClient.ts`, enabled by `LOBBY_COORDINATOR=api`                                                                                                                  |
| **Static site Worker**        | Serves the page shell from the CDN on the page host (`<subdomain>.<DOMAIN>`) under Server list v2                                                                                                                                            | `docs/MultiServer.md` ("Server list v2"), `src/server/RenderHtml.ts`, `src/core/ServerList.ts`                                                                                                             |
| **Infra repo**                | Infra docs (e.g. `docs/lobby-coordinator.md`) and Cloudflare setup                                                                                                                                                                           | Referenced in comments only                                                                                                                                                                                |
| **openfront-desktop**         | Steam / desktop shell (Electron-style app, runtime asset updating)                                                                                                                                                                           | `/desktop/version.json` and `/desktop/release.json` (`src/server/DesktopRelease.ts`), `src/client/Desktop*.ts`, `SteamSDK.ts`                                                                              |
| **CDN / R2 bucket, database** | Hashed static assets, premium cosmetics (skins, patterns, flags, effects)                                                                                                                                                                    | `CDN_BASE`, `update.sh` uploads assets via the API                                                                                                                                                         |
| **Gatekeeper** (removed)      | Former anti-bot / rate-limit / fingerprinting module                                                                                                                                                                                         | Removed in #2012 because it was not AGPL compatible. `.gitmodules` and `src/server/README.md` are leftovers. The submodule does not exist; CI checks out with `submodules: false`                          |
| Third parties                 | Cloudflare Turnstile, Stripe, Grafana Faro, OpenTelemetry collector, CrazyGames SDK, Steam, Crowdin                                                                                                                                          | Keys and URLs come from env vars (see below)                                                                                                                                                               |

Local dev runs **without** the API: the client falls back to `http://localhost:8787` (or `localStorage.apiHost`), and the server accepts a bare `persistentID` as the auth token instead of a JWT (`src/server/jwt.ts`; JWTs are still verified when sent). Use `npm run dev:staging` or `npm run dev:prod` to point a local client at the real staging (`api.openfront.dev`) or production (`api.openfront.io`) API.

## Repository layout

```
.
├── src/
│   ├── core/          Deterministic simulation (runs in a Web Worker). Minimal external deps (zod, zbin, a few utils).
│   ├── client/        Browser app: Lit UI, WebGL2 renderer, input, sound, networking
│   └── server/        Node.js game server: master + worker processes (Express + ws)
├── zbin/              Compact binary codec for zod schemas (self-contained, zod-only). See zbin/README.md
├── map-generator/     Go tool: PNG + info.json -> binary maps in resources/maps + src/core/game/Maps.gen.ts
├── resources/         Open assets: maps, lang/*.json, images, sprites, atlases, flags, sounds, fonts,
│                      public/ (served at site root), news.json, changelog.md, version.txt
├── proprietary/       All-rights-reserved assets (logos, font, sounds)
├── tests/             Vitest suites (+ perf/, replay/, matchmaking/ scripts)
├── docs/              Architecture.md, API.md, Auth.md, Maps.md, MultiServer.md, GameServerRefactor.md
├── scripts/           buildAssetHashes.ts (post-build), pr-gate/ and issue-lifecycle/ (GitHub bots)
├── .github/workflows/ CI, deploy, release, PR/issue automation, Claude code review
├── .claude/skills/    run-openfront (drive the game in headless Chromium), release (cut a patch release)
├── index.html         App shell template (EJS placeholders filled by src/server/RenderHtml.ts)
├── vite.config.ts     Build + dev server (port 9000) + dev proxies + Vitest config
├── Dockerfile         Multi-stage image: nginx + supervisord + node server
├── nginx.conf         In-container routing: master :3000, workers :3001+N via /wN/
└── build.sh / deploy.sh / build-deploy.sh / update.sh / setup.sh   Build, ship and host provisioning
```

There is a nested `src/client/render/CLAUDE.md` with detailed renderer guidance. Read it before touching `src/client/render/`.

## Where each kind of feature lives

| If you are working on...                                          | Look in                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new player action (intent)                                      | Schema in `src/core/Schemas.ts` → execution in `src/core/execution/` → wiring in `src/core/execution/ExecutionManager.ts` → client sender (`src/client/Transport.ts`) → server authorization (`src/server/IntentAuthorization.ts`) |
| Game rules, balance numbers, costs, timings                       | `src/core/configuration/Config.ts`                                                                                                                                                                                                 |
| Simulation orchestrator (turn in, tick, updates out)              | `src/core/GameRunner.ts`                                                                                                                                                                                                           |
| Game state model (players, units, tiles, alliances)               | `src/core/game/` (`Game.ts` interfaces, `GameImpl.ts`, `PlayerImpl.ts`, `UnitImpl.ts`, `AllianceImpl.ts`, `RailNetwork*.ts`)                                                                                                       |
| Attacks, boats, nukes, SAMs, warships, trade, trains              | `src/core/execution/*Execution.ts`                                                                                                                                                                                                 |
| Alliances                                                         | `src/core/execution/alliance/`, `src/core/game/Alliance*Impl.ts`                                                                                                                                                                   |
| AI nations and tribes (bots)                                      | `src/core/execution/NationExecution.ts`, `src/core/execution/nation/`, `TribeExecution.ts`, `TribeSpawner.ts`, `src/core/game/NationCreation.ts`                                                                                   |
| Pathfinding (land, water, rail, air)                              | `src/core/pathfinding/`                                                                                                                                                                                                            |
| Game updates sent from core to client                             | `src/core/game/GameUpdates.ts`, `GameUpdateUtils.ts`                                                                                                                                                                               |
| Save / snapshot / rejoin state                                    | `src/core/snapshot/` (see its `README.md`)                                                                                                                                                                                         |
| Worker thread plumbing                                            | `src/core/worker/`, `src/core/WorkerSchemas.ts`                                                                                                                                                                                    |
| Deterministic math and RNG                                        | `src/core/DetMath.ts`, `src/core/PseudoRandom.ts`                                                                                                                                                                                  |
| Wire messages (WebSocket)                                         | `src/core/Schemas.ts` + `src/core/ZbinWire.ts` (built on `zbin/`)                                                                                                                                                                  |
| Maps (add or edit)                                                | `map-generator/assets/maps/<map>/{image.png,info.json}`, then `npm run gen-maps`. Never hand-edit `src/core/game/Maps.gen.ts` or `resources/maps/`                                                                                 |
| Client entry point, boot, routing between pages                   | `src/client/Main.ts`, `ModalRouter.ts`, `Navigation.ts`, `Layout.ts`, `BootInterrupts.ts`                                                                                                                                          |
| Running a game on the client                                      | `src/client/ClientGameRunner.ts`, `src/client/view/` (client-side mirror of game state: `GameView`, `PlayerView`, `UnitView`)                                                                                                      |
| Map rendering (WebGL2 passes, shaders, themes)                    | `src/client/render/` (`gl/passes/`, `gl/shaders/*.glsl`, `gl/render-settings.json`, `gl/*-theme.json`)                                                                                                                             |
| In-game HUD (sidebars, radial menu, build menu, chat, win modal)  | `src/client/hud/layers/`                                                                                                                                                                                                           |
| Input, camera, hover and selection logic                          | `src/client/InputHandler.ts`, `TransformHandler.ts`, `src/client/controllers/`                                                                                                                                                     |
| Menu pages and modals (lobby, account, store, clans, leaderboard) | `src/client/*Modal.ts`, `src/client/components/` (Lit components; `baseComponents/`, `clan/`, `leaderboard/`, `map/`, `ui/`)                                                                                                       |
| Styling                                                           | Tailwind CSS 4 in Lit components, `src/client/styles/`, `src/client/styles.css`, `src/client/theme/`                                                                                                                               |
| Sound and music                                                   | `src/client/sound/`                                                                                                                                                                                                                |
| Auth, API calls from the client                                   | `src/client/Auth.ts`, `Api.ts`, `ApiBase.ts`, `ClanApi.ts`, `FriendsApi.ts`                                                                                                                                                        |
| Cosmetics, store, payments, subscriptions                         | `src/client/Cosmetics.ts`, `Store.ts`, `Payments.ts`, `StripeInline.ts`, `SubscriptionModal.ts`, `src/core/CosmeticSchemas.ts`                                                                                                     |
| Matchmaking and ranked                                            | `src/client/Matchmaking.ts`, `components/RankedModal.ts`, `src/server/RankedCheckin.ts`, `PoolRouting.ts`                                                                                                                          |
| Desktop / Steam / CrazyGames platform integrations                | `src/client/Desktop*.ts`, `Steam*.ts`, `CrazyGames*.ts`, `ClientPlatform.ts`, `src/server/DesktopRelease.ts`                                                                                                                       |
| Ads                                                               | `src/client/AdGatekeeper.ts`, `Admiral.ts`, `HomepagePromos.ts`, `hud/layers/InGamePromo.ts`                                                                                                                                       |
| Server process model and HTTP routes                              | `src/server/Server.ts` (entry), `Master.ts` (port 3000, lobbies, app shell), `Worker.ts` (ports 3001+N, games)                                                                                                                     |
| Per-game server logic (turns, clients, desync, rejoin)            | `src/server/GameServer.ts`, `GameManager.ts`, `Client.ts`, `Roster.ts`, `Rejoin.ts`, `DesyncDetector.ts`, `Consensus.ts`                                                                                                           |
| Public lobbies and map rotation                                   | `src/server/MasterLobbyService.ts`, `WorkerLobbyService.ts`, `MapPlaylist.ts`, `LobbyCoordinatorClient.ts`                                                                                                                         |
| Admin bot HTTP API                                                | `src/server/AdminBotRoutes.ts`                                                                                                                                                                                                     |
| Multi-server identity and routing                                 | `src/server/ServerEnv.ts`, `ClusterCheckin.ts`, `src/core/ClusterConfig.ts`, `src/core/ServerList.ts`, `src/client/ServerList.ts`, `docs/MultiServer.md`                                                                           |
| Server-side HTML and asset manifest                               | `src/server/RenderHtml.ts`, `PublicAssetManifest.ts`, `RuntimeAssetManifest.ts`, `src/core/AssetUrls.ts`                                                                                                                           |
| Name / chat moderation                                            | `src/server/Censor.ts`, `NameVisibility.ts`, `src/core/validations/username.ts`                                                                                                                                                    |
| Server logging, metrics, match telemetry                          | `src/server/Logger.ts`, `OtelResource.ts`, `WorkerMetrics.ts`, `src/server/telemetry/`                                                                                                                                             |
| Client telemetry                                                  | `src/client/Telemetry.ts`, `GameMetrics.ts` (Grafana Faro)                                                                                                                                                                         |
| UI text                                                           | `resources/lang/en.json` + `translateText()`                                                                                                                                                                                       |

## Architecture

### Components

1. **`src/core/`**: the deterministic simulation. Pure TypeScript with **minimal external runtime dependencies**: zod and `zbin`, plus `jose` (only `base64url`, in `Base64.ts` / `CosmeticSchemas.ts`) and `nanoid` / `dompurify` (in `Util.ts`). Do not add new ones. It must stay fully deterministic: seeded PRNG (`PseudoRandom`), integer / fixed-point math (`DetMath`), no `Math.random()`, no `Date.now()`, no iteration over unordered state that could differ between clients. It runs in a Web Worker on each client. **Every change to `src/core` must include tests.**
2. **`src/client/`**: Lit web components + Tailwind CSS 4 for the UI, a custom **WebGL2 renderer** for the map (`src/client/render/`, no Pixi.js), Howler.js for audio, and WebSocket communication.
3. **`src/server/`**: Node.js, Express 5 and `ws`. It coordinates lobbies and relays intents. It never runs the simulation for gameplay.
4. **API**: the closed-source Cloudflare Worker described above.

### Simulation flow (Intent → Execution)

The simulation runs **on every client**. The server only relays intents.

1. A player action makes the client create an **Intent**, which goes to the server.
2. The server bundles every intent of a tick into a **Turn** (every 100 ms, `ServerEnv.turnIntervalMs`) and relays it to all clients.
3. The client forwards the Turn to the core worker.
4. Core creates an **Execution** for each intent. Executions are the only thing allowed to mutate game state.
5. Core calls `executeNextTick()` and every execution runs.
6. Core sends **GameUpdates** back to the client, which renders them (the renderer runs at 60 fps and the simulation at about 10 Hz).

Clients send state hashes. The server detects desyncs (`DesyncDetector.ts`), so any non-determinism in core is a real bug.

### Wire format

Intents and every wire message are Zod schemas in `src/core/Schemas.ts`. Every WebSocket frame uses the compact binary encoding in `src/core/ZbinWire.ts` (library: `zbin/`, docs: `zbin/README.md`). HTTP stays JSON. Changing a schema changes the wire format, so keep client and server in lockstep and check replay compatibility (`src/client/VersionedReplay.ts`).

### Server process model

`src/server/Server.ts` uses Node `cluster`:

- **Master** (port `3000`): serves the rendered `index.html` app shell and static files, the public lobby list, desktop release descriptors, cluster check-in with the API registry, and the lobby coordinator connection.
- **Workers** (ports `3001 + index`, count = `NUM_WORKERS`): host the games (WebSocket + game APIs). A game ID routes to worker `simpleHash(gameID) % NUM_WORKERS`, reached under the path prefix `/wN/`.
- The first character of every game ID is the deployment's **instance letter** (`INSTANCE_LETTER`), which is how a game ID names its server (see `docs/MultiServer.md`).

In production, nginx inside the container routes `/wN/...` to the right worker port and `/api/create_game` to a random worker (`generate-nginx-upstream.sh` writes the upstream from `NUM_WORKERS` at container start). In dev, `vite.config.ts` reproduces this with proxies (`/w0` and `/w1` are hard-coded, matching the dev default of 2 workers; a random-worker middleware handles `/api/create_game`).

### CDN / static assets

The game server only renders `index.html` and serves the WebSocket and game APIs. Every other asset (JS bundle, images, maps, worker) comes from a CDN bucket. `CDN_BASE` is empty in dev (same origin) and a full origin such as `https://cdn.example.com` in production (no path, no trailing slash). It is a Vite build-time variable and a server runtime env var. Asset hashes are produced by `scripts/buildAssetHashes.ts` after `vite build`.

## Running locally

### Prerequisites

- Node.js `>=24.15.0 <25` and npm `>=12.1.0 <13` (enforced by `engine-strict`). If Node ships an older npm: `npm install --global --ignore-scripts npm@12.1.0`.
- Go (version in `map-generator/go.mod`), only needed for `npm run gen-maps`.

### Install

```bash
npm run inst # = npm ci --ignore-scripts. NEVER use `npm install` / `npm i`.
```

`.npmrc` enforces `ignore-scripts`, `min-release-age=7` (no dependency release younger than 7 days) and bans git, remote, file and directory dependencies. Do not work around these rules. Adding or upgrading a dependency needs an explicit maintainer decision.

### Commands

```bash
npm run dev              # Client (Vite, http://localhost:9000) + server (master :3000, workers :3001-3002) with hot reload
npm run dev:host         # Same, exposed on the LAN (VITE_HOST=lan)
npm run dev:staging      # Local client/server against the staging API (api.openfront.dev)
npm run dev:prod         # Local client/server against the production API (api.openfront.io)
npm run start:client     # Vite only
npm run start:server-dev # Server only, with dev-safe env (GAME_ENV=dev, dummy keys, DOMAIN=localhost)
npm run start:server     # Server with the real env (used in the container)
npm run build-dev        # tsc --noEmit + vite build --mode development
npm run build-prod       # tsc --noEmit + vite build + scripts/buildAssetHashes.ts (output in static/)
npm run tunnel           # build-prod then start:server

npm test              # vitest run && vitest run tests/server
npm run test:coverage # Tests with coverage (what CI runs)
npm run lint          # Oxlint + ESLint
npm run lint:fix      # Oxlint + ESLint with auto-fix
npm run format        # Prettier (CI runs `npx prettier --check .`)
npm run gen-maps      # Regenerate maps with the Go map-generator, then format (CI fails if the output is stale)

npm run perf             # Perf suites (tests/perf/); also perf:game, perf:client, perf:client-mem, perf:client-tick
npm run replay:game      # Replay a recorded game (tests/replay/)
npm run test:matchmaking # Matchmaking harness; also test:matchmaking:e2e, test:matchmaking:cancel
```

Run a single test:

```bash
npx vitest tests/YourTest.test.ts --run
npx vitest NationAllianceBehavior --run # match by name pattern
```

To launch and drive the real game (screenshots, clicking through lobbies, spawning, reading live sim state), use the `run-openfront` skill in `.claude/skills/run-openfront/`.

To replay a production game locally, check out the game's `gitCommit` (from `https://api.openfront.io/game/<gameId>`) and use `npm run dev:prod`.

## Environment variables

Local dev needs **no `.env` file**: `npm run dev` / `start:server-dev` inject safe defaults. `dotenv` loads `.env` if one exists (`.env*` is gitignored). `example.env` shows the deploy-side shape.

### Server runtime (read in `src/server/ServerEnv.ts` unless noted)

| Variable                                             | Required                | Purpose                                                                                              |
| ---------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `GAME_ENV`                                           | yes                     | `dev`, `staging` (preprod) or `prod` (`parseGameEnv` in `src/core/configuration/Config.ts`)          |
| `DOMAIN`                                             | yes                     | JWT audience and page domain. The API is `api.<DOMAIN>`, or `localhost:8787` when `DOMAIN=localhost` |
| `GIT_COMMIT`                                         | yes                     | Build version (baked into the Docker image, `DEV` locally)                                           |
| `TURNSTILE_SITE_KEY`                                 | yes                     | Cloudflare Turnstile site key (dev uses the test key `1x00000000000000000000AA`)                     |
| `API_KEY`                                            | yes (deployed)          | Server-to-API secret (check-in, archive, asset upload)                                               |
| `ADMIN_BOT_API_KEY`                                  | yes (deployed)          | Auth for `src/server/AdminBotRoutes.ts`                                                              |
| `NUM_WORKERS`                                        | yes (deployed; dev = 2) | Worker process count. Must match nginx; only change it after the letter has drained                  |
| `INSTANCE_LETTER`                                    | yes (deployed; dev = a) | One lowercase letter that prefixes every game ID minted here                                         |
| `SUBDOMAIN`, `GAME_DOMAIN`, `GAME_HOST`, `SITE_HOST` | deployed                | Public game host and page host derivation (`docs/MultiServer.md`, "Two hostnames per deployment")    |
| `HOST`, `MACHINE`                                    | deployed                | Machine name reported at check-in                                                                    |
| `CDN_BASE`                                           | prod                    | CDN origin for hashed assets (empty = same origin)                                                   |
| `LOBBY_COORDINATOR`                                  | optional                | `api` joins the site's shared lobby roster; anything else keeps single-server scheduling             |
| `STRIPE_PUBLISHABLE_KEY`                             | optional                | Enables inline Stripe checkout                                                                       |
| `FARO_COLLECTOR_URL`                                 | optional                | Grafana Faro URL for browser telemetry (off when empty)                                              |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_AUTH_HEADER`    | optional                | Server OpenTelemetry export (never enabled in dev)                                                   |
| `ALLOWED_FLARES`                                     | optional                | Comma-separated list; when set, workers refuse anonymous (no-JWT) players (`src/server/Worker.ts`)   |
| `TELEMETRY_*`                                        | optional                | Private match telemetry (`src/server/telemetry/MatchTelemetryConfig.ts`, see `example.env`)          |
| `INSTANCE_ID`, `WORKER_ID`                           | internal                | Set by the master for its workers; do not set by hand                                                |

### Build time / dev server (`vite.config.ts`)

| Variable                                                                                                                      | Purpose                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `GAME_ENV`, `DOMAIN`, `TURNSTILE_SITE_KEY`, `CDN_BASE`, `FARO_COLLECTOR_URL`, `INSTANCE_ID`, `INSTANCE_LETTER`, `NUM_WORKERS` | Baked into the dev bootstrap config and proxies                   |
| `API_DOMAIN`                                                                                                                  | Points the local client at a real API (`dev:staging`, `dev:prod`) |
| `VITE_HOST=lan`                                                                                                               | Expose the Vite dev server on the LAN                             |
| `SKIP_BROWSER_OPEN=true`                                                                                                      | Do not open a browser on `npm run dev`                            |

In the browser, config comes from `window.BOOTSTRAP_CONFIG`, injected into `index.html` by `src/server/RenderHtml.ts` and read through `src/client/ClientEnv.ts`. Browser code never reads `process.env` directly, apart from the few keys `vite.config.ts` `define`s. Server code never reads `ClientEnv`.

### Deploy only (`build.sh`, `deploy.sh`, GitHub secrets and vars)

`GHCR_USERNAME`, `GHCR_REPO`, `GHCR_TOKEN`, `SSH_KEY` (or `SSH_PRIVATE_KEY` in CI), `SERVER_HOSTS_JSON` (`{"machine":"ip"}`) or legacy `SERVER_HOST_<NAME>`, `VERSION_TAG`, `DEPLOY_TARGETS_*` (CI vars). Provisioning a new host with `setup.sh` reads `.env.setup` (`OTEL_*`, etc.).

## Build and deployment

### Docker image (`Dockerfile`)

Multi-stage on `node:24-slim`: `npm ci`, then `npm run build-prod` (outputs `static/`), then prod-only `node_modules`. The final image runs **supervisord** with **nginx** (port 80, routes to the master and workers) and **node** (`npm run start:server`). `resources/maps` is stripped from the image because the server never reads maps. `GIT_COMMIT` is a build arg.

### Scripts

- `build.sh <prod|staging> <version_tag>`: `docker buildx` for `linux/amd64` with registry cache, pushed to GHCR.
- `deploy.sh <prod|staging> <machine> <version_tag> <subdomain>`: resolves the machine through `SERVER_HOSTS_JSON`, computes the game and site hosts, copies `update.sh` over SSH (user `openfront`) and runs it with a generated env file under a host lock.
- `update.sh` (runs on the host): pulls the image, **uploads hashed assets to R2 through the API** before swapping, registers with the API registry (which assigns `INSTANCE_LETTER` / `NUM_WORKERS`), then starts the container behind **Traefik** with a `Host()` rule.
- `build-deploy.sh`: runs build and deploy in sequence.
- `setup.sh`: one-time Hetzner host provisioning (Docker, user, node exporter, OpenTelemetry).

Some shell blocks are delimited with `BEGIN ... (tested)` / `END` markers and extracted by tests (`tests/DeployIdentity.test.ts`, `UpdateTraefikHostRule.test.ts`, `UpdateRegister.test.ts`, `GenerateNginxUpstream.test.ts`). Keep the markers and update the tests when changing that logic.

### GitHub Actions (`.github/workflows/`)

openfront-light keeps a single workflow (see changelog entry 8):

- `ci.yml`: lint (`lint:github`), Prettier check, tests (`test:coverage`), typecheck + server bundle (`build-server-light`) and the "generated maps up to date" check, then the `image` job builds `Dockerfile.light`. The image is pushed to `ghcr.io/<owner>/openfront-light` from `main` (`latest`, `sha-<short>`) and from `v*` tags (`<tag>`, `sha-<short>`); on PRs it is only built. The embedded maps come from the repository variable `OPENFRONT_MAPS` (default: `world,giantworldmap,europe,northamerica,southamerica,asia,africa`).

Upstream's `deploy.yml`, `release.yml` and PR / issue bot workflows target openfront.io infrastructure and are not used here.

Deploying, pushing images and running `deploy.sh` touch real infrastructure. Never run them unless the user explicitly asks.

## Conventions and rules

- **English only** in the repo (see top).
- **UI text**: all user-visible text goes through `translateText()` with a key added to `resources/lang/en.json` (kept sorted, enforced by `tests/EnJsonSorted.test.ts`). Do not edit other language files.
- **Core determinism**: see Architecture. Core must not use DOM or Node APIs, nor `src/server`. A few legacy imports from `src/client` exist: `renderNumber` / `renderTroops` / `translateText` from `client/Utils`, view types from `client/view`, `PlayerState` from `client/render/types`, `NameBoxCalculator` (in `GameRunner.ts`), and `src/core/game/UserSettings.ts` pulls in `GraphicsOverrides`, `StatsConstants` and `DesktopShell`. Do not add new ones, and never pull in anything with side effects or non-deterministic behavior.
- **Tests**: Vitest with `jsdom` (`tests/setup.ts`). Core tests use `setup()` from `tests/util/Setup.ts`, which builds a real game from the maps in `tests/testdata/maps/`. Exercise the real simulation, not mocks. Server tests live in `tests/server/`, client tests in `tests/client/`.
- **Lint and format**: Oxlint + ESLint + Prettier (`prettier-plugin-organize-imports` sorts imports). The Husky pre-commit hook runs `lint-staged`. Run `npm run lint` and `npm run format` before finishing.
- **Generated files**: `src/core/game/Maps.gen.ts` and `resources/maps/*` come from `npm run gen-maps`. `static/`, `out/` and `src/assets/` are build outputs.
- **TypeScript**: `strictNullChecks` (not full `strict`), ESM (`"type": "module"`), path aliases `src/*` and `resources/*`, run with `tsx` on the server. Validate external data with Zod schemas.
- **Comments**: the codebase explains _why_ in detailed comments, especially in server and deploy code. Match that style and keep the comments accurate when you change behavior.
- **Contributions**: PRs need an `approved` issue, and AI-assisted PRs must be fully understood by the author (`CONTRIBUTING.md`). New contributors are limited to UI and small fixes.
- **Legal**: keep the "© OpenFront and Contributors" notices (footer and loading screen) required by the AGPL Section 7 terms. Never move `proprietary/` assets into open folders.

## Tech stack

- **Language**: TypeScript 6 (ESM), Go for `map-generator/`
- **Bundler / dev server**: Vite 8 (+ `@tailwindcss/vite`, `vite-plugin-html`)
- **Rendering**: custom WebGL2 renderer with GLSL shaders (`src/client/render/`)
- **UI**: Lit 3 (LitElement) + Tailwind CSS 4
- **Audio**: Howler.js
- **Schemas / validation**: Zod 4 + `zbin` binary codec
- **Server**: Node.js 24, Express 5, `ws`, `jose` (JWT), Winston + OpenTelemetry
- **Testing**: Vitest 4 (jsdom, `vitest-canvas-mock`)
- **Lint / format**: Oxlint, ESLint 10, Prettier 3, Husky + lint-staged
- **Infra**: Docker (GHCR), nginx, supervisord, Traefik, Hetzner hosts, Cloudflare (API Worker, R2, CDN, Turnstile)

## Further reading

| File                          | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `docs/Architecture.md`        | Architecture overview                                   |
| `docs/MultiServer.md`         | Multi-server identity, routing, server list v2, rollout |
| `docs/Auth.md`                | JWT and refresh-token flow                              |
| `docs/API.md`                 | Public API endpoints (served by the closed-source API)  |
| `docs/Maps.md`                | Maps                                                    |
| `docs/GameServerRefactor.md`  | GameServer testing and refactor plan                    |
| `zbin/README.md`              | Binary wire format                                      |
| `map-generator/README.md`     | Creating and generating maps                            |
| `src/core/snapshot/README.md` | Snapshot format                                         |
| `src/client/render/CLAUDE.md` | Renderer pipeline and pass conventions                  |
| `CONTRIBUTING.md`             | Contribution workflow and governance                    |
| `LICENSING.md`                | License history, open vs proprietary assets             |
