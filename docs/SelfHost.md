# Self-hosting openfront-light

`Dockerfile.light` builds a small image for a private server that hosts a
few games at a time. The server only relays player intents (the simulation
runs in each browser), so one worker process is enough.

## What the image contains

- One `node` process tree: the master plus 1 worker. There is no nginx and no
  supervisord. The master listens on `$PORT` (8080) and forwards `/wN/` HTTP,
  WebSocket and create-game traffic to its workers
  (`src/server/InProcessWorkerProxy.ts`, enabled by `WORKER_PROXY=inprocess`).
- The server is bundled with esbuild (`npm run build-server-light`) into
  `dist/server/Server.mjs`, so the image ships no `node_modules` and no `src/`.
- The built client (`static/`), with only the maps listed in `OPENFRONT_MAPS`.

TLS is not handled in the image. Put it behind something that terminates
HTTPS and passes WebSockets through, such as Clever Cloud, a Cloudflare tunnel
or your own reverse proxy.

## Build

```bash
docker build -f Dockerfile.light \
  --build-arg OPENFRONT_MAPS=world,europe,iceland \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  -t openfront-light .
```

`OPENFRONT_MAPS` takes a comma-separated list of directory names from
`resources/maps/`. If you leave it empty, every map is embedded (about 600 MB).
An unknown name fails the build. The map picker, the random-map button and the
default map only offer the embedded maps. Australia's preview terrain is
always kept, because the cosmetics preview uses it.

## Run

```bash
docker run -p 8080:8080 -e DOMAIN=games.example.com openfront-light
```

| Variable             | Default                    | Notes                               |
| -------------------- | -------------------------- | ----------------------------------- |
| `DOMAIN`             | (none)                     | Host name players use; JWT audience |
| `PORT`               | `8080`                     | The single HTTP port                |
| `NUM_WORKERS`        | `1`                        | Enough for a handful of games       |
| `ADMIN_BOT_API_KEY`  | (unset)                    | Unset keeps the admin bot API off   |
| `TURNSTILE_SITE_KEY` | Cloudflare always-pass key | No bot check on a private server    |
| `NODE_OPTIONS`       | `--max-old-space-size=384` | Heap cap per process                |

Leave `SUBDOMAIN` and `LOBBY_COORDINATOR` unset. The server then never
contacts the closed-source API.

## Clever Cloud

Create a **Docker** application from this repository, and set
`CC_DOCKERFILE=Dockerfile.light` and `DOMAIN`. To pick the maps when you
cannot pass build args, change the `ARG OPENFRONT_MAPS=""` default in
`Dockerfile.light`. The app listens on 8080, which Clever expects. Their load
balancer terminates TLS and supports WebSockets. The smallest instance is
enough.
