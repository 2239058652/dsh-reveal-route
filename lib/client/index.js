window.__ModuleLoader__.load({
  id: "dsh-reveal-route",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
// src/client/styles.ts
/**
* 徽标样式。
*
* 类名统一 `rvr-` 前缀避免撞车；颜色全部走 DSH 主题变量，每个都带兜底值，
* 浅色/深色主题下都能读。
*
* 布局：整块**按内容收缩宽度**（不是拉满），内部再分多行。
* 折叠态每行都强制单行并用省略号截断；展开态允许行内换行。
*/
const STYLE_ID = "dsh-reveal-route-styles";
const CSS = {
	root: "rvr-root",
	body: "rvr-body",
	line: "rvr-line",
	chain: "rvr-line-chain",
	arrow: "rvr-arrow",
	served: "rvr-served",
	count: "rvr-count",
	label: "rvr-label",
	value: "rvr-value",
	speed: "rvr-speed",
	warn: "rvr-warn",
	seg: "rvr-seg",
	sep: "rvr-sep"
};
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
.rvr-arrow { color: var(--dsw-alias-label-caption, #8c8c8c); }
.rvr-served {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  color: var(--dsw-alias-state-success-primary, #22c55e);
}
.rvr-count {
  font-family: inherit; font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
/* 指标片段：标签弱化、数值加重 */
.rvr-seg {
  /* 片段之间不拆开：「生成 161 tok/s」整体作为一个不可分割单元 */
  display: inline-block;
  white-space: nowrap;
}
.rvr-label {
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
.rvr-value {
  color: var(--dsw-alias-label-secondary, #5c5c5c);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
/* 速度类数值用主题蓝强调，和用量类区分开 */
.rvr-speed {
  color: var(--dsw-alias-state-business-primary, #4d6bfe);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
/* 异常状态（重试 / 中止 / 出错）用警示色，正常轮次不出现 */
.rvr-warn {
  color: var(--dsw-alias-state-warn-primary, #f59e0b);
  font-weight: 600;
}
.rvr-sep { margin: 0 5px; opacity: 0.45; }
`;
let injected = false;
/**
* 注入一次样式；重复调用无副作用。
*
* 已存在同名 `<style>` 时重写内容而不是直接返回：插件热更新后模块会重新求值，
* 但页面里的旧元素还在，直接返回会让改过的 CSS 不生效。
*/
function ensureStyles() {
	if (injected) return;
	if (typeof document === "undefined") return;
	const existing = document.getElementById(STYLE_ID);
	if (existing !== null) {
		if (existing.textContent !== RULES) existing.textContent = RULES;
		injected = true;
		return;
	}
	const element = document.createElement("style");
	element.id = STYLE_ID;
	element.textContent = RULES;
	document.head.appendChild(element);
	injected = true;
}
// src/client/route.ts
/**
* 从 `assistant/message` 事件里读出上游实际服务的模型。
*
* ## 数据从哪来
*
* `assistant/message` 事件的 `data.message.source` 是 `ModelMessageSource`，
* 它带 `replayState`（pi-ai 适配器写的无损回放状态）。结构为：
*
* ```
* replayState.response = {
*   kind: 'pi-ai', version: 2,
*   model: <请求时传的 model id>,
*   responseModel?: <上游响应里回报的 model>,   // 只有和请求 id 不同时才有
*   ...
* }
* ```
*
* `responseModel` 由 pi-ai 的 openai-completions 适配器在流式 chunk 上写入，
* 条件是 `chunk.model` 是字符串、非空、且 `!== model.id`（见 pi-ai
* `dist/api/openai-completions.js` 的 `output.responseModel ||= chunk.model`）。
*
* 所以：**有 responseModel 就说明上游改写了路由**；显式模型（请求 id 与响应
* 一致）不会产生这个字段 —— 那正是我们不想显示的情况。
*
* @module dsh-reveal-route/route
*/
/**
* Definition kind，同时是 Turn 数据的 key。
*
* 引擎强制两者相等：`buildLocationData` 返回的 `key` 与 Definition 的 `kind`
* 不一致会直接抛错（见 ui-conversation 的 `buildLocationData` 校验），
* 所以这里只维护一个常量。
*/
const ROUTE_KIND = "reveal-route";
/** 只读我们要的那几层，避免为一次展示引入整包类型依赖。 */
function readRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function readString(source, key) {
	const value = source[key];
	return typeof value === "string" && value !== "" ? value : void 0;
}
/**
* 从一个 assistant/message 事件中提取路由观察。
*
* @param event - `assistant/message` 事件（形状见 dsh-session 的事件表）
* @returns 上游改写过路由时的观察值；未改写、字段缺失、或结构不认识时返回 undefined
*/
function readRoute(event) {
	const envelope = readRecord$1(event);
	if (envelope === void 0) return void 0;
	if (envelope["type"] !== "assistant/message") return void 0;
	const data = readRecord$1(envelope["data"]);
	if (data === void 0) return void 0;
	const message = readRecord$1(data["message"]);
	if (message === void 0) return void 0;
	const source = readRecord$1(message["source"]);
	if (source === void 0) return void 0;
	const replay = readRecord$1(source["replayState"]);
	if (replay === void 0) return void 0;
	const response = readRecord$1(replay["response"]);
	if (response === void 0) return void 0;
	if (response["kind"] !== "pi-ai") return void 0;
	const served = readString(response, "responseModel");
	if (served === void 0) return void 0;
	const requested = readString(response, "model") ?? readString(source, "model");
	if (requested === void 0) return void 0;
	if (served === requested) return void 0;
	const provider = readString(source, "provider");
	if (provider === void 0) return void 0;
	const turn = typeof data["turn"] === "number" ? data["turn"] : void 0;
	if (turn === void 0) return void 0;
	return {
		requested,
		served,
		provider,
		turn
	};
}
/**
* 把一次新的路由观察并进本轮的变化序列。
*
* 同一轮内可能发生多次路由改写（每次工具调用都是一次新请求，上游可能换模型）。
* 这里维护的是**按调用顺序的阶段序列**，相邻同一个模型合并计数：
*
* ```
* glm, glm, deepseek, glm  →  glm×2 → deepseek×1 → glm×1
* ```
*
* 注意末尾那段 `glm×1` 不会被并回第一段 —— 中间换过模型就说明路由真的变了，
* 合并会把「变回原模型」这个事实抹掉。
*
* @param previous - 本轮已有的累计值，尚无则为 undefined
* @param observation - 新观察到的一次改写
* @returns 新的累计值；总是返回新对象（调用方靠引用判断变化）
*/
function accumulateRoute(previous, observation) {
	const phases = previous?.phases ?? [];
	const last = phases.at(-1);
	if (last !== void 0 && last.served === observation.served && last.provider === observation.provider) return {
		turn: observation.turn,
		phases: [...phases.slice(0, -1), {
			...last,
			count: last.count + 1
		}]
	};
	return {
		turn: observation.turn,
		phases: [...phases, {
			requested: observation.requested,
			served: observation.served,
			provider: observation.provider,
			count: 1
		}]
	};
}
// src/client/RouteBadge.tsx
function readReveal(turn) {
	const value = turn?.data?.get(ROUTE_KIND);
	if (typeof value !== "object" || value === null) return void 0;
	return value;
}
function readPhases(turn) {
	const phases = readReveal(turn)?.route?.phases;
	if (!Array.isArray(phases)) return [];
	return phases.filter((phase) => typeof phase === "object" && phase !== null && typeof phase.served === "string" && phase.served !== "");
}
/** 悬停提示：逐段列出请求方、实际服务方与这一段连续调用了几次。 */
function tooltip(phases) {
	return phases.map((phase, index) => `${index + 1}. ${phase.provider}/${phase.requested} → ${phase.served} ×${phase.count}`).join("\n");
}
function formatMs(value) {
	if (value === null) return null;
	const seconds = value / 1e3;
	const roundedSeconds = Math.round(seconds);
	if (roundedSeconds < 60) return value < 1e3 ? `${Math.round(value)}ms` : `${seconds.toFixed(1)}s`;
	if (roundedSeconds < 3600) return `${Math.floor(roundedSeconds / 60)}m${String(roundedSeconds % 60).padStart(2, "0")}s`;
	return `${Math.floor(roundedSeconds / 3600)}h${String(Math.floor(roundedSeconds % 3600 / 60)).padStart(2, "0")}m`;
}
/**
* 速度取整显示。
*
* 小于 1 的速度取整会变成 `0 tok/s`，那是无意义的信息 —— 返回 null 让调用方跳过。
*/
function formatSpeed(value) {
	if (value === null) return null;
	const rounded = Math.round(value);
	return rounded < 1 ? null : String(rounded);
}
/**
* 数字缩写：1234 → 1.2k，1234567 → 1.2M。
*
* token 数动辄上万，全写出来会挤爆一行。
*/
function formatCount(value) {
	if (value === null) return null;
	if (value < 1e3) return String(Math.round(value));
	if (value < 1e6) {
		const k = value / 1e3;
		const text = k < 10 ? k.toFixed(1) : String(Math.round(k));
		return text === "1000" ? `${(value / 1e6).toFixed(1)}M` : `${text}k`;
	}
	return `${(value / 1e6).toFixed(1)}M`;
}
/**
* 速度类指标。
*
* 用语尽量不用行话：`首字` 代替 TTFT；`生成` / `整体` 区分两个速度口径 ——
* 生成只看真正出字的时间，整体把等待首字和工具执行也算进去。
*/
function speedParts(metrics) {
	if (metrics === void 0) return [];
	const parts = [];
	const ttft = formatMs(metrics.avgTtftMs);
	if (ttft !== null) parts.push({
		label: "首字",
		value: ttft,
		tone: "speed"
	});
	const decode = formatSpeed(metrics.decodeSpeed);
	if (decode !== null) parts.push({
		label: "生成",
		value: `${decode} tok/s`,
		tone: "speed"
	});
	const e2e = formatSpeed(metrics.e2eSpeed);
	if (e2e !== null) parts.push({
		label: "整体",
		value: `${e2e} tok/s`,
		tone: "speed"
	});
	const elapsed = formatMs(metrics.elapsedMs);
	if (elapsed !== null) parts.push({
		label: "耗时",
		value: elapsed,
		tone: "speed"
	});
	return parts;
}
/**
* 用量与异常。
*
* 只显示有值的项 —— 工具 0 次、重试 0 次于读者无意义，直接省略。
*/
function usageParts(metrics) {
	if (metrics === void 0) return [];
	const parts = [];
	const input = formatCount(metrics.inputTokens);
	if (input !== null) parts.push({
		label: "入",
		value: input,
		tone: "value"
	});
	const cache = formatCount(metrics.cacheReadTokens);
	if (cache !== null) parts.push({
		label: "缓存",
		value: cache,
		tone: "value"
	});
	const output = formatCount(metrics.outputTokens);
	if (output !== null) parts.push({
		label: "出",
		value: output,
		tone: "value"
	});
	if (metrics.steps > 0) parts.push({
		label: "",
		value: `${metrics.steps} 步`,
		tone: "value"
	});
	if (metrics.toolCalls !== null) parts.push({
		label: "工具",
		value: String(metrics.toolCalls),
		tone: "value"
	});
	if (metrics.retries !== null) parts.push({
		label: "重试",
		value: String(metrics.retries),
		tone: "warn"
	});
	if (metrics.endReason !== null && metrics.endReason !== "completed") {
		const text = metrics.endReason === "aborted" ? "已中止" : metrics.endReason === "error" ? "出错" : metrics.endReason;
		parts.push({
			label: "",
			value: text,
			tone: "warn"
		});
	}
	return parts;
}
/** 渲染一个指标片段：标签弱、数值按 tone 着色。 */
function renderPart(part, index) {
	const toneClass = part.tone === "speed" ? CSS.speed : part.tone === "warn" ? CSS.warn : CSS.value;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: CSS.seg,
		children: [
			index > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: CSS.sep,
				"aria-hidden": "true",
				children: "·"
			}) : null,
			part.label === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: CSS.label,
				children: [part.label, " "]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: toneClass,
				children: part.value
			})
		]
	}, `${index}:${part.label}:${part.value}`);
}
function RouteBadge({ turn }) {
	const reveal = readReveal(turn);
	const phases = readPhases(turn);
	const details = [...speedParts(reveal?.metrics), ...usageParts(reveal?.metrics)];
	(0, react.useEffect)(() => {
		ensureStyles();
	}, []);
	if (phases.length === 0 && details.length === 0) return null;
	const shared = new Set(phases.map((phase) => phase.requested)).size === 1 ? phases[0].requested : void 0;
	const single = phases.length === 1;
	const tip = tooltip(phases);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: CSS.root,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: CSS.body,
			children: [phases.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${CSS.line} ${CSS.chain}`,
				title: tip === "" ? void 0 : tip,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CSS.served,
					children: shared === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [shared, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CSS.arrow,
						"aria-hidden": "true",
						children: " → "
					})] })
				}), phases.map((phase, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: CSS.served,
					children: [
						index > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CSS.arrow,
							"aria-hidden": "true",
							children: " → "
						}) : null,
						shared === void 0 ? `${phase.requested} → ` : "",
						phase.served,
						phase.count > 1 || single ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: CSS.count,
							children: [" ×", phase.count]
						}) : null
					]
				}, `${index}:${phase.provider}/${phase.served}`))]
			}), details.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: CSS.line,
				children: details.map(renderPart)
			})]
		})
	});
}
// src/client/metrics.ts
function readRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function readNumber(source, key) {
	const value = source?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
/**
* `step/start` 时间表的键。
*
* `step` 号每轮从 1 重新开始，不是全局递增，所以键必须带轮次号，
* 否则后一轮会覆盖前一轮的时间表。
*/
function stepKey(turn, step) {
	return `${turn}:${step}`;
}
/**
* 从 `step/start` 事件里读出 (轮:步) → 开始时间。
*
* @param event - `step/start` 事件
* @returns 键与时间；结构不认识时返回 null
*/
function readStepStart(event) {
	const envelope = readRecord(event);
	if (envelope?.["type"] !== "step/start") return null;
	const data = readRecord(envelope["data"]);
	const turn = readNumber(data, "turn");
	const step = readNumber(data, "step");
	const time = readNumber(envelope, "time");
	if (turn === null || step === null || time === null) return null;
	return {
		key: stepKey(turn, step),
		time
	};
}
/**
* 从 `assistant/message` 事件里取出这一次调用的时间点。
*
* 首包时间取 `data.stream` 里第一个带 `time` 的条目 —— 等价于 DSH 自己的
* “first non-empty text/reasoning/tool delta”（空 delta 不产生 stream 条目）。
*
* @param event - `assistant/message` 事件
* @param stepStarts - `step/start` 时间表，键为 `stepKey(turn, step)`
* @returns 一个样本；事件结构不认识时返回 null
*/
function readStepSample(event, stepStarts) {
	const envelope = readRecord(event);
	if (envelope?.["type"] !== "assistant/message") return null;
	const data = readRecord(envelope["data"]);
	if (data === void 0) return null;
	const turn = readNumber(data, "turn");
	const step = readNumber(data, "step");
	if (turn === null || step === null) return null;
	const endTime = readNumber(envelope, "time");
	if (endTime === null) return null;
	const stream = data["stream"];
	let firstTokenTime = null;
	if (Array.isArray(stream)) for (const entry of stream) {
		const time = readNumber(readRecord(entry), "time");
		if (time !== null) {
			firstTokenTime = time;
			break;
		}
	}
	const usage = readRecord(data["usage"]);
	return {
		turn,
		startTime: stepStarts.get(stepKey(turn, step)) ?? null,
		firstTokenTime,
		endTime,
		outputTokens: readNumber(usage, "outputTokens"),
		inputTokens: readNumber(usage, "inputTokens"),
		cacheReadTokens: readNumber(usage, "cacheReadTokens")
	};
}
/**
* 从单个事件里读出与速度无关的计数增量。
*
* 覆盖 `tool/call`、`llm/retry`、`turn/end` 三类 —— 它们都不带 usage，
* 但会影响「这一轮到底顺不顺利」的判断。
*
* @param event - 任意原始事件
* @returns 计数增量；与本题无关时各字段为 0 / null
*/
function readCounters(event) {
	const envelope = readRecord(event);
	const type = envelope?.["type"];
	if (type === "tool/call") return {
		toolCall: 1,
		retry: 0,
		endReason: null
	};
	if (type === "llm/retry") return {
		toolCall: 0,
		retry: 1,
		endReason: null
	};
	if (type === "turn/end") {
		const kind = readRecord(readRecord(envelope?.["data"])?.["reason"])?.["kind"];
		return {
			toolCall: 0,
			retry: 0,
			endReason: typeof kind === "string" ? kind : null
		};
	}
	return {
		toolCall: 0,
		retry: 0,
		endReason: null
	};
}
/** 新建一个空累加器。 */
function createAccumulator(turn) {
	return {
		turn,
		steps: 0,
		ttftSum: 0,
		ttftCount: 0,
		decodeMsSum: 0,
		decodeTokens: 0,
		outputSum: 0,
		hasOutput: false,
		inputSum: 0,
		hasInput: false,
		cacheSum: 0,
		hasCache: false,
		toolCalls: 0,
		retries: 0,
		endReason: null,
		firstStart: null,
		lastEnd: null
	};
}
/**
* 把一次 `assistant/message` 样本并入累加器。
*
* @param acc - 现有累加器，无则传 undefined
* @param sample - 新的样本
*/
function accumulateMetrics(acc, sample) {
	const base = acc === void 0 || acc.turn !== sample.turn ? createAccumulator(sample.turn) : acc;
	const next = { ...base };
	next.steps = base.steps + 1;
	if (sample.startTime !== null && sample.firstTokenTime !== null) {
		next.ttftSum = base.ttftSum + Math.max(0, sample.firstTokenTime - sample.startTime);
		next.ttftCount = base.ttftCount + 1;
	}
	if (sample.firstTokenTime !== null) {
		next.decodeMsSum = base.decodeMsSum + Math.max(0, sample.endTime - sample.firstTokenTime);
		if (sample.outputTokens !== null) next.decodeTokens = base.decodeTokens + sample.outputTokens;
	}
	if (sample.outputTokens !== null) {
		next.outputSum = base.outputSum + sample.outputTokens;
		next.hasOutput = true;
	}
	if (sample.inputTokens !== null) {
		next.inputSum = base.inputSum + sample.inputTokens;
		next.hasInput = true;
	}
	if (sample.cacheReadTokens !== null) {
		next.cacheSum = base.cacheSum + sample.cacheReadTokens;
		next.hasCache = true;
	}
	if (sample.startTime !== null) next.firstStart = base.firstStart === null ? sample.startTime : Math.min(base.firstStart, sample.startTime);
	next.lastEnd = base.lastEnd === null ? sample.endTime : Math.max(base.lastEnd, sample.endTime);
	return next;
}
/**
* 把计数类事件并入累加器（工具调用、重试、结束原因）。
*
* 这些事件不带 usage，但同样属于「这一轮发生了什么」，所以要单独累加。
*
* @param acc - 现有累加器，无则传 undefined
* @param counters - `readCounters` 的结果
* @param turn - 所属轮次（用于首次创建）
*/
function accumulateCounters(acc, counters, turn) {
	const base = acc === void 0 || acc.turn !== turn ? createAccumulator(turn) : acc;
	if (counters.toolCall === 0 && counters.retry === 0 && counters.endReason === null) return base;
	return {
		...base,
		toolCalls: base.toolCalls + counters.toolCall,
		retries: base.retries + counters.retry,
		endReason: counters.endReason ?? base.endReason
	};
}
/**
* 从累加器算出对外发布的指标。
*
* @param acc - 累加器
*/
function finalizeMetrics(acc) {
	const elapsedMs = acc.firstStart === null || acc.lastEnd === null ? null : Math.max(0, acc.lastEnd - acc.firstStart);
	return {
		turn: acc.turn,
		steps: acc.steps,
		avgTtftMs: acc.ttftCount === 0 ? null : acc.ttftSum / acc.ttftCount,
		decodeSpeed: acc.decodeMsSum > 0 && acc.decodeTokens > 0 ? acc.decodeTokens / (acc.decodeMsSum / 1e3) : null,
		e2eSpeed: elapsedMs !== null && elapsedMs > 0 && acc.hasOutput ? acc.outputSum / (elapsedMs / 1e3) : null,
		elapsedMs,
		outputTokens: acc.hasOutput ? acc.outputSum : null,
		inputTokens: acc.hasInput ? acc.inputSum : null,
		cacheReadTokens: acc.hasCache ? acc.cacheSum : null,
		toolCalls: acc.toolCalls > 0 ? acc.toolCalls : null,
		retries: acc.retries > 0 ? acc.retries : null,
		endReason: acc.endReason
	};
}
// src/client/register.ts
/**
* 注册 Definition：把每轮的上游路由与性能指标发布成本轮的业务数据。
*
* 走的是 ui-conversation 的公开扩展点 `ctx.uiConversation.events.register(...)`，
* 和 ui-chat 自己注册 15 个 Definition 用的是同一个入口 —— 不 patch、不猴补、
* 不和任何别的插件抢事件（没有 `exclusive`，别的 Definition 照旧收到同一事件）。
*
* 发布通道是 `buildLocationData`：引擎按 step → turn 两个 scope 依次回调，
* 我们把值挂到 Turn 上，key 必须是 Definition 的 `kind`（引擎强制校验）。
*
* ## 两个事件都要订阅
*
* - `step/start`：每步的开始时间（算 TTFT 必需，`assistant/message` 里没有）
* - `assistant/message`：路由结果 + 首包/末包时间 + 输出 token
*
* `step` 号每轮从 1 重新开始，所以内部时间表按 `轮:步` 存键。
*
* ## 引擎的 state 契约
*
* `context.state` 就是上一次 `start`/`update` 的返回值，也就是**内部状态本身**。
* 发布给界面的值在 `buildLocationData` 里另算，两者不混。
*
* @module dsh-reveal-route/register
*/
/** 匹配阶段只判断事件形状，不需要真实时间表。 */
const EMPTY_STARTS = /* @__PURE__ */ new Map();
/** 从事件里读出轮次号；两个事件类型都带 `data.turn`。 */
function contextTurn(event) {
	const data = (typeof event === "object" && event !== null ? event : {})["data"];
	const turn = typeof data === "object" && data !== null ? data["turn"] : void 0;
	return typeof turn === "number" && Number.isFinite(turn) ? turn : 0;
}
/** 计数类事件统一按 `data.turn` 归轮；解析不出轮次就不匹配。 */
function toMatch(event) {
	const turn = contextTurn(event);
	return turn === 0 ? null : {
		id: String(turn),
		role: "start"
	};
}
/**
* 消费一个事件，推进内部状态。
*
* 引擎对返回值有硬性要求：`start()`/`update()` **不能返回 undefined**
* （见 ui-conversation 的 `requireState`，返回 undefined 会直接抛异常，
* 中断整个 Conversation 渲染）。所以这里宁可返回一个空状态，也不返回 null。
*
* @param state - 已有状态（首次为 undefined）
* @param event - 原始事件
* @param turnId - 该 Context 所属的轮次号，用于事件本身解析不出轮次时兜底
* @returns 新状态
*/
function advance(state, event, turnId) {
	const start = readStepStart(event);
	if (start !== null) {
		const turn = turnId;
		const stepStarts = new Map(state?.stepStarts ?? []);
		stepStarts.set(start.key, start.time);
		return {
			route: state?.route ?? {
				turn,
				phases: []
			},
			stepStarts,
			metrics: state?.metrics ?? createAccumulator(turn)
		};
	}
	const counters = readCounters(event);
	if (counters.toolCall > 0 || counters.retry > 0 || counters.endReason !== null) {
		const base = state ?? {
			route: {
				turn: turnId,
				phases: []
			},
			stepStarts: /* @__PURE__ */ new Map(),
			metrics: createAccumulator(turnId)
		};
		return {
			...base,
			metrics: accumulateCounters(base.metrics, counters, base.route.turn)
		};
	}
	const stepStarts = state?.stepStarts ?? /* @__PURE__ */ new Map();
	const sample = readStepSample(event, stepStarts);
	if (sample === null) return state ?? {
		route: {
			turn: turnId,
			phases: []
		},
		stepStarts,
		metrics: createAccumulator(turnId)
	};
	const observation = readRoute(event);
	return {
		route: observation === void 0 ? state?.route ?? {
			turn: sample.turn,
			phases: []
		} : accumulateRoute(state?.route, observation),
		stepStarts,
		metrics: accumulateMetrics(state?.metrics, sample)
	};
}
/**
* 定义本体。
*
* 一个 Turn 一个 Context（id = 轮次号）。同一轮内多次路由改写会**累计**成
* 按阶段排列的变化序列（相邻同模型合并计数），而不是互相覆盖。
*/
const definition = {
	kind: ROUTE_KIND,
	match: {
		"step/start": (event) => {
			const start = readStepStart(event);
			if (start === null) return null;
			return {
				id: start.key.slice(0, start.key.indexOf(":")),
				role: "start"
			};
		},
		"assistant/message": (event) => {
			const sample = readStepSample(event, EMPTY_STARTS);
			if (sample === null) return null;
			return {
				id: String(sample.turn),
				role: "start"
			};
		},
		"tool/call": (event) => toMatch(event),
		"llm/retry": (event) => toMatch(event),
		"turn/end": (event) => toMatch(event)
	},
	start: (_context, match) => advance(void 0, match.event, contextTurn(match.event)),
	update: (context, match) => advance(context.state, match.event, context.state?.route.turn ?? contextTurn(match.event)),
	buildLocationData: (context, scope, previous) => {
		if (scope !== "turn") return null;
		const state = context.state;
		if (state === void 0) return null;
		const metrics = finalizeMetrics(state.metrics);
		const value = {
			route: state.route,
			metrics
		};
		if (previous !== null && previous.turn === metrics.turn && previous.value === value) return previous;
		return {
			kind: "turn",
			turn: metrics.turn,
			key: ROUTE_KIND,
			value
		};
	}
};
/**
* 注册到 Conversation 事件表。
*
* @param events - `ctx.uiConversation.events`（插件的 `inject` 已保证它存在）
*/
function registerRouteDefinition(events) {
	events.register(definition);
}
// src/client/index.tsx
const name = "dsh-reveal-route-client";
/** `uiConversation` 与 ui-chat 一样在注入列表里，apply 时保证已就绪。 */
const inject = ["slots", "uiConversation"];
function apply(ctx) {
	const services = ctx;
	try {
		registerRouteDefinition(services.uiConversation.events);
	} catch (error) {
		console.error("[dsh-reveal-route] Definition 注册失败:", error);
	}
	try {
		services.slots.inject("conversation.chat.turnTail", () => services.slots.register({
			name: "conversation.chat.turnTail",
			id: ROUTE_KIND,
			order: 10
		}, RouteBadge));
	} catch (error) {
		console.error("[dsh-reveal-route] turnTail 徽标注册失败:", error);
	}
}
exports.apply = apply;
exports.inject = inject;
exports.name = name;

    return module.exports;
  }
});
