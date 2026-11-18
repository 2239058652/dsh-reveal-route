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
*/
const STYLE_ID = "dsh-reveal-route-styles";
const CSS = {
	root: "rvr-root",
	pill: "rvr-pill",
	arrow: "rvr-arrow",
	served: "rvr-served",
	sep: "rvr-sep",
	count: "rvr-count"
};
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
.rvr-sep { color: var(--dsw-alias-label-tertiary, #8c8c8c); font-weight: 400; }
.rvr-count {
  font-family: inherit; font-weight: 400;
  color: var(--dsw-alias-label-tertiary, #8c8c8c);
}
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
function readRecord(value) {
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
	const envelope = readRecord(event);
	if (envelope === void 0) return void 0;
	if (envelope["type"] !== "assistant/message") return void 0;
	const data = readRecord(envelope["data"]);
	if (data === void 0) return void 0;
	const message = readRecord(data["message"]);
	if (message === void 0) return void 0;
	const source = readRecord(message["source"]);
	if (source === void 0) return void 0;
	const replay = readRecord(source["replayState"]);
	if (replay === void 0) return void 0;
	const response = readRecord(replay["response"]);
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
* 把一次新的路由观察并进本轮的累计表。
*
* 同一轮内可能发生多次路由改写（每次工具调用都是一次新请求，上游可能换模型），
* 只保留最后一个会丢掉前面的信息，所以这里按 `provider/served` 聚合并计次。
* 顺序保持首次出现顺序，便于界面稳定排列。
*
* @param previous - 本轮已有的累计值，尚无则为 undefined
* @param observation - 新观察到的一次改写
* @returns 新的累计值；计数变化时返回新对象，否则原样返回 previous
*/
function accumulateRoute(previous, observation) {
	const entries = previous?.entries ?? [];
	const index = entries.findIndex((entry) => entry.served === observation.served && entry.provider === observation.provider);
	if (index === -1) return {
		turn: observation.turn,
		entries: [...entries, {
			requested: observation.requested,
			served: observation.served,
			provider: observation.provider,
			count: 1
		}]
	};
	const current = entries[index];
	const next = entries.slice();
	next[index] = {
		...current,
		count: current.count + 1
	};
	return {
		turn: observation.turn,
		entries: next
	};
}
// src/client/RouteBadge.tsx
function readEntries(turn) {
	const value = turn?.data?.get(ROUTE_KIND);
	if (typeof value !== "object" || value === null) return [];
	const entries = value.entries;
	if (!Array.isArray(entries)) return [];
	return entries.filter((entry) => typeof entry === "object" && entry !== null && typeof entry.served === "string" && entry.served !== "");
}
/** 悬停提示：逐个模型列出请求方与实际服务方。 */
function tooltip(entries) {
	return entries.map((entry) => `${entry.provider}/${entry.requested} → ${entry.served} ×${entry.count}`).join("\n");
}
function RouteBadge({ turn }) {
	(0, react.useEffect)(() => {
		ensureStyles();
	}, []);
	const entries = readEntries(turn);
	if (entries.length === 0) return null;
	const total = entries.reduce((sum, entry) => sum + entry.count, 0);
	const shared = new Set(entries.map((entry) => entry.requested)).size === 1 ? entries[0].requested : void 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: CSS.root,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			className: CSS.pill,
			title: tooltip(entries),
			children: [shared === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [shared, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: CSS.arrow,
				"aria-hidden": "true",
				children: "→"
			})] }), entries.map((entry, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: CSS.served,
				children: [
					index > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CSS.sep,
						children: ", "
					}) : null,
					shared === void 0 ? `${entry.requested} → ` : "",
					entry.served,
					total > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: CSS.count,
						children: [" ×", entry.count]
					}) : null
				]
			}, `${entry.provider}/${entry.served}`))]
		})
	});
}
// src/client/register.ts
/**
* 注册 Definition：把每个 Turn 里观察到的上游路由累计成本轮的业务数据。
*
* 走的是 ui-conversation 的公开扩展点 `ctx.uiConversation.events.register(...)`，
* 和 ui-chat 自己注册 15 个 Definition 用的是同一个入口 —— 不 patch、不猴补、
* 不和任何别的插件抢事件（没有 `exclusive`，别的 Definition 照旧收到同一事件）。
*
* 发布通道是 `buildLocationData`：引擎按 step → turn 两个 scope 依次回调，
* 我们把值挂到 Turn 上，key 必须是 Definition 的 `kind`（引擎强制校验）。
*
* @module dsh-reveal-route/register
*/
/** 一个 Context 至少要有一次观察才会被创建；start 时必然有。 */
function firstRoute(event) {
	const observation = readRoute(event);
	if (observation === void 0) throw new Error("dsh-reveal-route: start requires a routable assistant/message");
	return accumulateRoute(void 0, observation);
}
/**
* 定义本体。
*
* 一个 Turn 一个 Context（id = 轮次号）。同一轮内多次路由改写会**累计**成
* 按 provider/served 归并的列表（带次数），而不是互相覆盖 —— 长任务里模型
* 被换成别的再换回来，也能看出每个模型各服务了几次。
*/
const definition = {
	kind: ROUTE_KIND,
	match: { "assistant/message": (event) => {
		const observation = readRoute(event);
		if (observation === void 0) return null;
		return {
			id: String(observation.turn),
			role: "start"
		};
	} },
	start: (_context, match) => firstRoute(match.event),
	update: (context, match) => {
		const observation = readRoute(match.event);
		return observation === void 0 ? context.state : accumulateRoute(context.state, observation);
	},
	buildLocationData: (context, scope, previous) => {
		if (scope !== "turn") return null;
		const state = context.state;
		if (state === void 0) return null;
		if (previous !== null && previous.turn === state.turn && previous.value === state) return previous;
		return {
			kind: "turn",
			turn: state.turn,
			key: ROUTE_KIND,
			value: state
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
