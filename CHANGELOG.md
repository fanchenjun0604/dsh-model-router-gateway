# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Changed

- Documentation only: `README.md` is now a single bilingual document (English
  + full 中文 section) so npmjs.com — which renders one README — also shows
  the Chinese docs. `README.zh.md` remains for the GitHub language link.

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
