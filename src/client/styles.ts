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
  pillExpanded: 'rvr-pill-expanded',
  arrow: 'rvr-arrow',
  served: 'rvr-served',
  count: 'rvr-count',
  toggle: 'rvr-toggle',
  metric: 'rvr-metric',
  sep: 'rvr-sep',
} as const

const RULES = `
/*
 * 容器占满可用宽度（换行要在这个宽度内进行），但胶囊本身**按内容收缩**：
 * flex-basis 取 auto + flex-grow 0，内容短就只有内容那么宽，不会拉满留白。
 * min-width: 0 让它在内容超长时能收缩到容器宽度以内并被截断。
 */
.rvr-root {
  display: flex; align-items: flex-start; gap: 6px;
  width: 100%; min-width: 0;
}
.rvr-pill {
  flex: 0 1 auto; min-width: 0;
  display: block;
  padding: 2px 8px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e5e5);
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08));
  font-size: 11px; line-height: 1.6;
  /* 折叠态：强制一行，超出裁掉 */
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--dsw-alias-label-secondary, #5c5c5c);
}
.rvr-pill[role="button"] { cursor: pointer; }
/* 展开态：允许换行，继续往后排 */
.rvr-pill-expanded {
  white-space: normal; overflow: visible; text-overflow: clip;
  overflow-wrap: anywhere;
}
.rvr-arrow { color: var(--dsw-alias-label-tertiary, #8c8c8c); }
.rvr-served {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  color: var(--dsw-alias-state-success-primary, #22c55e);
}
.rvr-count {
  font-family: inherit; font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.rvr-metric {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.rvr-sep { margin: 0 5px; opacity: 0.6; }
.rvr-toggle {
  flex: none; cursor: pointer; align-self: flex-start;
  padding: 1px 6px; border-radius: 5px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e5e5);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #5c5c5c);
  font-size: 11px; line-height: 1.6; font-family: inherit;
}
.rvr-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.14)); }
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
