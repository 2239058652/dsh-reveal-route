/**
 * 徽标样式。
 *
 * 类名统一 `rvr-` 前缀避免撞车；颜色全部走 DSH 主题变量，每个都带兜底值，
 * 浅色/深色主题下都能读。
 *
 * 布局：纯文字信息栏，无边框无背景，按内容收缩宽度，内部两行。
 * 模型链行不折行，指标行随宽度自然换行。
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
  label: 'rvr-label',
  value: 'rvr-value',
  speed: 'rvr-speed',
  warn: 'rvr-warn',
  seg: 'rvr-seg',
  sep: 'rvr-sep',
} as const

const RULES = `
/* 纯文字信息栏：无边框、无背景，视觉上与正文用量行同级，不抢戏 */
.rvr-root {
  display: inline-flex; align-items: flex-start;
  max-width: 100%; min-width: 0;
}
.rvr-body {
  min-width: 0; display: flex; flex-direction: column; gap: 2px;
  padding: 1px 0;
  font-size: 11px; line-height: 1.7;
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
.rvr-arrow { color: var(--dsw-alias-label-caption, #8c8c8c); font-weight: 400; }
.rvr-served {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 500;
  color: var(--dsw-alias-state-success-primary, #22c55e);
}
.rvr-count {
  font-family: inherit; font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
/* 指标片段：标签弱化、数值加重，片段间用空白分隔 */
.rvr-seg {
  display: inline-block;
  white-space: nowrap;
}
.rvr-seg + .rvr-seg { margin-left: 12px; }
.rvr-label {
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
  margin-right: 3px;
}
.rvr-value {
  color: var(--dsw-alias-label-secondary, #5c5c5c);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
/* 速度类数值用主题蓝点出，字重保持中等避免整条蓝 */
.rvr-speed {
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
/* 异常状态（重试 / 中止 / 出错）用警示色，正常轮次不出现 */
.rvr-warn {
  color: var(--dsw-alias-state-warn-primary, #f59e0b);
  font-weight: 500;
}
/* 分隔点隐藏：间距由 .rvr-seg 的 margin 提供 */
.rvr-sep { display: none; }
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
