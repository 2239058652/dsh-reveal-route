/**
 * 从 `assistant/message` 事件里读出上游实际服务的模型。
 *
 * ## 数据从哪来
 *
 * `assistant/message` 事件的 `data.message.source` 是 `ModelMessageSource`，
 * 它带 `replayState`（pi-ai 适配器写的无损回放状态）。结构为：
 *
 * ```
 * replayState.response = {
 *   kind: 'pi-ai', version: 2,
 *   model: <请求时传的 model id>,
 *   responseModel?: <上游响应里回报的 model>,   // 只有和请求 id 不同时才有
 *   ...
 * }
 * ```
 *
 * `responseModel` 由 pi-ai 的 openai-completions 适配器在流式 chunk 上写入，
 * 条件是 `chunk.model` 是字符串、非空、且 `!== model.id`（见 pi-ai
 * `dist/api/openai-completions.js` 的 `output.responseModel ||= chunk.model`）。
 *
 * 所以：**有 responseModel 就说明上游改写了路由**；显式模型（请求 id 与响应
 * 一致）不会产生这个字段 —— 那正是我们不想显示的情况。
 *
 * @module dsh-reveal-route/route
 */

/**
 * Definition kind，同时是 Turn 数据的 key。
 *
 * 引擎强制两者相等：`buildLocationData` 返回的 `key` 与 Definition 的 `kind`
 * 不一致会直接抛错（见 ui-conversation 的 `buildLocationData` 校验），
 * 所以这里只维护一个常量。
 */
export const ROUTE_KIND = 'reveal-route'

/** 一个 Turn 内观察到的上游路由信息。 */
export interface RouteObservation {
  /** 请求时使用的 model id（选择器里的那个，如 `auto`） */
  readonly requested: string
  /** 上游实际回报的模型（如 `glm-5.3-flash`） */
  readonly served: string
  /** provider 路由名（如 `lightvela`） */
  readonly provider: string
  /** 首次观察到它的 Turn */
  readonly turn: number
}

/** 一段连续使用同一模型的区间。 */
export interface RoutePhase {
  readonly requested: string
  readonly served: string
  readonly provider: string
  /** 这一段里连续调用该模型的次数 */
  readonly count: number
}

/**
 * 一轮内模型使用的变化过程。
 *
 * `phases` 按调用顺序排列，**相邻相同模型会合并成一段**。模型切走又切回时
 * 会重新开一段（`A ×1 → B ×1 → A ×1`），因为「变回去」本身是关键信息，
 * 合并掉就看不出中间换过。
 */
export interface TurnRoute {
  readonly turn: number
  readonly phases: readonly RoutePhase[]
}

/** 只读我们要的那几层，避免为一次展示引入整包类型依赖。 */
function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * 从一个 assistant/message 事件中提取路由观察。
 *
 * @param event - `assistant/message` 事件（形状见 dsh-session 的事件表）
 * @returns 上游改写过路由时的观察值；未改写、字段缺失、或结构不认识时返回 undefined
 */
export function readRoute(event: unknown): RouteObservation | undefined {
  const envelope = readRecord(event)
  if (envelope === undefined) return undefined
  // 只处理已落定的助手消息；流式 chunk / attempt 事件不参与。
  if (envelope['type'] !== 'assistant/message') return undefined

  const data = readRecord(envelope['data'])
  if (data === undefined) return undefined

  const message = readRecord(data['message'])
  if (message === undefined) return undefined

  const source = readRecord(message['source'])
  if (source === undefined) return undefined

  const replay = readRecord(source['replayState'])
  if (replay === undefined) return undefined

  const response = readRecord(replay['response'])
  if (response === undefined) return undefined

  // 只认 pi-ai 的回放结构；别的适配器即使有同名字段也不猜。
  if (response['kind'] !== 'pi-ai') return undefined

  const served = readString(response, 'responseModel')
  if (served === undefined) return undefined

  const requested = readString(response, 'model') ?? readString(source, 'model')
  if (requested === undefined) return undefined

  // 上游没改写（响应模型与请求模型一致）时不显示。
  if (served === requested) return undefined

  const provider = readString(source, 'provider')
  if (provider === undefined) return undefined

  const turn = typeof data['turn'] === 'number' ? data['turn'] : undefined
  if (turn === undefined) return undefined

  return { requested, served, provider, turn }
}

/**
 * 把一次新的路由观察并进本轮的变化序列。
 *
 * 同一轮内可能发生多次路由改写（每次工具调用都是一次新请求，上游可能换模型）。
 * 这里维护的是**按调用顺序的阶段序列**，相邻同一个模型合并计数：
 *
 * ```
 * glm, glm, deepseek, glm  →  glm×2 → deepseek×1 → glm×1
 * ```
 *
 * 注意末尾那段 `glm×1` 不会被并回第一段 —— 中间换过模型就说明路由真的变了，
 * 合并会把「变回原模型」这个事实抹掉。
 *
 * @param previous - 本轮已有的累计值，尚无则为 undefined
 * @param observation - 新观察到的一次改写
 * @returns 新的累计值；总是返回新对象（调用方靠引用判断变化）
 */
export function accumulateRoute(
  previous: TurnRoute | undefined,
  observation: RouteObservation,
): TurnRoute {
  const phases = previous?.phases ?? []
  const last = phases.at(-1)
  // 和上一段是同一个模型：延长这一段，不新增阶段。
  if (last !== undefined && last.served === observation.served && last.provider === observation.provider) {
    return {
      turn: observation.turn,
      phases: [...phases.slice(0, -1), { ...last, count: last.count + 1 }],
    }
  }
  return {
    turn: observation.turn,
    phases: [
      ...phases,
      {
        requested: observation.requested,
        served: observation.served,
        provider: observation.provider,
        count: 1,
      },
    ],
  }
}
