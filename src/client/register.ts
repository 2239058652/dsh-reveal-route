/**
 * 注册 Definition：把每个 Turn 里观察到的上游路由累计成本轮的业务数据。
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

import {
  accumulateRoute,
  readRoute,
  ROUTE_KIND,
  type TurnRoute,
} from './route.ts'

/** Definition 只用到这几个字段；写成结构化契约，宿主换实现时这里不必跟着改。 */
interface MatchResult {
  id: string
  role: 'start' | 'update'
}

interface NodeDefinition {
  kind: string
  match: Readonly<Record<string, (event: unknown) => MatchResult | null>>
  start(context: unknown, match: { event: unknown }): TurnRoute
  update(context: { state: TurnRoute }, match: { event: unknown }): TurnRoute
  buildLocationData(
    context: { state?: TurnRoute },
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

/** 一个 Context 至少要有一次观察才会被创建；start 时必然有。 */
function firstRoute(event: unknown): TurnRoute {
  const observation = readRoute(event)
  if (observation === undefined) {
    throw new Error('dsh-reveal-route: start requires a routable assistant/message')
  }
  return accumulateRoute(undefined, observation)
}

/**
 * 定义本体。
 *
 * 一个 Turn 一个 Context（id = 轮次号）。同一轮内多次路由改写会**累计**成
 * 按 provider/served 归并的列表（带次数），而不是互相覆盖 —— 长任务里模型
 * 被换成别的再换回来，也能看出每个模型各服务了几次。
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

  start: (_context, match) => firstRoute(match.event),

  update: (context, match) => {
    const observation = readRoute(match.event)
    return observation === undefined ? context.state : accumulateRoute(context.state, observation)
  },

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
