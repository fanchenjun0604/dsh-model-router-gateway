import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * dsh-model-router-gateway — Host half
 *
 * - Enumerate every model DSH can reach (via the llm service).
 * - Ordered fallback route groups: try models in sequence; on error / quota /
 *   rate-limit / timeout, silently switch to the next model in the chain.
 * - OpenAI-compatible gateway: /v1/models and /v1/chat/completions, protected
 *   by a gateway key, exposing route groups + selected local models to
 *   external callers (mobile AI apps and any OpenAI-compatible client).
 * - Optional LAN listener (publicPort) on 0.0.0.0 for non-loopback access.
 * - Admin JSON API backing the visual management card; all UI edits persist
 *   to a small state file next to the profile.
 *
 * Zero runtime dependencies: Node builtins + DSH services only, so the
 * package installs and runs identically on the desktop (Electron/asar) and
 * web deployments regardless of how the host resolves its own modules.
 */

export const name = 'dsh-model-router-gateway';

const NS = 'dsh-model-router-gateway';
const PRIMARY = '/api/model-router-gateway';
const LEGACY = '/api/model-router';

export const inject = ['llm'];

/**
 * Config schema, declared with a schemastery instance resolved at load time:
 * 1. the copy npm installed with this package (normal registry installs — it
 *    is a direct dependency, resolved by standard Node rules from here);
 * 2. the DSH installation inside app.asar (linked-dev / desktop fallback);
 * 3. none — Config stays undefined; apply() reads a plain-object config
 *    defensively, so the gateway still works without the schema surface.
 */
function loadSchema() {
  const usable = (mod) => {
    const z = mod && mod.default ? mod.default : mod;
    try {
      return z && typeof z.object === 'function' && typeof z.number().volatile === 'function';
    } catch {
      return false;
    }
  };
  const own = createRequire(import.meta.url);
  try {
    const z = own('@deepseek-ai/schemastery');
    if (usable(z)) return z;
  } catch {
    /* own chain missed */
  }
  if (process.resourcesPath) {
    try {
      const fromDsh = createRequire(
        path.join(process.resourcesPath, 'app.asar', 'dsh', 'package.json'),
      );
      const z = fromDsh('@deepseek-ai/schemastery');
      if (usable(z)) return z;
    } catch {
      /* not an Electron/asar layout */
    }
  }
  return undefined;
}

const schemaMod = loadSchema();

export const Config =
  schemaMod && typeof schemaMod.object === 'function'
    ? schemaMod.object({
        gatewayKey: schemaMod.string().default('').volatile(),
        defaultTimeoutMs: schemaMod.number().default(60000).volatile(),
        maxRetryPerModel: schemaMod.number().default(1).volatile(),
        failureCooldownMs: schemaMod.number().default(60000).volatile(),
        publicPort: schemaMod.number().default(0).volatile(),
        modelVisibility: schemaMod.dict(schemaMod.array(schemaMod.string())).default({}).volatile(),
        routes: schemaMod
          .array(
            schemaMod.object({
              id: schemaMod.string().required(),
              name: schemaMod.string().default(''),
              models: schemaMod
                .array(
                  schemaMod.object({
                    provider: schemaMod.string().required(),
                    model: schemaMod.string().required(),
                  }),
                )
                .default([]),
              enabled: schemaMod.boolean().default(true),
            }),
          )
          .default([])
          .volatile(),
      })
    : undefined;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function getLlm(ctx) {
  try {
    if (typeof ctx.get === 'function') return ctx.get('llm');
    return ctx.llm;
  } catch {
    return undefined;
  }
}

function getWebServer(ctx) {
  try {
    if (typeof ctx.get === 'function') {
      const ws = ctx.get('webServer');
      if (ws && typeof ws.register === 'function') return ws;
    }
  } catch {
    /* fall through */
  }
  try {
    const ws = ctx.webServer;
    if (ws && typeof ws.register === 'function') return ws;
  } catch {
    /* ignored */
  }
  return undefined;
}

