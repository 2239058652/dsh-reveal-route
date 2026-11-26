/**
 * 从一轮的原始事件里计算性能指标。
 *
 * ## 为什么不直接用 `AssistantTiming`
 *
 * ui-conversation 的类型里有 `AssistantTiming { stepStartTime, firstTokenTime, completedTime }`，
 * 但那是**服务端投影**出来的视图字段，客户端包里没有生产者，插件也拿不到。
 * 原始事件里反而有齐全的原料：
 *
 * ```
 * step/start        { turn, step, time }        ← 本步开始
 * assistant/message { time,                     ← 本步结束（末包）
 *                     data.stream[].time,       ← 首个带 time 的条目 = 首包
 *                     data.usage.outputTokens } ← 输出 token
 * ```
 *
 * 于是这里自己算，只依赖**会话持久化格式**（事件类型 + 字段名），不依赖视图层投影。
 *
 * ## 口径
 *
 * 与 DSH 内置的 `deriveStats` 对齐：
 * - TTFT = `firstTokenTime - stepStartTime`
 * - 解码速度 = 输出 token 总和 / 解码总时长
 *
 * 另补两个内置没有的：端到端平均速度、本轮总耗时。
 *
 * @module dsh-reveal-route/metrics
 */

/** 一轮的性能汇总。 */
export interface TurnMetrics {
  readonly turn: number
  /** 该轮请求了几次模型（步数） */
  readonly steps: number
  /** 各步 TTFT 的平均值（只统计能算出的步），ms */
  readonly avgTtftMs: number | null
  /** 解码速度：本轮输出 token 总和 / 本轮解码总时长，tok/s */
  readonly decodeSpeed: number | null
  /** 端到端平均：输出 token 总和 / (最后完成 - 最先开始)，tok/s */
  readonly e2eSpeed: number | null
  /** 总耗时：最后完成 - 最先开始，ms */
  readonly elapsedMs: number | null
  /** 本轮输出 token 总和（含思考） */
  readonly outputTokens: number | null
  /** 本轮新增输入 token 总和（不含缓存命中） */
  readonly inputTokens: number | null
  /** 本轮缓存命中的 token 总和 */
  readonly cacheReadTokens: number | null
  /** 本轮工具调用次数 */
  readonly toolCalls: number | null
  /** 本轮模型重试次数 */
  readonly retries: number | null
  /** 本轮结束原因：completed / aborted / error / interrupted */
  readonly endReason: string | null
}

