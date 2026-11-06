# dsh-model-router-gateway

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that turns **every model DSH can reach** into **ordered fallback chains** and exposes them through an **OpenAI-compatible gateway** — one BaseURL + one key for your phone apps, desktop clients, and any OpenAI-style tool.

Built for the common reality of free / quota-limited model channels: when model A runs out of tokens, rate-limits, or errors, the gateway **silently switches to model B** — the conversation never breaks.

📖 Language / 语言：**English** · [中文](#中文文档)

---

## What it does

- **Full model inventory** — reads every provider and model registered in your DSH instance through the `llm` service (anything DSH can call, the gateway can forward).
- **Ordered fallback routes** — define route groups like `free-deepseek → free-glm → paid-deepseek`. A request walks the chain until one model answers.
- **OpenAI-compatible endpoints** — `GET /v1/models` and `POST /v1/chat/completions`, streaming and non-streaming.
- **Gateway key** — a single key you set (any string) protects all external access.
- **LAN / server listener** — optional `publicPort` binds `0.0.0.0` so phones on your hotspot, or the public internet behind a reverse proxy, can reach it even when DSH itself only listens on loopback.
- **Model visibility** — tick exactly which models external clients may see (select-all / invert / clear per provider). Keeps your `/models` list small and usable.
- **Visual management card** — edit routes, keys, and visibility live from the DSH plugins/settings UI. All changes persist to a small state file and survive restarts.
- **Self-contained** — the only runtime dependency is `@deepseek-ai/schemastery` (public npm, installed automatically with the plugin); everything else is Node builtins and DSH services, so it installs and runs identically on desktop (Electron) and web deployments.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-model-router-gateway
```

(`--profile web` on a web deployment; on the desktop app use your profile name.) The plugin activates without a restart on both desktop and web — installing or upgrading through the DSH plugin manager / Settings → Plugins is enough.

Upgrades need no terminal at all: the management card has **检查更新 / 升级** built in (since 1.0.3). It checks npm `latest` and swaps the plugin through the host's plugin manager; after the update lands the card reports it, prompting a restart only when the host says the new code needs one.


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

In the card, add a route group and list models in priority order. Route ids
are the addressing contract clients type into `model`: pick them deliberately
at creation (`default`, `fast`, `coding` — pattern `[A-Za-z0-9][A-Za-z0-9_.-]`);
they are fixed afterwards because every client refers to them. Leave the id
blank and the card derives one from the name. Completions echo the model that
actually answered in the `model` field. Or declare defaults in your profile's
`cordis.patch.yml`:

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
| `failureCooldownMs` | `60000` | After a model fails end-to-end, the chain skips it directly for this long instead of burning a fresh timeout; a success clears the mark. `0` disables. |
| `modelVisibility` | `{}` (all visible) | Per-provider allow-list of model ids shown in `/v1/models`. |
| `routes` | `[]` | Ordered fallback route groups. |

State file: `<profile dir>/dsh-model-router-gateway-state.json`. The three
runtime knobs (timeout / retries / cooldown) are also editable in the
management card under **Advanced**.

## How the failover works

Every DSH model stream ends in a terminal chunk: success, or a typed failure (`QUOTA`, `RATE_LIMIT`, `AUTH`, `SERVER`, `TIMEOUT`, …). The gateway treats any failure **before the first token**, a timeout, or an empty answer as "this model is unavailable right now" and moves to the next entry in the route — transparently, keeping the same conversation. A model that fails end-to-end then enters a short **cooldown** (`failureCooldownMs`, default 60s): the next request skips it directly instead of burning another timeout, and any success clears the mark. Usage accounting (`prompt_tokens`/`completion_tokens`) is estimated in characters, since upstream free channels rarely report tokens.

## Security notes

- Keep the gateway key secret: anyone holding it can spend your model quota. The key is stored in the plugin state file next to your profile.
- On public deployments the `/config` surface answers anonymous callers with a **masked view** (key redacted, model lists trimmed), and admin mutations additionally require the host's local/authenticated session — a bare gateway key from off-box cannot manage the gateway. Calling `/v1/*` with the key still works from anywhere, by design. Rotate the key if it was ever exposed (1.0.1 and earlier answered `/config` unmasked).
- Binding `publicPort` opens the gateway on every interface of the host. Only do this behind a firewall, reverse proxy with TLS, or on trusted networks.
- Requests are forwarded to providers exactly as DSH would send them; images are replaced by text placeholders (text-only forwarding). Tool/function calling is not forwarded yet.

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

---

# 中文文档

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：把 **DSH 能调用的所有模型** 组成 **顺序降级路由组**，并通过 **OpenAI 兼容网关** 暴露出去——一个 BaseURL + 一个 Key，手机 AI 工具、桌面客户端、任何 OpenAI 风格工具都能直接接入。

专为免费/限额模型渠道的现实场景设计：模型 A 没额度、被限流、报错时，网关 **无感切换到模型 B**，对话不中断。

## 功能

- **全量模型清单** — 通过 DSH 的 `llm` 服务枚举所有已注册提供商与模型；DSH 能调的，网关就能转发。
- **顺序降级路由** — 定义如 `免费deepseek → 免费glm → 付费deepseek` 的链条，请求按序尝试直到某个模型成功。
- **OpenAI 兼容接口** — `GET /v1/models`、`POST /v1/chat/completions`，支持流式与非流式。
- **网关 Key** — 自定任意字符串作为统一访问密钥。
- **局域网/服务器监听** — 可选 `publicPort` 绑定 `0.0.0.0`：即使 DSH 本体只监听回环地址，手机热点、反向代理后的公网也能接入。
- **模型可见性勾选** — 按提供商全选/反选/清空，精确控制外部客户端能看到的模型列表。
- **可视化管理卡片** — 路由、Key、可见性全部在线编辑，持久化到状态文件，重启不丢。
- **自带依赖** — 唯一运行时依赖是 `@deepseek-ai/schemastery`（公共 npm，随插件自动安装）；其余全部是 Node 内置模块和 DSH 服务，桌面版（Electron）与 Web 版行为一致。

## 安装

```bash
dsh plugin --profile <你的profile> add dsh-model-router-gateway
```

（Web 部署通常是 `--profile web`；桌面版用你的 profile 名。）桌面版和 Web 版都**无需重启**即可生效——在 DSH 插件管理 / 设置 → 插件 里安装或升级即可。

后续升级更不用碰终端：管理卡片自带**检查更新 / 升级**（1.0.3 起），点一下就通过宿主插件管理器完成 remove → install 替换；升级完成后卡片会报告结果，仅当宿主明确提示新代码需要重启时才需要重启。远程部署（如 Unikraft）同样可以在浏览器里一键升级。

## 使用

1. 打开插件卡片（插件页，或 设置 → 插件 → 插件设置）。
2. 复制 **BaseURL**，设置 **网关 Key**。
3. 在任何 OpenAI 兼容客户端填写：

   | 字段 | 值 |
   |---|---|
   | Base URL | `http://<主机>:<端口>/api/model-router-gateway/v1` |
   | API Key | 你的网关 Key |
   | 模型 | 路由组 ID（如 `default`）或 `provider:model`（如 `our-free-model:kimi-k3`） |

   设置 `publicPort`（如 `18080`）后，外部客户端可简化为 `http://<主机IP>:18080/v1`。

### 配置字段

| 字段 | 默认 | 说明 |
|---|---|---|
| `gatewayKey` | `""`（首次自动生成并持久化） | 所有外部调用必需的 Bearer 密钥，任意字符串。 |
| `publicPort` | `0`（关闭） | 在 `0.0.0.0` 额外监听，供局域网/手机访问。 |
| `defaultTimeoutMs` | `60000` | 单模型超时，超时即降级到下一个。 |
| `maxRetryPerModel` | `1` | 单模型失败后的重试次数，再往下走链条。 |
| `failureCooldownMs` | `60000` | 模型整链失败后进入冷却，期间路由直接跳过它，不再空烧超时；成功一次即清除。`0` 关闭。 |
| `modelVisibility` | `{}`（全部可见） | 各提供商对外可见的模型 id 白名单。 |
| `routes` | `[]` | 顺序降级路由组。 |

状态文件：`<profile 目录>/dsh-model-router-gateway-state.json`。超时/重试/冷却三个运行参数也可在管理卡片"高级设置"里修改，随状态文件持久化。

路由组 ID 就是手机端 `model` 字段要填的寻址名：创建时定好（如 `default`、`fast`、`coding`，规则 `[A-Za-z0-9][A-Za-z0-9_.-]`），之后不可改；留空会自动按名称生成。响应体的 `model` 字段会回显实际作答的模型。

注意：一旦在界面上编辑过路由，持久化的状态文件优先于 patch 默认值。

## 降级原理

DSH 的每个模型流都以终结 chunk 收尾：成功，或带类型失败（`QUOTA`、`RATE_LIMIT`、`AUTH`、`SERVER`、`TIMEOUT`…）。网关把 **首 token 之前** 的任何失败、超时、空回答视为"该模型当前不可用"，自动切到路由里的下一个模型，对话无感知。整链失败的模型随后进入短暂**冷却**（`failureCooldownMs`，默认 60 秒）：期间新请求直接跳过它，不再空烧一轮超时，成功一次即解除。token 用量按字符估算（上游免费渠道通常不回报真实值）。

## 安全提示

- 网关 Key 即额度：持有者可以消耗你的模型配额，请妥善保管（它存在 profile 旁的状态文件里）。
- 公网部署下 `/config` 对匿名请求只返回**掩码视图**（Key 打码、模型清单裁剪）；管理类写操作还额外要求本机/已登录会话——只有网关 Key 的站外请求无法改配置。用 Key 正常调用 `/v1/*` 不受影响，这是设计本意。若 Key 曾暴露请轮换（1.0.1 及更早版本的 `/config` 不打码）。
- 开放 `publicPort` 等于对主机所有网卡开放网关，请配合防火墙、TLS 反代或仅在可信网络使用。
- 请求按 DSH 原样转发给提供商；图片消息替换为文本占位（当前仅转发文本），tool/function calling 暂未转发。

## 许可

MIT
