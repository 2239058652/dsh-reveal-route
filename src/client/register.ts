/**
 * 注册 Definition：把每轮的上游路由与性能指标发布成本轮的业务数据。
 *
 * 走的是 ui-conversation 的公开扩展点 `ctx.uiConversation.events.register(...)`，
 * 和 ui-chat 自己注册 15 个 Definition 用的是同一个入口 —— 不 patch、不猴补、
 * 不和任何别的插件抢事件（没有 `exclusive`，别的 Definition 照旧收到同一事件）。
 *
 * 发布通道是 `buildLocationData`：引擎按 step → turn 两个 scope 依次回调，
 * 我们把值挂到 Turn 上，key 必须是 Definition 的 `kind`（引擎强制校验）。
 *
 * ## 两个事件都要订阅
 *
 * - `step/start`：每步的开始时间（算 TTFT 必需，`assistant/message` 里没有）
 * - `assistant/message`：路由结果 + 首包/末包时间 + 输出 token
 *
 * `step` 号每轮从 1 重新开始，所以内部时间表按 `轮:步` 存键。
 *
 * ## 引擎的 state 契约
 *
 * `context.state` 就是上一次 `start`/`update` 的返回值，也就是**内部状态本身**。
 * 发布给界面的值在 `buildLocationData` 里另算，两者不混。
 *
 * @module dsh-reveal-route/register
 */

import {
  accumulateRoute,
  readRoute,
  ROUTE_KIND,
  type TurnRoute,
} from './route.ts'
import {
  readStepSample,
  readStepStart,
  summarizeTurn,
  type StepSample,
  type TurnMetrics,
} from './metrics.ts'

/** 发布到 Turn 上的完整业务数据。 */
export interface TurnReveal {
  readonly route: TurnRoute
  readonly metrics: TurnMetrics
}

/** 一个 Turn 的累积状态；`state` 在引擎里就是它。 */
interface TurnState {
  readonly route: TurnRoute
  /** `step/start` 时间表，键为 `轮:步` */
  readonly stepStarts: ReadonlyMap<string, number>
  readonly samples: readonly StepSample[]
}

/** Definition 只用到这几个字段；写成结构化契约，宿主换实现时这里不必跟着改。 */
interface MatchResult {
  id: string
  role: 'start' | 'update'
}

interface NodeDefinition {
  kind: string
  match: Readonly<Record<string, (event: unknown) => MatchResult | null>>
  start(context: unknown, match: { event: unknown }): TurnState | null
  update(context: { state?: TurnState }, match: { event: unknown }): TurnState | null
  buildLocationData(
    context: { state?: TurnState },
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

/** 匹配阶段只判断事件形状，不需要真实时间表。 */
const EMPTY_STARTS: ReadonlyMap<string, number> = new Map()

/**
 * 消费一个事件，推进内部状态。
 *
 * @param state - 已有状态（首次为 undefined）
 * @param event - 原始事件
 * @returns 新状态；事件与本题无关时返回 null
 */
function advance(state: TurnState | undefined, event: unknown): TurnState | null {
  const start = readStepStart(event)
  if (start !== null) {
    const turn = Number(start.key.slice(0, start.key.indexOf(':')))
    const stepStarts = new Map(state?.stepStarts ?? [])
    stepStarts.set(start.key, start.time)
    // 只有 step/start 时路由还是空的，先记时间表等 assistant/message。
    return {
      route: state?.route ?? { turn, phases: [] },
      stepStarts,
      samples: state?.samples ?? [],
    }
  }

  // 指标与路由解耦：**每次模型请求都要记样本**，不管上游有没有改写路由。
  // 早先这里在 readRoute 返回 undefined 时直接 bail，导致「模型没变」的轮次
  // 一个样本都记不到，性能指标永远为空。
  const stepStarts = state?.stepStarts ?? new Map<string, number>()
  const sample = readStepSample(event, stepStarts)
  if (sample === null) return null

  const observation = readRoute(event)
  const route = observation === undefined ? (state?.route ?? { turn: sample.turn, phases: [] }) : accumulateRoute(state?.route, observation)

  return {
    route,
    stepStarts,
    samples: sample === null ? (state?.samples ?? []) : [...(state?.samples ?? []), sample],
  }
}

/**
 * 定义本体。
 *
 * 一个 Turn 一个 Context（id = 轮次号）。同一轮内多次路由改写会**累计**成
 * 按阶段排列的变化序列（相邻同模型合并计数），而不是互相覆盖。
 */
const definition: NodeDefinition = {
  kind: ROUTE_KIND,

  // 表形式：引擎按事件类型分发，只为这两个类型调用我们。
  match: {
    'step/start': (event) => {
      const start = readStepStart(event)
      if (start === null) return null
      const turn = start.key.slice(0, start.key.indexOf(':'))
      return { id: turn, role: 'start' }
    },
    // 关键：**不能**因为路由没变就不匹配。每次模型请求都要进 Context 记样本，
    // 否则「模型没变」的轮次算不出任何性能指标。
    'assistant/message': (event) => {
      const sample = readStepSample(event, EMPTY_STARTS)
      if (sample === null) return null
      return { id: String(sample.turn), role: 'start' }
    },
  },

  start: (_context, match) => advance(undefined, match.event),

  update: (context, match) => advance(context.state, match.event),

  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn') return null
    const state = context.state
    if (state === undefined) return null
    const turn = state.route.turn
    const metrics: TurnMetrics = summarizeTurn(turn, state.samples) ?? {
      turn,
      steps: state.samples.filter((sample) => sample.turn === turn).length,
      avgTtftMs: null,
      decodeSpeed: null,
      e2eSpeed: null,
      elapsedMs: null,
      outputTokens: null,
    }
    const value: TurnReveal = { route: state.route, metrics }
    // 值没变时返回同一个对象，避免每轮无谓的订阅通知。
    if (previous !== null && previous.turn === turn && previous.value === value) return previous
    return { kind: 'turn', turn, key: ROUTE_KIND, value }
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
