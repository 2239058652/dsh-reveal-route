/**
 * 徽标组件：本轮的模型路由 + 性能指标。
 *
 * 挂在 `conversation.chat.turnTail`（每轮动作行之前）。**没有数据时返回 null**：
 * 路由部分只在「上游改写了模型」时才有内容，指标部分只要这一轮发生过模型请求就有。
 * 两者都为空（例如某轮被中断、没有任何模型响应）时整块不渲染。
 *
 * 模型链展示规则（按调用顺序，相邻同模型合并）：
 * - 全程同一个模型   → `auto → glm-5.3-flash ×3`
 * - 中途换过模型     → `tierflow_pro → DeepSeek-V4.1-Flash → Qwen3.8-Flash ×2`
 * - 换回原模型       → `A → B → A`（不合并，变回原模型本身是关键信息）
 *
 * ## 折叠与展开
 *
 * 容器**占满整行宽度**。折叠态强制一行，超出部分被省略号截断；
 * 点「展开」后在**同一个容器里换行**继续显示（不是弹层），「收起」回到一行。
 *
 * ## 为什么直接读 `turn.data`
 *
 * `TurnLocation.data` 是 `ConversationLocationDataStore`，按 key 读本轮的业务值。
 * 本插件自己的 Definition 用 `buildLocationData` 把观察值发布到这个 key 上，
 * 这里是同一条链路的下游 —— 不做任何跨插件读取。
 *
 * 类型上不依赖 `ConversationTurnDataMap` 的声明合并（那是本包之外的模块，
 * 合并是否生效取决于宿主包的导出形态），改用最小结构契约。
 *
 * @module dsh-reveal-route/RouteBadge
 */

import type * as React from 'react'
import { useEffect } from 'react'
import { CSS, ensureStyles } from './styles.ts'
import { ROUTE_KIND, type RoutePhase } from './route.ts'
import type { TurnMetrics } from './metrics.ts'
import type { TurnReveal } from './register.ts'

/** 只用到 `data.get`。 */
interface TurnDataStore {
  get(key: string): unknown
}

/** 只用到 `data`。 */
interface TurnLike {
  readonly data?: TurnDataStore
}

export interface RouteBadgeProps {
  /** 所属的 Turn（引擎传入的 TurnLocation）。 */
  turn?: unknown
}

function readReveal(turn: TurnLike | undefined): TurnReveal | undefined {
  const value = turn?.data?.get(ROUTE_KIND)
  if (typeof value !== 'object' || value === null) return undefined
  return value as TurnReveal
}

function readPhases(turn: TurnLike | undefined): readonly RoutePhase[] {
  const phases = readReveal(turn)?.route?.phases
  if (!Array.isArray(phases)) return []
  return phases.filter(
    (phase): phase is RoutePhase =>
      typeof phase === 'object' &&
      phase !== null &&
      typeof (phase as RoutePhase).served === 'string' &&
      (phase as RoutePhase).served !== '',
  )
}

/** 悬停提示：逐段列出请求方、实际服务方与这一段连续调用了几次。 */
function tooltip(phases: readonly RoutePhase[]): string {
  return phases
    .map((phase, index) => `${index + 1}. ${phase.provider}/${phase.requested} → ${phase.served} ×${phase.count}`)
    .join('\n')
}

function formatMs(value: number | null): string | null {
  if (value === null) return null
  const seconds = value / 1000
  // 先取整再判断档位，避免 59999ms 显示成 60.0s、同时 60000ms 显示成 1m00s 的不一致
  const roundedSeconds = Math.round(seconds)
  if (roundedSeconds < 60) {
    return value < 1000 ? `${Math.round(value)}ms` : `${seconds.toFixed(1)}s`
  }
  if (roundedSeconds < 3600) {
    return `${Math.floor(roundedSeconds / 60)}m${String(roundedSeconds % 60).padStart(2, '0')}s`
  }
  const hours = Math.floor(roundedSeconds / 3600)
  return `${hours}h${String(Math.floor((roundedSeconds % 3600) / 60)).padStart(2, '0')}m`
}

/**
 * 速度取整显示。
 *
 * 小于 1 的速度取整会变成 `0 tok/s`，那是无意义的信息 —— 返回 null 让调用方跳过。
 */
function formatSpeed(value: number | null): string | null {
  if (value === null) return null
  const rounded = Math.round(value)
  return rounded < 1 ? null : String(rounded)
}

/**
 * 数字缩写：1234 → 1.2k，1234567 → 1.2M。
 *
 * token 数动辄上万，全写出来会挤爆一行。
 */
function formatCount(value: number | null): string | null {
  if (value === null) return null
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) {
    // 千位：<10000 保留一位小数（1.2k），之后取整（123k）
    const k = value / 1000
    const text = k < 10 ? k.toFixed(1) : String(Math.round(k))
    // 四舍五入可能把 999.9k 抬成 1000k，进到 M 档
    return text === '1000' ? `${(value / 1_000_000).toFixed(1)}M` : `${text}k`
  }
  return `${(value / 1_000_000).toFixed(1)}M`
}

