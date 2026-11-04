# dsh-model-router-gateway

[English](README.md) | 中文

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

（Web 部署通常是 `--profile web`；桌面版用你的 profile 名。）装完重启/重载 profile。

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
| `modelVisibility` | `{}`（全部可见） | 各提供商对外可见的模型 id 白名单。 |
| `routes` | `[]` | 顺序降级路由组。 |

状态文件：`<profile 目录>/dsh-model-router-gateway-state.json`。

## 降级原理

DSH 的每个模型流都以终结 chunk 收尾：成功，或带类型失败（`QUOTA`、`RATE_LIMIT`、`AUTH`、`SERVER`、`TIMEOUT`…）。网关把 **首 token 之前** 的任何失败、超时、空回答视为"该模型当前不可用"，自动切到路由里的下一个模型，对话无感知。token 用量按字符估算（上游免费渠道通常不回报真实值）。

## 安全提示

- 网关 Key 即额度：持有者可以消耗你的模型配额，请妥善保管（它存在 profile 旁的状态文件里）。
- 开放 `publicPort` 等于对主机所有网卡开放网关，请配合防火墙、TLS 反代或仅在可信网络使用。
- 请求按 DSH 原样转发给提供商；图片消息替换为文本占位（当前仅转发文本）。

## 许可

MIT
