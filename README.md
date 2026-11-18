# dsh-reveal-route

在 DeepSeek Harness 的每一轮对话下，显示**上游实际服务的模型**。

解决的问题：`lightvela`（以及其它网关）的 `auto` 模型，选择器和用量行永远只显示
`lightvela / auto`，而上游可能把它路由到 `glm-5.3-flash` 之类的真实模型。这个插件把那
个真实模型显示出来，只在上游**改写了**路由时出现。

## 显示效果

每轮已完成 Turn 的动作行之前：

```
一个模型：  [auto → glm-5.3-flash]
多个模型：  [auto → glm-5.3-flash ×3, deepseek-v4-pro ×1]
```

悬停显示逐项明细（`lightvela/auto → glm-5.3-flash ×3`）。

显式模型的轮次（请求 `deepseek-v4-pro-202606` 且上游原样返回）**不显示任何东西**。

**同一轮内的多次路由改写会累计，不覆盖**：长任务里模型被换走又换回，每个模型各服务
了几次都能看出来。只有单项被换过多次时才标 `×N`（`×1` 没信息量，省略）。

> 限制：徽标只在**该轮结束后**渲染（挂在 `turn-tail` 节点上），任务运行中看不到。

## 数据来源

读的是 `assistant/message` 事件里已经存在的字段，不额外发请求：

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