/**
 * 第一行：速度类指标。
 *
 * 用语尽量不用行话：`首字` 代替 TTFT；`生成` / `整体` 区分两个速度口径 ——
 * 生成只看真正出字的时间，整体把等待首字和工具执行也算进去。
 */
function speedParts(metrics: TurnMetrics | undefined): string[] {
  if (metrics === undefined) return []
  const parts: string[] = []
  const ttft = formatMs(metrics.avgTtftMs)
  if (ttft !== null) parts.push(`首字 ${ttft}`)
  const decode = formatSpeed(metrics.decodeSpeed)
  if (decode !== null) parts.push(`生成 ${decode} tok/s`)
  const e2e = formatSpeed(metrics.e2eSpeed)
  if (e2e !== null) parts.push(`整体 ${e2e} tok/s`)
  const elapsed = formatMs(metrics.elapsedMs)
  if (elapsed !== null) parts.push(`耗时 ${elapsed}`)
  return parts
}

/**
 * 第二行：用量与异常。
 *
 * 只显示有值的项 —— 工具 0 次、重试 0 次于读者无意义，直接省略。
 */
function usageParts(metrics: TurnMetrics | undefined): string[] {
  if (metrics === undefined) return []
  const parts: string[] = []
  const input = formatCount(metrics.inputTokens)
  const cache = formatCount(metrics.cacheReadTokens)
  if (input !== null || cache !== null) {
    const fragments: string[] = []
    if (input !== null) fragments.push(`入 ${input}`)
    if (cache !== null) fragments.push(`缓存 ${cache}`)
    parts.push(fragments.join(' / '))
  }
  const output = formatCount(metrics.outputTokens)
  if (output !== null) parts.push(`出 ${output}`)
  if (metrics.steps > 0) parts.push(`${metrics.steps} 步`)
  if (metrics.toolCalls !== null) parts.push(`工具 ${metrics.toolCalls}`)
  if (metrics.retries !== null) parts.push(`重试 ${metrics.retries}`)
  // 正常完成的轮次不标状态；被中止/出错才值得提示
  if (metrics.endReason !== null && metrics.endReason !== 'completed') {
    parts.push(metrics.endReason === 'aborted' ? '已中止' : metrics.endReason === 'error' ? '出错' : metrics.endReason)
  }
  return parts
}

/** 把一组文字用 `·` 连接渲染成互不粘连的片段。 */
function joinPart(className: string): (part: string, index: number) => React.JSX.Element {
  return (part, index) => (
    <span key={`${index}:${part}`} className={className}>
      {index > 0 ? <span className={CSS.sep} aria-hidden="true">·</span> : null}
      {part}
    </span>
  )
}

export function RouteBadge({ turn }: RouteBadgeProps): React.JSX.Element | null {
  const reveal = readReveal(turn as TurnLike | undefined)
  const phases = readPhases(turn as TurnLike | undefined)
  // 速度与用量合成一条：放得下就一行，放不下靠 CSS 自然换行
  const details = [...speedParts(reveal?.metrics), ...usageParts(reveal?.metrics)]

  useEffect(() => {
    ensureStyles()
  }, [])

  if (phases.length === 0 && details.length === 0) return null

  // 请求模型全程一致时只写一次，避免每段重复；不一致就各段自带。
  const requested = new Set(phases.map((phase) => phase.requested))
  const shared = requested.size === 1 ? phases[0]!.requested : undefined
  // 全程同一个模型时不必画箭头链条，`×N` 已经说清次数。
  const single = phases.length === 1

  const tip = tooltip(phases)

  return (
    <div className={CSS.root}>
      <div className={CSS.body}>
        {/* 第一行：模型路由 */}
        {phases.length === 0 ? null : (
          <div className={`${CSS.line} ${CSS.chain}`} title={tip === '' ? undefined : tip}>
            <span className={CSS.served}>
              {shared === undefined ? null : (
                <>
                  {shared}
                  <span className={CSS.arrow} aria-hidden="true"> → </span>
                </>
              )}
            </span>
            {phases.map((phase, index) => (
              <span key={`${index}:${phase.provider}/${phase.served}`} className={CSS.served}>
                {index > 0 ? <span className={CSS.arrow} aria-hidden="true"> → </span> : null}
                {shared === undefined ? `${phase.requested} → ` : ''}
                {phase.served}
                {/* 只有连续用过多次才标次数：×1 没有额外信息 */}
                {phase.count > 1 || single ? <span className={CSS.count}> ×{phase.count}</span> : null}
              </span>
            ))}
          </div>
        )}

        {/* 第二行：速度与用量，放不下时自然换行 */}
        {details.length === 0 ? null : <div className={CSS.line}>{details.map(joinPart(CSS.part))}</div>}
      </div>
    </div>
  )
}
