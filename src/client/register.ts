/**
 * 注册 Definition：把每个 Turn 里观察到的上游路由发布成本轮的业务数据。
 *
 * 走的是 ui-conversation 的公开扩展点 `ctx.uiConversation.events.register(...)`，
 * 和 ui-chat 自己注册 15 个 Definition 用的是同一个入口 —— 不 patch、不猴补、
 * 不和任何别的插件抢事件（没有 `exclusive`，别的 Definition 照旧收到同一事件）。
 *
 * 发布通道是 `buildLocationData`：引擎按 step → turn 两个 scope 依次回调，
 * 我们把值挂到 Turn 上，key 必须是 Definition 的 `kind`（引擎强制校验）。
 *
 * @module dsh-reveal-route/register
 */

import { readRoute, ROUTE_KIND, type RouteObservation } from './route.ts'

/** Definition 只用到这几个字段；写成结构化契约，宿主换实现时这里不必跟着改。 */
interface MatchResult {
  id: string
  role: 'start' | 'update'
}

interface NodeDefinition {
  kind: string
  match: Readonly<Record<string, (event: unknown) => MatchResult | null>>
  start(context: unknown, match: { event: unknown }): RouteObservation | undefined
  update(context: { state?: RouteObservation }, match: { event: unknown }): RouteObservation | undefined
  buildLocationData(
    context: { state?: RouteObservation },
    scope: 'turn' | 'step',
    previous: TurnScopedData | null,
  ): TurnScopedData | null
}

interface TurnScopedData {
  kind: 'turn'
  turn: number
  key: string
  value: unknown
}

interface EventsRegistry {
  register(definition: NodeDefinition): () => void
}

/** 只为导出给调用方做类型标注。 */
export type { EventsRegistry }

/**
 * 定义本体。
 *
 * 一个 Turn 一个 Context（id = 轮次号）；同一轮多个 assistant/message 时，
 * 后到的覆盖前面的 —— 展示的是该轮最后一个被改写过路由的请求。
 */
const definition: NodeDefinition = {
  kind: ROUTE_KIND,

  // 表形式：引擎只为 `assistant/message` 调用这个 handler，别的类型不经过这里。
  match: {
    'assistant/message': (event) => {
      const observation = readRoute(event)
      if (observation === undefined) return null
      // 引擎只在 Context 尚未 start 时把它当作 start，后续同 id 事件自动走 update。
      return { id: String(observation.turn), role: 'start' }
    },
  },

  start: (_context, match) => readRoute(match.event),

  update: (context, match) => readRoute(match.event) ?? context.state,

  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn') return null
    const state = context.state
    if (state === undefined) return null
    // 值没变时返回同一个对象，避免每轮无谓的订阅通知。
    if (previous !== null && previous.turn === state.turn && previous.value === state) return previous
    return { kind: 'turn', turn: state.turn, key: ROUTE_KIND, value: state }
  },
}

/**
 * 注册到 Conversation 事件表。
 *
 * @param events - `ctx.uiConversation.events`（插件的 `inject` 已保证它存在）
 */
export function registerRouteDefinition(events: EventsRegistry): void {
  events.register(definition)
}
