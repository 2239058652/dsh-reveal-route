/**
 * Host 半身：空壳。
 *
 * 本插件是纯客户端插件（只读浏览器里已有的 assistant/message 事件），
 * Host 侧没有任何逻辑；这个 entry 存在是因为 DSH 的 bundle patch
 * 机制要求每个插件至少挂一个 entry。
 *
 * @module dsh-reveal-route
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'reveal-route'

export function apply(ctx: Context): void {
  ctx.logger.debug('dsh-reveal-route: host shell loaded (client-only plugin)')
}
