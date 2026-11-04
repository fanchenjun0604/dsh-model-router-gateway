# dsh-model-router-gateway

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that turns **every model DSH can reach** into **ordered fallback chains** and exposes them through an **OpenAI-compatible gateway** — one BaseURL + one key for your phone apps, desktop clients, and any OpenAI-style tool.

Built for the common reality of free / quota-limited model channels: when model A runs out of tokens, rate-limits, or errors, the gateway **silently switches to model B** — the conversation never breaks.

## What it does

- **Full model inventory** — reads every provider and model registered in your DSH instance through the `llm` service (anything DSH can call, the gateway can forward).
- **Ordered fallback routes** — define route groups like `free-deepseek → free-glm → paid-deepseek`. A request walks the chain until one model answers.
- **OpenAI-compatible endpoints** — `GET /v1/models` and `POST /v1/chat/completions`, streaming and non-streaming.
- **Gateway key** — a single key you set (any string) protects all external access.
- **LAN / server listener** — optional `publicPort` binds `0.0.0.0` so phones on your hotspot, or the public internet behind a reverse proxy, can reach it even when DSH itself only listens on loopback.
- **Model visibility** — tick exactly which models external clients may see (select-all / invert / clear per provider). Keeps your `/models` list small and usable.
- **Visual management card** — edit routes, keys, and visibility live from the DSH plugins/settings UI. All changes persist to a small state file and survive restarts.
- **Self-contained** — the only runtime dependency is `@deepseek-ai/schemastery`
  (public npm, installed automatically with the plugin); everything else is
  Node builtins and DSH services, so it installs and runs identically on
  desktop (Electron) and web deployments.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-model-router-gateway
```

(`--profile web` on a web deployment; on the desktop app use your profile name.) Then restart / reload the profile.

## Use

1. Open the plugin card (Plugins page, or Settings → Plugins → Plugin settings).
2. Copy the **BaseURL** and set your **gateway key**.
3. In any OpenAI-compatible client:

   | field | value |
   |---|---|
   | Base URL | `http://<host>:<port>/api/model-router-gateway/v1` |
   | API Key | your gateway key |
   | Model | a route id (e.g. `default`) or `provider:model` (e.g. `our-free-model:kimi-k3`) |

   With `publicPort` set (e.g. `18080`), external clients can instead use `http://<host-ip>:18080/v1`.

### Define routes

In the card, add a route group and list models in priority order. Or declare defaults in your profile's `cordis.patch.yml`:

```yaml
- patch:
    - id: dsh-model-router-gateway
      config:
        publicPort: 18080
        routes:
          - id: default
            name: Fallback chain
            enabled: true
            models:
              - provider: our-free-model
                model: deepseek-v4.1-flash-free
              - provider: our-free-model
                model: kilo-auto/free
```

Note: once you edit routes in the UI, the persisted state file takes precedence over patch defaults.

### Configuration fields

| field | default | meaning |
|---|---|---|
| `gatewayKey` | `""` (auto-generated once, then persisted) | Bearer key required by all external calls. Any string works. |
| `publicPort` | `0` (off) | Extra listener on `0.0.0.0` for LAN / phone access. |
| `defaultTimeoutMs` | `60000` | Per-model request timeout before falling over to the next. |
| `maxRetryPerModel` | `1` | Retries against one model before moving down the chain. |
| `modelVisibility` | `{}` (all visible) | Per-provider allow-list of model ids shown in `/v1/models`. |
| `routes` | `[]` | Ordered fallback route groups. |

State file: `<profile dir>/dsh-model-router-gateway-state.json`.

## How the failover works

Every DSH model stream ends in a terminal chunk: success, or a typed failure (`QUOTA`, `RATE_LIMIT`, `AUTH`, `SERVER`, `TIMEOUT`, …). The gateway treats any failure **before the first token**, a timeout, or an empty answer as "this model is unavailable right now" and moves to the next entry in the route — transparently, keeping the same conversation. Usage accounting (`prompt_tokens`/`completion_tokens`) is estimated in characters, since upstream free channels rarely report tokens.

## Security notes

- Keep the gateway key secret: anyone holding it can spend your model quota. The key is stored in the plugin state file next to your profile.
- Binding `publicPort` opens the gateway on every interface of the host. Only do this behind a firewall, reverse proxy with TLS, or on trusted networks.
- Requests are forwarded to providers exactly as DSH would send them; images are replaced by text placeholders (text-only forwarding).

## Development

Plain JavaScript, no build step:

```text
index.js          Host half: llm routing + OpenAI gateway + admin API
client.js         Browser half: management card (plain-JS module loader form)
cordis.patch.yml  bundle patch (one insert row)
locale/           en + zh display metadata
icon.svg          plugin icon
```

Verify a local install from a checkout:

```bash
dsh plugin --profile <p> add /absolute/path/to/dsh-model-router-gateway
```

## License

MIT