/** 参与计算的一次模型调用的原始时间点。 */
export interface StepSample {
  readonly turn: number
  readonly startTime: number | null
  readonly firstTokenTime: number | null
  readonly endTime: number
  readonly outputTokens: number | null
  readonly inputTokens: number | null
  readonly cacheReadTokens: number | null
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readNumber(source: Record<string, unknown> | undefined, key: string): number | null {
  const value = source?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * `step/start` 时间表的键。
 *
 * `step` 号每轮从 1 重新开始，不是全局递增，所以键必须带轮次号，
 * 否则后一轮会覆盖前一轮的时间表。
 */
export function stepKey(turn: number, step: number): string {
  return `${turn}:${step}`
}

/**
 * 从 `step/start` 事件里读出 (轮:步) → 开始时间。
 *
 * @param event - `step/start` 事件
 * @returns 键与时间；结构不认识时返回 null
 */
export function readStepStart(event: unknown): { key: string; time: number } | null {
  const envelope = readRecord(event)
  if (envelope?.['type'] !== 'step/start') return null
  const data = readRecord(envelope['data'])
  const turn = readNumber(data, 'turn')
  const step = readNumber(data, 'step')
  const time = readNumber(envelope, 'time')
  if (turn === null || step === null || time === null) return null
  return { key: stepKey(turn, step), time }
}

/**
 * 从 `assistant/message` 事件里取出这一次调用的时间点。
 *
 * 首包时间取 `data.stream` 里第一个带 `time` 的条目 —— 等价于 DSH 自己的
 * “first non-empty text/reasoning/tool delta”（空 delta 不产生 stream 条目）。
 *
 * @param event - `assistant/message` 事件
 * @param stepStarts - `step/start` 时间表，键为 `stepKey(turn, step)`
 * @returns 一个样本；事件结构不认识时返回 null
 */
export function readStepSample(event: unknown, stepStarts: ReadonlyMap<string, number>): StepSample | null {
  const envelope = readRecord(event)
  if (envelope?.['type'] !== 'assistant/message') return null

  const data = readRecord(envelope['data'])
  if (data === undefined) return null

  const turn = readNumber(data, 'turn')
  const step = readNumber(data, 'step')
  if (turn === null || step === null) return null

  const endTime = readNumber(envelope, 'time')
  if (endTime === null) return null

  const stream = data['stream']
  let firstTokenTime: number | null = null
  if (Array.isArray(stream)) {
    for (const entry of stream) {
      const time = readNumber(readRecord(entry), 'time')
      if (time !== null) {
        firstTokenTime = time
        break
      }
    }
  }

  const usage = readRecord(data['usage'])

  return {
    turn,
    startTime: stepStarts.get(stepKey(turn, step)) ?? null,
    firstTokenTime,
    endTime,
    outputTokens: readNumber(usage, 'outputTokens'),
    inputTokens: readNumber(usage, 'inputTokens'),
    cacheReadTokens: readNumber(usage, 'cacheReadTokens'),
  }
}

/**
 * 从单个事件里读出与速度无关的计数增量。
 *
 * 覆盖 `tool/call`、`llm/retry`、`turn/end` 三类 —— 它们都不带 usage，
 * 但会影响「这一轮到底顺不顺利」的判断。
 *
 * @param event - 任意原始事件
 * @returns 计数增量；与本题无关时各字段为 0 / null
 */
export function readCounters(event: unknown): {
  toolCall: number
  retry: number
  endReason: string | null
} {
  const envelope = readRecord(event)
  const type = envelope?.['type']
  if (type === 'tool/call') return { toolCall: 1, retry: 0, endReason: null }
  if (type === 'llm/retry') return { toolCall: 0, retry: 1, endReason: null }
  if (type === 'turn/end') {
    const reason = readRecord(readRecord(envelope?.['data'])?.['reason'])
    const kind = reason?.['kind']
    return { toolCall: 0, retry: 0, endReason: typeof kind === 'string' ? kind : null }
  }
  return { toolCall: 0, retry: 0, endReason: null }
}

/**
 * 把样本累加进汇总状态（增量版，避免每次重算都遍历全部历史样本）。
 *
 * 会话可能有几百轮、每次模型请求都会触发一次汇总，全量 filter 是平方级复杂度。
 * 这里把汇总量维护成可累加的形式，每来一个样本只更新 O(1) 个数。
 */
export interface MetricsAccumulator {
  turn: number
  steps: number
  ttftSum: number
  ttftCount: number
  decodeMsSum: number
  decodeTokens: number
  outputSum: number
  hasOutput: boolean
  inputSum: number
  hasInput: boolean
  cacheSum: number
  hasCache: boolean
  toolCalls: number
  retries: number
  endReason: string | null
  firstStart: number | null
  lastEnd: number | null
}

/** 新建一个空累加器。 */
export function createAccumulator(turn: number): MetricsAccumulator {
  return {
    turn,
    steps: 0,
    ttftSum: 0,
    ttftCount: 0,
    decodeMsSum: 0,
    decodeTokens: 0,
    outputSum: 0,
    hasOutput: false,
    inputSum: 0,
    hasInput: false,
    cacheSum: 0,
    hasCache: false,
    toolCalls: 0,
    retries: 0,
    endReason: null,
    firstStart: null,
    lastEnd: null,
  }
}

/**
 * 把一次 `assistant/message` 样本并入累加器。
 *
 * @param acc - 现有累加器，无则传 undefined
 * @param sample - 新的样本
 */
export function accumulateMetrics(acc: MetricsAccumulator | undefined, sample: StepSample): MetricsAccumulator {
  const base = acc === undefined || acc.turn !== sample.turn ? createAccumulator(sample.turn) : acc
  const next = { ...base }
  next.steps = base.steps + 1

  if (sample.startTime !== null && sample.firstTokenTime !== null) {
    next.ttftSum = base.ttftSum + Math.max(0, sample.firstTokenTime - sample.startTime)
    next.ttftCount = base.ttftCount + 1
  }
  if (sample.firstTokenTime !== null) {
    next.decodeMsSum = base.decodeMsSum + Math.max(0, sample.endTime - sample.firstTokenTime)
    if (sample.outputTokens !== null) next.decodeTokens = base.decodeTokens + sample.outputTokens
  }
  if (sample.outputTokens !== null) {
    next.outputSum = base.outputSum + sample.outputTokens
    next.hasOutput = true
  }
  if (sample.inputTokens !== null) {
    next.inputSum = base.inputSum + sample.inputTokens
    next.hasInput = true
  }
  if (sample.cacheReadTokens !== null) {
    next.cacheSum = base.cacheSum + sample.cacheReadTokens
    next.hasCache = true
  }
  if (sample.startTime !== null) {
    next.firstStart = base.firstStart === null ? sample.startTime : Math.min(base.firstStart, sample.startTime)
  }
  next.lastEnd = base.lastEnd === null ? sample.endTime : Math.max(base.lastEnd, sample.endTime)

  return next
}

/**
 * 把计数类事件并入累加器（工具调用、重试、结束原因）。
 *
 * 这些事件不带 usage，但同样属于「这一轮发生了什么」，所以要单独累加。
 *
 * @param acc - 现有累加器，无则传 undefined
 * @param counters - `readCounters` 的结果
 * @param turn - 所属轮次（用于首次创建）
 */
export function accumulateCounters(
  acc: MetricsAccumulator | undefined,
  counters: { toolCall: number; retry: number; endReason: string | null },
  turn: number,
): MetricsAccumulator {
  const base = acc === undefined || acc.turn !== turn ? createAccumulator(turn) : acc
  if (counters.toolCall === 0 && counters.retry === 0 && counters.endReason === null) return base
  return {
    ...base,
    toolCalls: base.toolCalls + counters.toolCall,
    retries: base.retries + counters.retry,
    endReason: counters.endReason ?? base.endReason,
  }
}

/**
 * 从累加器算出对外发布的指标。
 *
 * @param acc - 累加器
 */
export function finalizeMetrics(acc: MetricsAccumulator): TurnMetrics {
  const elapsedMs = acc.firstStart === null || acc.lastEnd === null ? null : Math.max(0, acc.lastEnd - acc.firstStart)
  return {
    turn: acc.turn,
    steps: acc.steps,
    avgTtftMs: acc.ttftCount === 0 ? null : acc.ttftSum / acc.ttftCount,
    decodeSpeed: acc.decodeMsSum > 0 && acc.decodeTokens > 0 ? acc.decodeTokens / (acc.decodeMsSum / 1000) : null,
    e2eSpeed:
      elapsedMs !== null && elapsedMs > 0 && acc.hasOutput ? acc.outputSum / (elapsedMs / 1000) : null,
    elapsedMs,
    outputTokens: acc.hasOutput ? acc.outputSum : null,
    inputTokens: acc.hasInput ? acc.inputSum : null,
    cacheReadTokens: acc.hasCache ? acc.cacheSum : null,
    // 计数为 0 时返回 null 而不是 0：界面上「0 次工具」没有信息量
    toolCalls: acc.toolCalls > 0 ? acc.toolCalls : null,
    retries: acc.retries > 0 ? acc.retries : null,
    endReason: acc.endReason,
  }
}