function json(res, status, obj) {
  try {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  } catch {
    /* response may already be gone */
  }
}

function readJson(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => {
      req.off?.('data', onData);
      req.off?.('end', onEnd);
      req.off?.('error', onError);
      req.off?.('aborted', onAborted);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onAborted = () => onError(new Error('request body aborted'));
    const onData = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) {
        onError(new Error('request body too large'));
        req.resume?.();
        return;
      }
      chunks.push(bytes);
    };
    const onEnd = () => {
      cleanup();
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/** Non-loopback IPv4 addresses this host currently owns (hotspot / LAN). */
function lanAddresses() {
  const out = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const item of list ?? []) {
        if (item && item.family === 'IPv4' && !item.internal) out.push(item.address);
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function newCompletionId() {
  return `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
}

function openAiError(res, status, message, type = 'upstream_error') {
  json(res, status, { error: { message: String(message), type } });
}

function toDshMessages(openaiMessages) {
  const list = Array.isArray(openaiMessages) ? openaiMessages : [];
  return list.map((m) => {
    let role = 'user';
    if (m.role === 'system' || m.role === 'developer') role = 'system';
    else if (m.role === 'assistant') role = 'assistant';
    else if (m.role === 'tool') role = 'tool';
    let content;
    if (Array.isArray(m.content)) {
      content = m.content.map((part) => {
        if (part && part.type === 'text') return { type: 'text', text: String(part.text ?? '') };
        if (part && part.type === 'image_url') {
          return { type: 'text', text: '[image omitted: this gateway forwards text only]' };
        }
        return { type: 'text', text: typeof part === 'string' ? part : '' };
      });
    } else {
      content = [{ type: 'text', text: String(m.content ?? '') }];
    }
    return { role, content };
  });
}

// ---------------------------------------------------------------------------
// model call + ordered fallback
// ---------------------------------------------------------------------------

async function callSingleModel(ctx, provider, model, opts, signal) {
  const llm = getLlm(ctx);
  if (!llm || typeof llm.stream !== 'function') {
    throw new Error('llm service is unavailable');
  }
  const label = `${provider}/${model}`;
  let text = '';
  let sawFinish = false;
  let failure = null;
  let stream;
  try {
    stream = llm.stream({
      provider,
      model,
      messages: opts.messages,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new Error(`${label}: ${error?.message ?? error}`);
  }
  try {
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (chunk.type === 'text-delta') {
        if (typeof chunk.text === 'string') text += chunk.text;
      } else if (chunk.type === 'finish') {
        sawFinish = true;
        const reason = chunk.reason;
        if (reason && (reason.kind === 'error' || reason.kind === 'aborted')) {
          const f = reason.failure ?? {};
          failure = `${f.code ?? 'UNKNOWN'}: ${f.message ?? 'stream failed'}`;
        }
      }
    }
  } catch (error) {
    throw new Error(`${label}: ${error?.message ?? error}`);
  }
  if (failure) throw new Error(`${label}: ${failure}`);
  if (!sawFinish && text === '') throw new Error(`${label}: empty response`);
  return text;
}

async function callRoute(ctx, route, opts, signal, state) {
  const { timeoutMs, maxRetry, failures } = state;
  const errors = [];
  const skipped = [];
  const now = Date.now();
  const models = Array.isArray(route.models) ? route.models : [];
  for (const ref of models) {
    if (!ref || !ref.provider || !ref.model) continue;
    const key = `${ref.provider}/${ref.model}`;
    const cooldownUntil = failures.get(key);
    if (cooldownUntil && cooldownUntil > now) {
      skipped.push(`${key} (cooling ${Math.ceil((cooldownUntil - now) / 1000)}s)`);
      continue;
    }
    if (cooldownUntil) failures.delete(key);
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
      const onAbort = () => controller.abort(signal?.reason);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        const text = await callSingleModel(ctx, ref.provider, ref.model, opts, controller.signal);
        if (text.trim() !== '') {
          failures.delete(key); // success clears any history
          return { text, model: ref };
        }
        lastError = new Error('empty response');
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }
    // Failed end-to-end: park this model so the next request skips it.
    failures.set(key, now + state.failureCooldownMs);
    errors.push(`${key}: ${lastError?.message ?? 'failed'}`);
  }
  if (models.length === 0) throw new Error('route has no models');
  const parts = [...errors];
  if (skipped.length) parts.push(`skipped: ${skipped.join(', ')}`);
  if (errors.length === 0 && skipped.length > 0) {
    throw new Error(`every model is cooling: ${skipped.join(', ')} — retry later`);
  }
  throw new Error(`all models in route failed: ${parts.join(' | ')}`);
}

// ---------------------------------------------------------------------------
// persistence (plain JSON file next to the profile; no loader round-trip)
// ---------------------------------------------------------------------------

function stateDir() {
  return (
    process.env.DSH_PROFILE_DIR ||
    process.env.DSH_HOME ||
    path.join(os.homedir(), '.dsh')
  );
}

function stateFilePath() {
  return path.join(stateDir(), `${NS}-state.json`);
}

function readStateFile() {
  try {
    return JSON.parse(fs.readFileSync(stateFilePath(), 'utf8'));
  } catch {
    return null;
  }
}

function writeStateFile(state) {
  try {
    const file = stateFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = {
      gatewayKey: state.gatewayKey,
      modelVisibility: state.modelVisibility ?? {},
      routes: [...state.routes.values()],
      settings: {
        defaultTimeoutMs: state.timeoutMs,
        maxRetryPerModel: state.maxRetry,
        publicPort: state.publicPort,
      },
    };
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (error) {
    state.ctx?.logger?.warn?.(`[${NS}] state write failed: ${error?.message ?? error}`);
    return false;
  }
}

function persistSettings(ctx, state) {
  return writeStateFile(state)
    ? { ok: true }
    : { ok: false, reason: `cannot write ${stateFilePath()}` };
}

// ---------------------------------------------------------------------------
// trust fence: the host webServer dispatches our prefix before its own auth
// (longest-prefix wins), so on a public deployment these routes must gate
// themselves. We reuse the composition's `connection` admission service when
// mounted; on the LAN listener every request is already by-passing DSH auth,
// so that socket path skips the fence and relies on the gateway key alone.
// ---------------------------------------------------------------------------

function makeTrustedRequestCheck(ctx) {
  return async function isTrusted(req) {
    let connection;
    try {
      connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined;
    } catch {
      connection = undefined;
    }
    if (!connection) {
      try {
        connection = ctx.connection;
      } catch {
        connection = undefined;
      }
    }
    try {
      // The kernel admission decision, both historical shapes: `admit`
      // returns { rejection? }, the older requestRejection returns a status.
      if (connection && typeof connection.admit === 'function') {
        const decision = await connection.admit(req);
        return !(decision && decision.rejection !== undefined);
      }
      if (connection && typeof connection.requestRejection === 'function') {
        return connection.requestRejection(req) === undefined;
      }
    } catch {
      // Never bypass browser authentication when the mounted service fails.
      return false;
    }
    // No admission service in this composition: fall back to a structural
    // loopback + same-origin fence, mirroring the kernel's own replica.
    return structuralTrust(req);
  };
}

const LOOPBACK_NAMES = new Set(['127.0.0.1', '[::1]', '::1', 'localhost']);

function structuralTrust(req) {
  const host = authorityOf(req.headers?.host, 'http');
  if (host === null || !LOOPBACK_NAMES.has(host.hostname)) return false;
  const site = String(req.headers?.['sec-fetch-site'] ?? '').toLowerCase();
  if (site === 'cross-site') return false;
  for (const header of ['origin', 'referer']) {
    const raw = req.headers?.[header];
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const authority = authorityOf(raw.trim());
    if (authority === null) return false;
    if (
      authority.scheme !== host.scheme ||
      authority.hostname !== host.hostname ||
      authority.port !== host.port
    )
      return false;
  }
  return true;
}

function authorityOf(value, defaultScheme) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let url;
  try {
    url = new URL(value.includes('://') ? value.trim() : `${defaultScheme ?? 'http'}://${value.trim()}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const port = url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port;
  return { scheme: url.protocol.replace(':', ''), hostname: url.hostname.toLowerCase(), port };
}

function maskKey(key) {
  const s = String(key ?? '');
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

function makeHandler(ctx, state) {
  const { routes, publicPort } = state;
  const isTrustedRequest = makeTrustedRequestCheck(ctx);

  async function handle(req, res, opts = {}) {
    // opts.trusted: set by the LAN listener, which has no DSH auth layer at
    // all — those requests rely purely on the gateway key and may read the
    // local-only surfaces only when the operator asked for a LAN exposure.
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
    } catch {
      json(res, 400, { error: 'bad url' });
      return;
    }
    let pathname = url.pathname;
    // Short aliases on the standalone LAN listener: /v1/* and /config.
    if (pathname === '/config' || pathname.startsWith('/v1/')) {
      pathname = PRIMARY + pathname;
    }
    // Legacy path compatibility (pre-rename installs).
    else if (pathname === LEGACY + '/config' || pathname.startsWith(LEGACY + '/')) {
      pathname = PRIMARY + pathname.slice(LEGACY.length);
    }
    if (!pathname.startsWith(PRIMARY + '/')) {
      json(res, 404, { error: 'not found' });
      return;
    }

    // ----- config for the management card -----
    if (pathname === PRIMARY + '/config' && req.method === 'GET') {
      // The full config (key + route ids) is a local/trusted surface. On a
      // public deployment an anonymous caller only gets the masked view; the
      // admin UI itself runs from the already-authenticated DSH page, so it
      // clears the host admission check like every other /api route does.
      const trusted = opts.lanOnly || (await isTrustedRequest(req));
      const providers = await listProviderCatalog(ctx);
      if (!trusted) {
        json(res, 200, {
          ok: true,
          masked: true,
          gatewayKey: maskKey(state.gatewayKey),
          basePath: PRIMARY,
          providers: providers.map((p) => ({ id: p.id, name: p.name, models: [] })),
          routes: [...routes.values()].map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, models: [] })),
        });
        return;
      }
      json(res, 200, {
        ok: true,
        gatewayKey: state.gatewayKey,
        basePath: PRIMARY,
        publicPort,
        lanIps: lanAddresses(),
        modelVisibility: state.modelVisibility ?? {},
        settings: {
          defaultTimeoutMs: state.timeoutMs,
          maxRetryPerModel: state.maxRetry,
          failureCooldownMs: state.failureCooldownMs,
        },
        routes: [...routes.values()],
        providers,
      });
      return;
    }

    // ----- auth -----
    const auth = req.headers?.authorization ?? '';
    const token = String(auth).replace(/^Bearer\s+/i, '').trim();
    if (!token || token !== state.gatewayKey) {
      openAiError(res, 401, 'Invalid gateway key', 'auth_error');
      return;
    }

    // Admin mutations ride the same trust fence: a valid gateway key alone is
    // not enough from off-box; it must come from a local/LAN/trusted surface.
    const isAdmin =
      pathname.startsWith(PRIMARY + '/admin/');
    if (isAdmin && !opts.lanOnly) {
      const trusted = await isTrustedRequest(req);
      if (!trusted) {
        openAiError(res, 403, 'admin actions require a local or authenticated session', 'auth_error');
        return;
      }
    }

    // ----- admin settings (gateway key / model visibility / runtime knobs) -----
    if (pathname === PRIMARY + '/admin/settings' && req.method === 'POST') {
      let body;
      try {
        body = await readJson(req);
      } catch {
        json(res, 400, { ok: false, error: 'invalid JSON' });
        return;
      }
      if (typeof body.gatewayKey === 'string' && body.gatewayKey.trim()) {
        state.gatewayKey = body.gatewayKey.trim();
      }
      if (body.modelVisibility && typeof body.modelVisibility === 'object') {
        const next = {};
        for (const [provider, list] of Object.entries(body.modelVisibility)) {
          if (Array.isArray(list)) {
            next[provider] = list.map((x) => String(x)).filter(Boolean);
          }
        }
        state.modelVisibility = next;
      }
      const s = body.settings;
      if (s && typeof s === 'object') {
        if (typeof s.defaultTimeoutMs === 'number' && s.defaultTimeoutMs >= 1000) {
          state.timeoutMs = Math.floor(s.defaultTimeoutMs);
        }
        if (typeof s.maxRetryPerModel === 'number' && s.maxRetryPerModel >= 0) {
          state.maxRetry = Math.floor(s.maxRetryPerModel);
        }
        if (typeof s.failureCooldownMs === 'number' && s.failureCooldownMs >= 0) {
          state.failureCooldownMs = Math.floor(s.failureCooldownMs);
        }
      }
      const persist = persistSettings(ctx, state);
      json(res, 200, {
        ok: true,
        persisted: persist.ok,
        ...(persist.reason ? { persistReason: persist.reason } : {}),
        gatewayKey: state.gatewayKey,
        modelVisibility: state.modelVisibility,
        settings: {
          defaultTimeoutMs: state.timeoutMs,
          maxRetryPerModel: state.maxRetry,
          failureCooldownMs: state.failureCooldownMs,
        },
      });
      return;
    }

    // ----- admin route CRUD -----
    if (pathname.startsWith(PRIMARY + '/admin/routes')) {
      await handleAdmin(req, res, pathname, state, ctx);
      return;
    }

    // ----- GET /v1/models -----
    if (pathname === PRIMARY + '/v1/models' && req.method === 'GET') {
      const data = [];
      for (const [id, route] of routes) {
        if (route.enabled === false) continue;
        data.push({
          id,
          object: 'model',
          created: nowSeconds(),
          owned_by: NS,
          route: true,
          name: route.name || id,
        });
      }
      const providers = await listProviderCatalog(ctx);
      const visibility = state.modelVisibility ?? {};
      for (const p of providers) {
        const allow = Array.isArray(visibility[p.id]) ? visibility[p.id] : null;
        for (const m of p.models ?? []) {
          if (allow && allow.length > 0 && !allow.includes(m.id)) continue;
          data.push({
            id: `${p.id}:${m.id}`,
            object: 'model',
            created: nowSeconds(),
            owned_by: p.id,
            route: false,
            provider: p.id,
            model: m.id,
            name: `${p.name ?? p.id} · ${m.name ?? m.id}`,
          });
        }
      }
      json(res, 200, { object: 'list', data });
      return;
    }

    // ----- POST /v1/chat/completions -----
    if (pathname === PRIMARY + '/v1/chat/completions' && req.method === 'POST') {
      let body;
      try {
        body = await readJson(req);
      } catch (error) {
        openAiError(res, 400, `invalid JSON body: ${error?.message ?? error}`, 'bad_request_error');
        return;
      }
      const model = String(body.model ?? '');
      if (!model) {
        openAiError(res, 400, 'model is required', 'bad_request_error');
        return;
      }
      const stream = body.stream !== false;
      const opts = {
        messages: toDshMessages(body.messages),
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
        maxTokens:
          typeof body.max_tokens === 'number'
            ? body.max_tokens
            : typeof body.max_completion_tokens === 'number'
              ? body.max_completion_tokens
              : undefined,
      };
      if (!opts.messages.length) {
        openAiError(res, 400, 'messages is required', 'bad_request_error');
        return;
      }

      const controller = new AbortController();
      const onClose = () => controller.abort(new Error('client closed'));
      req.on('close', onClose);
      req.on('aborted', onClose);

      try {
        const route = routes.get(model);
        let result;
        let usedModel = model;
        if (route) {
          result = await callRoute(ctx, route, opts, controller.signal, state);
          const hit = result.model || {};
          usedModel = `${hit.provider || 'unknown'}/${hit.model || '?'}`;
        } else {
          const idx = model.indexOf(':');
          const provider = idx > 0 ? model.slice(0, idx) : '';
          const modelId = idx > 0 ? model.slice(idx + 1) : model;
          if (!provider) {
            openAiError(
              res,
              400,
              `unknown model "${model}": use a route id or "provider:model"`,
              'bad_request_error',
            );
            return;
          }
          const text = await callSingleModel(ctx, provider, modelId, opts, controller.signal);
          result = { text, model: { provider, model: modelId } };
          usedModel = `${provider}/${modelId}`;
        }

        if (!stream) {
          json(res, 200, {
            id: newCompletionId(),
            object: 'chat.completion',
            created: nowSeconds(),
            model: usedModel,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: result.text },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: estimateTokens(opts.messages),
              completion_tokens: result.text.length,
              total_tokens: estimateTokens(opts.messages) + result.text.length,
            },
          });
          return;
        }

        // SSE: emit the aggregated answer in small chunks
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        const id = newCompletionId();
        const created = nowSeconds();
        const piece = 28;
        for (let at = 0; at < result.text.length; at += piece) {
          const content = result.text.slice(at, at + piece);
          res.write(
            `data: ${JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created,
              model: usedModel,
              choices: [{ index: 0, delta: { content }, finish_reason: null }],
            })}\n\n`,
          );
        }
        res.write(
          `data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created,
            model: usedModel,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })}\n\n`,
        );
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        if (res.headersSent) {
          try {
            res.write(
              `data: ${JSON.stringify({
                error: { message: String(error?.message ?? error), type: 'upstream_error' },
              })}\n\n`,
            );
            res.write('data: [DONE]\n\n');
            res.end();
          } catch {
            res.destroy?.();
          }
        } else {
          openAiError(res, 502, error?.message ?? String(error));
        }
      } finally {
        req.off?.('close', onClose);
        req.off?.('aborted', onClose);
      }
      return;
    }

    json(res, 404, { error: 'not found' });
  }

  return handle;
}

