# dsh-reveal-route

在 DeepSeek Harness 的每一轮对话下，显示**上游实际服务的模型**。

解决的问题：`lightvela`（以及其它网关）的 `auto` 模型，选择器和用量行永远只显示
`lightvela / auto`，而上游可能把它路由到 `glm-5.3-flash` 之类的真实模型。这个插件把那
个真实模型显示出来，只在上游**改写了**路由时出现。

## 显示效果

每轮已完成 Turn 的动作行之前，**按调用顺序**展示模型的变化过程，**并附带这一轮的性能指标**：

```
[tierflow_pro → DeepSeek-V4.1-Flash → Qwen3.8-Flash ×2 · TTFT 3.5s · 解码 157.4 tok/s · 端到端 78.8 tok/s · 总耗时 7.1s]
```

悬停显示逐段明细（`1. tierflow/tierflow_pro → DeepSeek-V4.1-Flash ×1`）。

### 四个指标

| 指标 | 含义 |
|---|---|
| **TTFT** | 该轮各次调用的首 token 延迟平均值（step/start → 第一个 token） |
| **解码** | 输出 token 总和 / 解码总时长，反映模型本身的吞吐 |
| **端到端** | 输出 token 总和 / 本轮总时长，含排队与工具等待 |
| **总耗时** | 本轮从第一次请求开始到最后一次结束的墙钟时长 |

缺值的指标直接省略，不显示占位符（老会话没有 `step/start` 时 TTFT 会是 null）。

**阶段超过 3 段时折叠成一行**，末尾给「展开」按钮：点开变成在**同一个容器里换行**（不是弹层），
「收起」回到一行。模型名不会被压缩成省略号。

### 与 DSH 内置统计的区别

DSH 底栏的仪表盘图标是**整个会话**的累计平均；本插件给的是**每一轮**的数字。
会话持续多天时，只有每轮数据才能看出这一轮到底快不快。

## 数据来源

读的是**已经存在的会话事件**，不额外发请求、不轮询。

### 路由（上游实际服务的模型）

```
event.data.message.source = {
  provider: 'lightvela',
  model: 'auto',                                    // 请求的 model id
  replayState: {
    response: {
      kind: 'pi-ai', version: 2,
      model: 'auto',
      responseModel: 'glm-5.3-flash',              // ← 上游回报的真实模型
      ...
    }
  }
}
```

`responseModel` 由 pi-ai 的 `openai-completions` 适配器在流式 chunk 上写入，条件是
`chunk.model` 非空且与请求 id 不同（`output.responseModel ||= chunk.model`）。
所以**有值就等价于「上游改写了路由」**。

### 性能指标

原始事件里就有齐全的原料，无需投影字段：

```
step/start        { turn, step, time }        ← 本步开始
assistant/message { time,                     ← 本步结束
                    data.stream[].time,       ← 首个带 time 的条目 = 首包
                    data.usage.outputTokens } ← 输出 token
```

注意 `step` 号**每轮从 1 重新开始**，不是全局递增 —— 内部时间表的键是 `轮:步`。

## 生效范围

| 上游 | 是否显示 |
|---|---|
| 走 pi-ai 适配器（`openai-completions` / `openai-responses` / `anthropic-messages`）且上游回报了不同 model | 显示 |
| 显式模型，上游原样返回 id | 不显示 |
| 上游响应不带 `model` 字段 | 不显示 |
| 自研适配器未写 `replayState`（如 marvis-connect 的独立实现） | 不显示 |

不需要按 provider 改代码：任何 pi-ai 路由的上游都自动生效。

## 实现方式

两个官方扩展点，互不侵入：

1. **数据**：`ctx.uiConversation.events.register({ kind: 'reveal-route', match: { 'assistant/message': ... }, buildLocationData })` —— 把观察值发布成该轮 Turn 的业务数据。这是 ui-chat 自己注册 15 个 Definition 用的同一个入口。
2. **渲染**：`conversation.chat.turnTail`（`kind: 'list'`）插一个徽标，`turn.data.get('reveal-route')` 读第 1 步发布的值，没有就 `return null`。

不 patch 宿主、不抢事件（无 `exclusive`）、不改任何 provider 配置。

## 安装

包本身是纯客户端插件，Host 半身只有一个空壳 entry。

```bash
pnpm install && pnpm build
```

然后在 profile 里注册（把路径换成你 clone 的位置）：

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": { "dsh-reveal-route": "link:<本仓库绝对路径>" },
"dsh": { "profile": { "bundles": [ /* … */, "dsh-reveal-route" ] } }
```

```bash
cd ~/.dsh/profiles/web && pnpm install
```

重启 `dsh web` 并刷新页面。

## 结构

```
src/index.ts               Host 半身（空壳）
src/client/index.tsx       apply：注册 Definition + turnTail 徽标
src/client/register.ts     Definition 本体（事件 → Turn 数据）
src/client/route.ts        从 assistant/message 事件里提取上游路由
src/client/RouteBadge.tsx  徽标组件
src/client/styles.ts       样式注入
scripts/wrap-client.mjs    包成 __ModuleLoader__ 自注册形态
```

## 许可

MIT
