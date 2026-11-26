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
import { useEffect, useRef, useState } from 'react'
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
 * 四个指标拼成一行。
 *
 * 用语尽量不用行话：`首字` 代替 TTFT，`生成` / `全程` 区分两个速度口径。
 * 缺值的项直接跳过，不显示占位符。
 */
function metricParts(metrics: TurnMetrics | undefined): string[] {
  if (metrics === undefined) return []
  const parts: string[] = []
  const ttft = formatMs(metrics.avgTtftMs)
  if (ttft !== null) parts.push(`首字 ${ttft}`)
  const decode = formatSpeed(metrics.decodeSpeed)
  if (decode !== null) parts.push(`生成 ${decode} tok/s`)
  const e2e = formatSpeed(metrics.e2eSpeed)
  if (e2e !== null) parts.push(`全程 ${e2e} tok/s`)
  const elapsed = formatMs(metrics.elapsedMs)
  if (elapsed !== null) parts.push(`耗时 ${elapsed}`)
  return parts
}

export function RouteBadge({ turn }: RouteBadgeProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const contentRef = useRef<HTMLSpanElement | null>(null)
  const reveal = readReveal(turn as TurnLike | undefined)
  const phases = readPhases(turn as TurnLike | undefined)
  const metrics = metricParts(reveal?.metrics)

  useEffect(() => {
    ensureStyles()
  }, [])

  /**
   * 判断折叠态是否真的被截断了。
   *
   * 只在确实溢出时显示「展开」按钮 —— 否则每一轮都挂个没用的按钮很吵。
   * 折叠态（nowrap）下 `scrollWidth > clientWidth` 就是溢出。
   *
   * 依赖里带上 metrics：一轮里样本是逐个到达的，内容会变长，
   * 需要重新测量；只在挂载时测一次会导致长轮次漏掉按钮。
   */
  useEffect(() => {
    const element = contentRef.current
    if (element === null || expanded) return
    const measure = (): void => {
      setOverflowing(element.scrollWidth > element.clientWidth + 1)
    }
    measure()
    // 窗口变宽/变窄都会改变能否装下
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [expanded, phases.length, metrics.length])

  if (phases.length === 0 && metrics.length === 0) return null

  // 请求模型全程一致时只写一次，避免每段重复；不一致就各段自带。
  const requested = new Set(phases.map((phase) => phase.requested))
  const shared = requested.size === 1 ? phases[0]!.requested : undefined
  // 全程同一个模型时不必画箭头链条，`×N` 已经说清次数。
  const single = phases.length === 1

  const tip = tooltip(phases)

  return (
    <div className={CSS.root}>
      <span
        ref={contentRef}
        // 折叠态一行截断，展开态在同一个容器里换行
        className={expanded ? `${CSS.pill} ${CSS.pillExpanded}` : CSS.pill}
        // 没有路由阶段时不必挂一个空的悬浮提示
        title={tip === '' ? undefined : tip}
        // 点击整块也能切换，省得只认那个小按钮
        onClick={() => {
          if (overflowing || expanded) setExpanded((value) => !value)
        }}
        role={overflowing || expanded ? 'button' : undefined}
        aria-expanded={overflowing || expanded ? expanded : undefined}
      >
        {shared === undefined ? null : (
          <>
            {shared}
            <span className={CSS.arrow} aria-hidden="true">→</span>
          </>
        )}
        {phases.map((phase, index) => (
          <span key={`${index}:${phase.provider}/${phase.served}`} className={CSS.served}>
            {index > 0 ? <span className={CSS.arrow} aria-hidden="true"> → </span> : null}
            {shared === undefined ? `${phase.requested} → ` : ''}
            {phase.served}
            {/* 只有连续用过多次才标次数：×1 没有额外信息 */}
            {phase.count > 1 || single ? <span className={CSS.count}> ×{phase.count}</span> : null}
          </span>
        ))}
        {/* 性能指标跟在模型链后面；只有前面确实有内容时才加分隔符 */}
        {metrics.map((part, index) => (
          <span key={part} className={CSS.metric}>
            {index === 0 && phases.length === 0 ? null : (
              <span className={CSS.sep} aria-hidden="true">·</span>
            )}
            {part}
          </span>
        ))}
      </span>
      {overflowing || expanded ? (
        <button
          type="button"
          className={CSS.toggle}
          title={expanded ? '收起成一行' : '展开显示全部'}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      ) : null}
    </div>
  )
}
