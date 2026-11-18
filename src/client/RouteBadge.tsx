/**
 * 徽标组件：本轮被路由到的模型一览。
 *
 * 挂在 `conversation.chat.turnTail`（每轮动作行之前）。没有观察值就返回 null，
 * 所以显式模型的轮次、以及不写 replayState 的 provider 完全看不到它。
 *
 * 展示规则：
 * - 本轮只有一个被路由到的模型 → `请求模型 → 实际模型`
 * - 本轮换过多个模型 → 依次列出，每个后面标调用次数（`×N`，为 1 时省略）
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
import { ROUTE_KIND, type RouteEntry, type TurnRoute } from './route.ts'

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

function readEntries(turn: TurnLike | undefined): readonly RouteEntry[] {
  const value = turn?.data?.get(ROUTE_KIND)
  if (typeof value !== 'object' || value === null) return []
  const entries = (value as Partial<TurnRoute>).entries
  if (!Array.isArray(entries)) return []
  return entries.filter(
    (entry): entry is RouteEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as RouteEntry).served === 'string' &&
      (entry as RouteEntry).served !== '',
  )
}

/** 悬停提示：逐个模型列出请求方与实际服务方。 */
function tooltip(entries: readonly RouteEntry[]): string {
  return entries
    .map((entry) => `${entry.provider}/${entry.requested} → ${entry.served} ×${entry.count}`)
    .join('\n')
}

export function RouteBadge({ turn }: RouteBadgeProps): React.JSX.Element | null {
  useEffect(() => {
    ensureStyles()
  }, [])

  const entries = readEntries(turn as TurnLike | undefined)
  if (entries.length === 0) return null

  // 请求模型全一致时提到前面显示一次，避免每项重复；不一致就各自标注。
  const requested = new Set(entries.map((entry) => entry.requested))
  const shared = requested.size === 1 ? entries[0]!.requested : undefined

  return (
    <div className={CSS.root}>
      <span className={CSS.pill} title={tooltip(entries)}>
        {shared === undefined ? null : (
          <>
            {shared}
            <span className={CSS.arrow} aria-hidden="true">→</span>
          </>
        )}
        {entries.map((entry, index) => (
          <span key={`${entry.provider}/${entry.served}`} className={CSS.served}>
            {index > 0 ? <span className={CSS.sep}>, </span> : null}
            {shared === undefined ? `${entry.requested} → ` : ''}
            {entry.served}
            {/* 只在单项被换过多次时标注次数：×1 没有额外信息 */}
            {entry.count > 1 ? <span className={CSS.count}> ×{entry.count}</span> : null}
          </span>
        ))}
      </span>
    </div>
  )
}
