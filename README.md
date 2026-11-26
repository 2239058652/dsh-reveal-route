# dsh-reveal-route

在 DeepSeek Harness 的每一轮对话下，显示**上游实际服务的模型**。

解决的问题：`lightvela`（以及其它网关）的 `auto` 模型，选择器和用量行永远只显示
`lightvela / auto`，而上游可能把它路由到 `glm-5.3-flash` 之类的真实模型。这个插件把那
个真实模型显示出来，只在上游**改写了**路由时出现。

## 显示效果

每轮已完成 Turn 的动作行之前，**两行**展示（按内容收缩宽度，不拉满整行）：

```
tierflow_pro → DeepSeek-V4.1-Flash → Qwen3.8-Flash ×2
首字 3.3s · 生成 161 tok/s · 整体 33 tok/s · 耗时 4.1s · 入 6.1k / 缓存 20.5k · 出 586 · 3 步 · 工具 12
```

第一行是模型路由链（不折行，太长则省略），第二行是速度与用量（**放不下时自动换行**）。
某行没有内容时整行省略，两行都为空时整块不渲染。

### 指标

| 显示 | 含义 |
|---|---|
| **首字** | 首字延迟（TTFT）：该轮各次调用的平均值，step/start → 第一个 token |
| **生成** | 解码速度：输出 token 总和 / 解码总时长，反映模型本身的吞吐 |
| **整体** | 端到端速度：输出 token 总和 / 整轮实际耗时，含等待首字与工具执行 |
| **耗时** | 本轮从第一次请求开始到最后一次结束的墙钟时长 |
| **入 / 缓存** | 新增输入 token / 缓存命中率（绝对 token 数在悬停提示里） |
| **出** | 输出 token 总和（含思考 token，上游不区分） |
| **等首字** | 等首字时间占总耗时的比例，<10% 时不显示 |
| **N 步** | 本轮请求了几次模型 |
| **工具** | 工具调用次数与执行总耗时（call→result 配对），为 0 时不显示 |
| **重试** | 模型重试次数，为 0 时不显示 |
| **已中止 / 出错** | 该轮的结束状态，正常完成不显示 |

速度小于 1 tok/s、计数为 0 的项直接省略；持续时间超过一分钟显示成 `1m39s`、`34m37s`。

模型链那一行不折行（整条链作为一个视觉单元，太长则省略）；指标行随容器宽度自动换行，
不需要展开按钮。

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
