/**
 * 徽标样式。
 *
 * 类名统一 `rvr-` 前缀避免撞车；颜色全部走 DSH 主题变量，每个都带兜底值，
 * 浅色/深色主题下都能读。
 */

const STYLE_ID = 'dsh-reveal-route-styles'

export const CSS = {
  root: 'rvr-root',
  pill: 'rvr-pill',
  arrow: 'rvr-arrow',
  served: 'rvr-served',
} as const

const RULES = `
.rvr-root { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.rvr-pill {
  display: inline-flex; align-items: baseline; gap: 5px;
  padding: 2px 8px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e5e5);
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08));
  font-size: 11px; line-height: 1.5; white-space: nowrap;
  max-width: 420px; overflow: hidden; text-overflow: ellipsis;
  color: var(--dsw-alias-label-secondary, #5c5c5c);
}
.rvr-arrow { color: var(--dsw-alias-label-tertiary, #8c8c8c); }
.rvr-served {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  color: var(--dsw-alias-state-success-primary, #22c55e);
  overflow: hidden; text-overflow: ellipsis;
}
`

let injected = false

/**
 * 注入一次样式；重复调用无副作用。
 *
 * 已存在同名 `<style>` 时重写内容而不是直接返回：插件热更新后模块会重新求值，
 * 但页面里的旧元素还在，直接返回会让改过的 CSS 不生效。
 */
export function ensureStyles(): void {
  if (injected) return
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) {
    if (existing.textContent !== RULES) existing.textContent = RULES
    injected = true
    return
  }
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = RULES
  document.head.appendChild(element)
  injected = true
}
