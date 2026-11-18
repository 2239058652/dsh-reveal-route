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

/** 一轮内某个被路由到的模型的调用次数。 */
export interface RouteEntry {
  readonly requested: string
  readonly served: string
  readonly provider: string
  /** 本轮被路由到该模型的请求次数 */
  readonly count: number
}

/** 一轮内所有被路由到的模型，按首次出现顺序排列。 */
export interface TurnRoute {
  readonly turn: number
  readonly entries: readonly RouteEntry[]
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
 * 把一次新的路由观察并进本轮的累计表。
 *
 * 同一轮内可能发生多次路由改写（每次工具调用都是一次新请求，上游可能换模型），
 * 只保留最后一个会丢掉前面的信息，所以这里按 `provider/served` 聚合并计次。
 * 顺序保持首次出现顺序，便于界面稳定排列。
 *
 * @param previous - 本轮已有的累计值，尚无则为 undefined
 * @param observation - 新观察到的一次改写
 * @returns 新的累计值；计数变化时返回新对象，否则原样返回 previous
 */
export function accumulateRoute(
  previous: TurnRoute | undefined,
  observation: RouteObservation,
): TurnRoute {
  const entries = previous?.entries ?? []
  const index = entries.findIndex(
    (entry) => entry.served === observation.served && entry.provider === observation.provider,
  )
  if (index === -1) {
    return {
      turn: observation.turn,
      entries: [
        ...entries,
        {
          requested: observation.requested,
          served: observation.served,
          provider: observation.provider,
          count: 1,
        },
      ],
    }
  }
  const current = entries[index]!
  const next = entries.slice()
  next[index] = { ...current, count: current.count + 1 }
  return { turn: observation.turn, entries: next }
}
