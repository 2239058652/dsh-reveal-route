/**
 * 徽标样式。
 *
 * 类名统一 `rvr-` 前缀避免撞车；颜色全部走 DSH 主题变量，每个都带兜底值，
 * 浅色/深色主题下都能读。
 *
 * 布局：整块**按内容收缩宽度**（不是拉满），内部再分多行。
 * 折叠态每行都强制单行并用省略号截断；展开态允许行内换行。
 */

const STYLE_ID = 'dsh-reveal-route-styles'

export const CSS = {
  root: 'rvr-root',
  body: 'rvr-body',
  line: 'rvr-line',
  chain: 'rvr-line-chain',
  arrow: 'rvr-arrow',
  served: 'rvr-served',
  count: 'rvr-count',
  part: 'rvr-part',
  sep: 'rvr-sep',
} as const

const RULES = `
/* 容器：按内容收缩，不拉满整行 */
.rvr-root {
  display: inline-flex; align-items: flex-start; gap: 6px;
  max-width: 100%; min-width: 0;
}
.rvr-body {
  min-width: 0; display: flex; flex-direction: column; gap: 2px;
  padding: 3px 8px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e5e5);
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08));
  font-size: 11px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #5c5c5c);
}
/*
 * 行：默认允许自然折行。
 * 模型链那一行要保持一条链不断开（nowrap），指标行则应随宽度自动换行。
 */
.rvr-line {
  min-width: 0;
  white-space: normal; overflow-wrap: anywhere;
}
/* 模型链专用：不允许折行，放不下就省略 */
.rvr-line-chain {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
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
.rvr-part {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
  /* 片段之间不拆开：「生成 161 tok/s」整体作为一个不可分割单元 */
  display: inline-block;
  white-space: nowrap;
}
.rvr-sep { margin: 0 4px; opacity: 0.6; }
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
