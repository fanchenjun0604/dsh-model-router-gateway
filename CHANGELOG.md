# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.0.3 — 2026-11-06

### Added

- In-card self-update: **check for updates** compares the installed version
  against npm `latest`, and **upgrade** runs remove → install through the
  host's plugin manager right from the management card — no plugin page, no
  terminal. A persisted marker lets the card report the outcome across the
  remount the upgrade itself causes (including interrupted runs), and every
  manager step is deadline-bounded. On deployments without an upgrade path
  (no plugin manager in the composition) the card says so and points to the
  plugin page. Works on remote web deployments too: upgrade the Unikraft
  instance without leaving the browser.
- Cooldown visibility: `/config` reports which models are currently cooling
  and for how long; the card renders the chain chips with a ⏳ countdown and
  a red tint, so the fallback order's live state is no longer a black box.
- Chain ordering: models in a saved route can be moved up/down directly on
  the chip row, and the edit form got the same ↑↓ buttons — re-tuning a
  fallback order no longer means deleting and re-adding.
- Copy buttons for BaseURL and the current gateway key.

### Removed

- `README.zh.md`: the bilingual single-page `README.md` (since 1.0.2) is now
  the only documentation front, so the separate Chinese file no longer drifts.

## 1.0.2 — 2026-11-06

### Security

- Public deployments no longer leak the gateway key: `/config` answers with a
  masked view (key shown as `sk-a…z9`, model lists trimmed) unless the caller
  passes the host's own connection admission check (loopback / authenticated
  DSH session). Admin mutations (route CRUD, settings) now additionally
  require that trust fence — a bare gateway key from off-box cannot manage.
- Route ids are validated (`[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`) to keep client
  addressing safe.

### Added

- Failure cooldown: a model that exhausts its attempts is skipped directly
  for `failureCooldownMs` (default 60s) instead of burning a fresh timeout on
  every request; success clears the mark. Configurable in the card and patch.
- Advanced settings in the management card: per-model timeout, retries, and
  failure cooldown — all persisted through the state file.
- Route id is user-settable at creation (auto-slug from the name when left
  blank) and fixed afterwards, mirroring its role as the external model name.

### Changed

- `chat.completions` now echoes the actually answering model in `model`
  (e.g. `our-free-model/kilo-auto/free`) instead of `route:<id>`.
- `README.md` is one bilingual document (English + full 中文 section) so
  npmjs.com — which renders a single README — also shows the Chinese docs.

## 1.0.0 — 2026-11-04

Initial public release.

### Added

- Ordered fallback route groups over every model registered in DSH's `llm`
  service (silent failover on error / quota / rate-limit / timeout / empty
  response, before the first token).
- OpenAI-compatible gateway: `GET /v1/models`, `POST /v1/chat/completions`
  (stream + non-stream), Bearer gateway-key auth.
- Optional LAN listener (`publicPort`) bound to `0.0.0.0` for phones and
  remote clients when the host web server is loopback-only.
- Per-provider model visibility allow-list (select-all / invert / clear) for
  a lean external model list.
- Visual management card (plugins/settings seats) for route groups, gateway
  key, and visibility — with persistence to a state file next to the profile.
- Legacy path compatibility: requests under `/api/model-router/*` still reach
  the gateway.
- Self-contained runtime (`@deepseek-ai/schemastery` auto-installed; the rest
  is Node builtins + DSH services); works on desktop (Electron) and web
  deployments alike.
