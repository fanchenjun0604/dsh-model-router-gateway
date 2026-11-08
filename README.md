# dsh-model-router-gateway

把 DSH 能调用的所有模型组成顺序降级链，用一个 OpenAI 兼容网关（BaseURL + Key）暴露给手机和任何外部客户端——模型 A 没额度/限流/报错时无感切到 B，对话不中断。

- **全量模型**：DSH 里能调的都能转发（`llm` 服务枚举），可见性按渠道勾选
- **顺序降级**：链条按优先级尝试，失败模型进入冷却期自动跳过，响应回显实际作答模型
- **一个入口**：`/v1/models` + `/v1/chat/completions`，流式与非流式，Bearer Key 保护
- **局域网监听**：可选 `publicPort` 绑 0.0.0.0，手机热点直连
- **可视化卡片**：路由、Key、链条排序（拖拽/箭头）、状态文件持久化
- **公网安全**：匿名 `/config` 只回掩码视图；管理写操作要求本机/已登录会话
- **卡片自升级**：检查 npm latest，一键升级，无需终端
- **自带文档**：完整手册在插件卡片「使用说明」面板，离线可用

## 安装

```bash
dsh plugin --profile <你的profile> add dsh-model-router-gateway
```

桌面版 / Web 版均免重启生效。

## 使用（三步）

1. DSH 里打开 设置 → 插件 → 模型路由网关 卡片；
2. 复制 BaseURL，确认网关 Key；
3. 任意 OpenAI 兼容客户端填：

| 字段 | 值 |
|---|---|
| Base URL | `http://<主机>:<端口>/api/model-router-gateway/v1` |
| API Key | 你的网关 Key |
| Model | 路由组 ID（如 `default`）或 `provider:model` |

**许可**：MIT。tool/function calling 暂未转发；当前为聚合后伪流式（真流式在 v1.1 计划中）。