function estimateTokens(messages) {
  let n = 0;
  for (const m of messages ?? []) {
    for (const part of m.content ?? []) {
      if (part && part.type === 'text') n += Math.ceil(String(part.text ?? '').length / 4);
    }
  }
  return n;
}

async function listProviderCatalog(ctx) {
  const llm = getLlm(ctx);
  const out = [];
  if (!llm) return out;
  let providers = [];
  try {
    providers = llm.listProviders?.() ?? [];
  } catch {
    providers = [];
  }
  if (!Array.isArray(providers)) return out;
  for (const p of providers) {
    const id = p?.id ?? p?.provider ?? p?.name;
    if (!id) continue;
    let models = [];
    try {
      const list = await llm.listModels?.(id);
      if (Array.isArray(list)) {
        models = list.map((m) => ({
          id: m.id ?? m.name,
          name: m.name ?? m.id,
        }));
      }
    } catch {
      models = [];
    }
    out.push({ id, name: p.name ?? p.displayName ?? id, models });
  }
  return out;
}

async function handleAdmin(req, res, pathname, state, ctx) {
  const routes = state.routes;
  const rest = pathname.slice((PRIMARY + '/admin/routes').length).replace(/^\//, '');
  const id = rest ? decodeURIComponent(rest) : '';
  const method = req.method ?? 'GET';

  if (!id) {
    if (method === 'GET') {
      json(res, 200, { ok: true, routes: [...routes.values()] });
      return;
    }
    if (method === 'POST') {
      let body;
      try {
        body = await readJson(req);
      } catch {
        json(res, 400, { ok: false, error: 'invalid JSON' });
        return;
      }
      const routeId = String(body.id ?? '').trim() || crypto.randomBytes(6).toString('hex');
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(routeId)) {
        json(res, 400, { ok: false, error: 'route id must match [A-Za-z0-9][A-Za-z0-9_.-]{0,63}' });
        return;
      }
      if (routes.has(routeId)) {
        json(res, 409, { ok: false, error: 'route id already exists' });
        return;
      }
      const route = {
        id: routeId,
        name: String(body.name ?? routeId),
        models: normalizeModels(body.models),
        enabled: body.enabled !== false,
      };
      routes.set(routeId, route);
      persistSettings(ctx, state);
      json(res, 200, { ok: true, route });
      return;
    }
    json(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  const route = routes.get(id);
  if (!route) {
    json(res, 404, { ok: false, error: 'route not found' });
    return;
  }
  if (method === 'GET') {
    json(res, 200, { ok: true, route });
    return;
  }
  if (method === 'PUT') {
    let body;
    try {
      body = await readJson(req);
    } catch {
      json(res, 400, { ok: false, error: 'invalid JSON' });
      return;
    }
    if (body.name !== undefined) route.name = String(body.name);
    if (body.models !== undefined) route.models = normalizeModels(body.models);
    if (body.enabled !== undefined) route.enabled = body.enabled !== false;
    persistSettings(ctx, state);
    json(res, 200, { ok: true, route });
    return;
  }
  if (method === 'DELETE') {
    routes.delete(id);
    persistSettings(ctx, state);
    json(res, 200, { ok: true });
    return;
  }
  json(res, 405, { ok: false, error: 'method not allowed' });
}

function normalizeModels(models) {
  if (!Array.isArray(models)) return [];
  return models
    .map((m) => ({
      provider: String(m?.provider ?? '').trim(),
      model: String(m?.model ?? '').trim(),
    }))
    .filter((m) => m.provider && m.model);
}

/**
 * Flatten config values defensively. The host normally passes parsed config,
 * but a volatile-decorated profile layer may hand boxed references; accept
 * both without depending on any schema library.
 */
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value.get === 'function') return plain(value.get());
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
}

