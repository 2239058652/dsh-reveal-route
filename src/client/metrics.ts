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
  /** 本轮输出 token 总和 */
  readonly outputTokens: number | null
}

/** 参与计算的一次模型调用的原始时间点。 */
export interface StepSample {
  readonly turn: number
  readonly startTime: number | null
  readonly firstTokenTime: number | null
  readonly endTime: number
  readonly outputTokens: number | null
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
  }
}

/**
 * 把一轮的所有样本汇总成指标。
 *
 * @param turn - 轮次号
 * @param samples - 该轮的所有样本，顺序不限
 * @returns 汇总结果；无相关样本时返回 null
 */
export function summarizeTurn(turn: number, samples: readonly StepSample[]): TurnMetrics | null {
  const relevant = samples.filter((sample) => sample.turn === turn)
  if (relevant.length === 0) return null

  let ttftSum = 0
  let ttftCount = 0
  let decodeMsSum = 0
  let decodeTokens = 0
  let outputSum = 0
  let hasOutput = false
  let firstStart: number | null = null
  let lastEnd: number | null = null

  for (const sample of relevant) {
    if (sample.startTime !== null && sample.firstTokenTime !== null) {
      const ttft = Math.max(0, sample.firstTokenTime - sample.startTime)
      ttftSum += ttft
      ttftCount += 1
    }
    if (sample.firstTokenTime !== null) {
      decodeMsSum += Math.max(0, sample.endTime - sample.firstTokenTime)
      if (sample.outputTokens !== null) decodeTokens += sample.outputTokens
    }
    if (sample.outputTokens !== null) {
      outputSum += sample.outputTokens
      hasOutput = true
    }
    if (sample.startTime !== null) {
      firstStart = firstStart === null ? sample.startTime : Math.min(firstStart, sample.startTime)
    }
    lastEnd = lastEnd === null ? sample.endTime : Math.max(lastEnd, sample.endTime)
  }

  const elapsedMs = firstStart === null || lastEnd === null ? null : Math.max(0, lastEnd - firstStart)

  return {
    turn,
    steps: relevant.length,
    avgTtftMs: ttftCount === 0 ? null : ttftSum / ttftCount,
    decodeSpeed: decodeMsSum > 0 && decodeTokens > 0 ? decodeTokens / (decodeMsSum / 1000) : null,
    e2eSpeed: elapsedMs !== null && elapsedMs > 0 && hasOutput ? outputSum / (elapsedMs / 1000) : null,
    elapsedMs,
    outputTokens: hasOutput ? outputSum : null,
  }
}
