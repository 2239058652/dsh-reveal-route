/**
 * 徽标组件：本轮模型使用的变化过程。
 *
 * 挂在 `conversation.chat.turnTail`（每轮动作行之前）。没有观察值就返回 null，
 * 所以显式模型的轮次、以及不写 replayState 的 provider 完全看不到它。
 *
 * 展示规则（按调用顺序，相邻同模型合并）：
 * - 全程同一个模型   → `auto → glm-5.3-flash ×3`
 * - 中途换过模型     → `tierflow_pro → DeepSeek-V4.1-Flash → Qwen3.8-Flash ×2`
 * - 换回原模型       → `A → B ×1 → A ×1`（不合并，变回原模型本身是关键信息）
 *
 * 符号用 `→` 而不是 `,`：它表达的就是「从哪个模型变到哪个模型」。
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
import { useEffect, useState } from 'react'
import { CSS, ensureStyles } from './styles.ts'
import { ROUTE_KIND, type RoutePhase, type TurnRoute } from './route.ts'

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

/**
 * 最多直接画几段。
 *
 * 阶段一多，整条链在窄屏上会被裁掉一半、或者把每个模型名压成省略号
 * （`DeepSeek-V…`），反而读不出内容。超过就只画前几段 + `+N`，
 * 完整链条放悬停提示里。
 */
const MAX_VISIBLE_PHASES = 3

function readPhases(turn: TurnLike | undefined): readonly RoutePhase[] {
  const value = turn?.data?.get(ROUTE_KIND)
  if (typeof value !== 'object' || value === null) return []
  const phases = (value as Partial<TurnRoute>).phases
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

export function RouteBadge({ turn }: RouteBadgeProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    ensureStyles()
  }, [])

  const phases = readPhases(turn as TurnLike | undefined)
  if (phases.length === 0) return null

  // 请求模型全程一致时只写一次，避免每段重复；不一致就各段自带。
  const requested = new Set(phases.map((phase) => phase.requested))
  const shared = requested.size === 1 ? phases[0]!.requested : undefined
  // 全程同一个模型时不必画箭头链条，`×N` 已经说清次数。
  const single = phases.length === 1
  const truncated = phases.length > MAX_VISIBLE_PHASES
  const shown = expanded || !truncated ? phases : phases.slice(0, MAX_VISIBLE_PHASES)
  const hidden = phases.length - shown.length

  const renderPhase = (phase: RoutePhase, index: number): React.JSX.Element => (
    <span key={`${index}:${phase.provider}/${phase.served}`} className={CSS.served}>
      {index > 0 ? <span className={CSS.arrow} aria-hidden="true"> → </span> : null}
      {shared === undefined ? `${phase.requested} → ` : ''}
      {phase.served}
      {/* 只有连续用过多次才标次数：×1 没有额外信息 */}
      {phase.count > 1 || single ? <span className={CSS.count}> ×{phase.count}</span> : null}
    </span>
  )

  // 折叠态：一行 pill + 展开按钮。
  if (!expanded) {
    return (
      <div className={CSS.root}>
        <span className={CSS.pill} title={tooltip(phases)}>
          {shared === undefined ? null : (
            <>
              {shared}
              <span className={CSS.arrow} aria-hidden="true">→</span>
            </>
          )}
          {shown.map(renderPhase)}
          {hidden === 0 ? null : <span className={CSS.more}> +{hidden}</span>}
        </span>
        {truncated ? (
          <button
            type="button"
            className={CSS.toggle}
            title="展开完整变化过程"
            aria-expanded={false}
            onClick={() => setExpanded(true)}
          >
            展开
          </button>
        ) : null}
      </div>
    )
  }

  // 展开态：逐段一行列出，便于看清每一步。
  return (
    <div className={CSS.panel}>
      <div className={CSS.panelHead}>
        <span className={CSS.panelTitle}>
          {shared === undefined ? '模型变化过程' : `${shared} 的变化过程`}
        </span>
        <button
          type="button"
          className={CSS.toggle}
          title="收起"
          aria-expanded={true}
          onClick={() => setExpanded(false)}
        >
          收起
        </button>
      </div>
      <ol className={CSS.list}>
        {phases.map((phase, index) => (
          <li key={`${index}:${phase.provider}/${phase.served}`} className={CSS.listItem}>
            <span className={CSS.listIndex}>{index + 1}</span>
            <span className={CSS.served}>{phase.served}</span>
            {shared === undefined ? <span className={CSS.listMeta}>{phase.requested}</span> : null}
            <span className={CSS.count}>×{phase.count}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
