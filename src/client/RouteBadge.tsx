/**
 * 徽标组件：`auto → glm-5.3-flash`。
 *
 * 挂在 `conversation.chat.turnTail`（每轮动作行之前）。没有观察值就返回 null，
 * 所以显式模型的轮次、以及不写 replayState 的 provider 完全看不到它。
 *
 * ## 为什么直接读 `turn.data`
 *
 * `TurnLocation.data` 是 `ConversationLocationDataStore`，按 key 读本轮的业务值。
 * 本插件自己的 Definition 用 `buildLocationData` 把观察值发布到这个 key 上，
 * 这里是同一条链路的下游 —— 不做任何跨插件读取。
 *
 * 类型上不依赖 `ConversationTurnDataMap` 的声明合并（那是本包之外的模块，
 * 合并是否生效取决于宿主包的导出形态），改用最小结构契约：
 * 越界访问不可能，字段缺失按「无数据」处理。
 *
 * @module dsh-reveal-route/RouteBadge
 */

import type * as React from 'react'
import { useEffect } from 'react'
import { CSS, ensureStyles } from './styles.ts'
import { ROUTE_KIND, type RouteObservation } from './route.ts'

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

function readObservation(turn: TurnLike | undefined): RouteObservation | undefined {
  const value = turn?.data?.get(ROUTE_KIND)
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Partial<RouteObservation>
  if (typeof candidate.served !== 'string' || candidate.served === '') return undefined
  return candidate as RouteObservation
}

export function RouteBadge({ turn }: RouteBadgeProps): React.JSX.Element | null {
  useEffect(() => {
    ensureStyles()
  }, [])

  const observation = readObservation(turn as TurnLike | undefined)
  if (observation === undefined) return null

  const { requested, served, provider } = observation
  const title = `请求 ${provider}/${requested} · 上游实际服务 ${served}`

  return (
    <div className={CSS.root}>
      <span className={CSS.pill} title={title}>
        {requested}
        <span className={CSS.arrow} aria-hidden="true">→</span>
        <span className={CSS.served}>{served}</span>
      </span>
    </div>
  )
}
