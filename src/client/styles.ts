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
  sep: 'rvr-sep',
  count: 'rvr-count',
  more: 'rvr-more',
  toggle: 'rvr-toggle',
  panel: 'rvr-panel',
  panelHead: 'rvr-panel-head',
  panelTitle: 'rvr-panel-title',
  list: 'rvr-list',
  listItem: 'rvr-list-item',
  listIndex: 'rvr-list-index',
  listMeta: 'rvr-list-meta',
} as const

const RULES = `
.rvr-root { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.rvr-pill {
  display: inline-flex; align-items: baseline; gap: 2px;
  padding: 2px 8px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e5e5);
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08));
  font-size: 11px; line-height: 1.5; white-space: nowrap;
  max-width: 100%; overflow: hidden;
  color: var(--dsw-alias-label-secondary, #5c5c5c);
}
.rvr-arrow { color: var(--dsw-alias-label-tertiary, #8c8c8c); flex: none; }
.rvr-served {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  color: var(--dsw-alias-state-success-primary, #22c55e);
  /* 不允许被压缩：宁可整体溢出被裁，也不要每个名字各剩几个字母 */
  flex: none;
}
.rvr-sep { color: var(--dsw-alias-label-tertiary, #8c8c8c); font-weight: 400; }
.rvr-count {
  font-family: inherit; font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.rvr-more {
  flex: none; font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.rvr-toggle {
  flex: none; cursor: pointer;
  padding: 1px 6px; border-radius: 5px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e5e5);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #5c5c5c);
  font-size: 11px; line-height: 1.5; font-family: inherit;
}
.rvr-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.14)); }
.rvr-panel {
  box-sizing: border-box; max-width: 100%;
  padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e5e5);
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.06));
  font-size: 11px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #5c5c5c);
}
.rvr-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.rvr-panel-title { font-weight: 600; color: var(--dsw-alias-label-primary, #1f1f1f); }
.rvr-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.rvr-list-item { display: flex; align-items: baseline; gap: 6px; }
.rvr-list-index {
  flex: none; min-width: 14px; text-align: right;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
  font-variant-numeric: tabular-nums;
}
.rvr-list-meta { flex: none; color: var(--dsw-alias-label-tertiary, #8c8c8c); }
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