// ---------------------------------------------------------------------------
// plugin entry
// ---------------------------------------------------------------------------

export function apply(ctx, config) {
  const cfg = plain(config ?? {});
  const timeoutMs =
    typeof cfg.defaultTimeoutMs === 'number' && cfg.defaultTimeoutMs > 0
      ? cfg.defaultTimeoutMs
      : 60000;
  const maxRetry =
    typeof cfg.maxRetryPerModel === 'number' && cfg.maxRetryPerModel >= 0
      ? Math.floor(cfg.maxRetryPerModel)
      : 1;
  const publicPort = typeof cfg.publicPort === 'number' ? cfg.publicPort : 0;
  const failureCooldownMs =
    typeof cfg.failureCooldownMs === 'number' && cfg.failureCooldownMs >= 0
      ? Math.floor(cfg.failureCooldownMs)
      : 60000;

  const routes = new Map();
  for (const r of Array.isArray(cfg.routes) ? cfg.routes : []) {
    if (!r || typeof r.id !== 'string' || !r.id) continue;
    routes.set(r.id, {
      id: r.id,
      name: String(r.name ?? r.id),
      models: normalizeModels(r.models),
      enabled: r.enabled !== false,
    });
  }

  const modelVisibility =
    cfg.modelVisibility && typeof cfg.modelVisibility === 'object' && !Array.isArray(cfg.modelVisibility)
      ? Object.fromEntries(
          Object.entries(cfg.modelVisibility).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.map(String) : [],
          ]),
        )
      : {};

  const state = {
    routes,
    gatewayKey:
      (typeof cfg.gatewayKey === 'string' && cfg.gatewayKey.trim()) || '',
    timeoutMs,
    maxRetry,
    failureCooldownMs,
    publicPort,
    modelVisibility,
    failures: new Map(),
    ctx,
  };

  // A saved state file wins over the bundle-patch defaults (last saved change).
  const saved = readStateFile();
  if (saved && typeof saved === 'object') {
    if (typeof saved.gatewayKey === 'string' && saved.gatewayKey) {
      state.gatewayKey = saved.gatewayKey;
    }
    if (saved.modelVisibility && typeof saved.modelVisibility === 'object') {
      state.modelVisibility = Object.fromEntries(
        Object.entries(saved.modelVisibility).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.map(String) : [],
        ]),
      );
    }
    if (Array.isArray(saved.routes)) {
      routes.clear();
      for (const r of saved.routes) {
        if (!r || typeof r.id !== 'string' || !r.id) continue;
        routes.set(r.id, {
          id: r.id,
          name: String(r.name ?? r.id),
          models: normalizeModels(r.models),
          enabled: r.enabled !== false,
        });
      }
    }
    const s = saved.settings;
    if (s && typeof s === 'object') {
      if (typeof s.defaultTimeoutMs === 'number' && s.defaultTimeoutMs >= 1000) {
        state.timeoutMs = Math.floor(s.defaultTimeoutMs);
      }
      if (typeof s.maxRetryPerModel === 'number' && s.maxRetryPerModel >= 0) {
        state.maxRetry = Math.floor(s.maxRetryPerModel);
      }
      if (typeof s.failureCooldownMs === 'number' && s.failureCooldownMs >= 0) {
        state.failureCooldownMs = Math.floor(s.failureCooldownMs);
      }
    }
  }

  // Generate a stable key once and persist it, so restarts never break
  // external clients that were configured with it.
  if (!state.gatewayKey) {
    state.gatewayKey = `sk-${crypto.randomBytes(16).toString('hex')}`;
    persistSettings(ctx, state);
  }

  const handler = makeHandler(ctx, state);

  const disposers = [];
  const trySetup = (target) => {
    const ws = getWebServer(target);
    if (!ws) return;
    for (const prefix of [PRIMARY, LEGACY]) {
      try {
        disposers.push(ws.register({ kind: 'prefix', path: prefix, handler }));
      } catch (error) {
        ctx.logger?.warn?.(
          `[${NS}] webServer route ${prefix} not registered: ${error?.message ?? error}`,
        );
      }
    }
  };

  if (getWebServer(ctx)) {
    trySetup(ctx);
  } else if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['webServer'], (injectedCtx) => trySetup(injectedCtx));
    } catch {
      /* webServer unavailable in this composition */
    }
  }

  // -------- LAN gateway: a listener on 0.0.0.0 so phones/servers reach it --
  // The host webServer may bind one loopback address only, so an external
  // client on the same hotspot/LAN cannot use it. This plain http server
  // reuses the same handler and is still protected by the gateway key.
  let publicServer = null;
  if (publicPort > 0) {
    try {
      publicServer = http.createServer((req, res) => {
        try {
          res.setHeader('access-control-allow-origin', '*');
          res.setHeader('access-control-allow-headers', 'authorization, content-type');
          res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
        } catch {
          /* headers may already be sent */
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
        // This socket bypasses DSH's own auth entirely, so requests here are
        // LAN by construction; the gateway key is the only gate.
        Promise.resolve(handler(req, res, { lanOnly: true })).catch((error) => {
          try {
            json(res, 500, { error: { message: String(error?.message ?? error) } });
          } catch {
            /* response gone */
          }
        });
      });
      publicServer.on('error', (error) => {
        ctx.logger?.warn?.(
          `[${NS}] LAN gateway on 0.0.0.0:${publicPort} failed: ${error?.message ?? error}`,
        );
      });
      publicServer.listen(publicPort, '0.0.0.0', () => {
        ctx.logger?.info?.(
          `[${NS}] LAN gateway listening on http://0.0.0.0:${publicPort}${PRIMARY}`,
        );
      });
    } catch (error) {
      publicServer = null;
      ctx.logger?.warn?.(
        `[${NS}] LAN gateway could not start: ${error?.message ?? error}`,
      );
    }
  }

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
    if (publicServer) {
      try {
        publicServer.close();
      } catch {
        /* ignore */
      }
      publicServer = null;
    }
  }, `${NS}: http routes`);
}
