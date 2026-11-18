/**
 * 浏览器半身。
 *
 * 两件事：
 * 1. 注册 Definition —— 订阅 `assistant/message` 原始事件，把上游实际服务的模型
 *    发布成该轮的 Turn 数据（`uiConversation.events.register`，官方扩展点）；
 * 2. 注册渲染 —— 在 `conversation.chat.turnTail` 列表里加一个徽标，读上面那份
 *    数据，没有值就渲染 null。
 *
 * 不轮询、不发请求、不读会话文件：数据本来就在已经下发到浏览器的事件里。
 * 与 dsh-marvis-connect 之类的 provider 插件互不影响 —— 它挂在
 * `plugins.bundle.config` / `conversation.input.right`，这里挂消息流的尾部槽。
 *
 * @module dsh-reveal-route/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { RouteBadge } from './RouteBadge.tsx'
import { registerRouteDefinition, type EventsRegistry } from './register.ts'
import { ROUTE_KIND } from './route.ts'

export const name = 'dsh-reveal-route-client'

/** `uiConversation` 与 ui-chat 一样在注入列表里，apply 时保证已就绪。 */
export const inject = ['slots', 'uiConversation']

/** 只用到 slots 的两个方法。 */
interface SlotApi {
  inject: (slot: string, callback: () => unknown) => void
  register: (options: Record<string, unknown>, component: unknown) => () => void
}

interface ClientServices {
  slots: SlotApi
  uiConversation: { events: EventsRegistry }
}

export function apply(ctx: ClientContext): void {
  const services = ctx as unknown as ClientServices

  try {
    registerRouteDefinition(services.uiConversation.events)
  } catch (error: unknown) {
    console.error('[dsh-reveal-route] Definition 注册失败:', error)
  }

  try {
    // 每轮动作行之前的列表槽；order 取小值，排在官方动作行前面。
    services.slots.inject('conversation.chat.turnTail', () =>
      services.slots.register(
        {
          name: 'conversation.chat.turnTail',
          id: ROUTE_KIND,
          order: 10,
        },
        RouteBadge,
      ),
    )
  } catch (error: unknown) {
    console.error('[dsh-reveal-route] turnTail 徽标注册失败:', error)
  }
}
