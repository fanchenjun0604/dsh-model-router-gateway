# dsh-model-router-gateway 使用说明（完整版）

把 DSH 能调用的所有模型组成顺序降级路由链，通过 OpenAI 兼容网关对外暴露。
本文件随插件打包分发，卡片内"使用说明"面板直接渲染，离线可用。

## 快速开始

1. 打开本卡片，复制 BaseURL，设置（或保留自动生成的）网关 Key。
2. 任意 OpenAI 兼容客户端填写：
   - Base URL: http://<主机>:<端口>/api/model-router-gateway/v1
   - API Key: 你的网关 Key（Authorization: Bearer <Key>）
   - Model: 路由组 ID（如 default）或 provider:model（如 our-free-model:kilo-auto/free）
3. 在卡片"路由组"里新建链条：按优先级列模型，第一个报错/超额度/超时 → 自动切下一个。

## 配置字段

| 字段 | 默认 | 说明 |
|---|---|---|
| gatewayKey | ""（首次自动生成并持久化） | 所有外部调用必需的 Bearer 密钥，任意字符串 |
| publicPort | 0（关闭） | 在 0.0.0.0 额外监听，供局域网/手机访问；>0 时可用短路径 http://<IP>:<port>/v1 |
| defaultTimeoutMs | 60000 | 单模型请求超时，超时即降级 |
| maxRetryPerModel | 1 | 单模型失败后重试次数，再往下走链条 |
| failureCooldownMs | 60000 | 整链失败后模型进入冷却，期间路由直接跳过；成功一次即清除；0 关闭 |
| modelVisibility | {}（全部可见） | 各提供商对外可见模型白名单（卡片按提供商 全选/反选/清空） |
| routes | [] | 顺序降级路由组 |

状态文件：<DSH_PROFILE_DIR|DSH_HOME|~/.dsh>/dsh-model-router-gateway-state.json。
一旦在界面编辑过，状态文件优先于 cordis.patch.yml 默认值。

## 降级原理

DSH 每个模型流以终结 chunk 收尾：成功，或带类型失败（QUOTA、RATE_LIMIT、
AUTH、SERVER、TIMEOUT…）。首 token 之前的任何失败、超时、空回答都视为
"该模型当前不可用"，自动切到链条下一个，对话无感知。响应体 model 字段
回显实际作答的模型。token 用量按字符估算（免费渠道通常不回报真实值）。
当前为伪流式：上游聚合后按 28 字符切片发 SSE。

## 路由 ID 约定

ID 是客户端寻址契约：创建时定好（default、fast、coding；
规则 [A-Za-z0-9][A-Za-z0-9_.-]{0,63}），之后不可改。留空自动按名称生成。

## 用 patch 声明默认路由（可选）

profile 的 cordis.patch.yml 里：

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
                model: kilo-auto/free

## 安全

- 网关 Key 即额度：持有者可消耗你的模型配额。
- 公网部署下 /config 对匿名请求只返回掩码视图（Key 打码、模型清单裁剪）；
  管理类写操作额外要求本机/已登录会话——只有 Key 的站外请求改不了配置。
  1.0.1 及更早版本 /config 不打码，若从旧版升级过请轮换 Key。
- publicPort 对主机所有网卡开放网关，请配合防火墙、TLS 反代或仅在可信网络使用。
- 请求按 DSH 原样转发给提供商；图片消息替换为文本占位（当前仅转发文本）。

## 已知限制 / 路线图

- tool/function calling 暂不转发（v1.2+ 候选）。
- 真流式（首 token 即转发，降级窗口=首 token 前）在 v1.1 计划中。
- 轮询/负载均衡、按请求类型分流、多 Key、上下文摘要省 token 在候选池。

## 自升级

卡片"插件更新"区：检查更新比对 npm latest；有新版点"升级到 v<x>"，
经宿主插件管理器 remove→install，完成后卡片跨重挂载报告结果；
仅当宿主提示需要重启时才要重启。
