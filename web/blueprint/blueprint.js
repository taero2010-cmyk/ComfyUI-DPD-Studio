// Comfy Blueprint: where a render is, and what every node does and why it's wired there.
// · The Blueprint tab (sidebar): the open workflow's nodes in running order, each with what it does, why it sits where it
//   does, what it takes from which node and its settings. While a prompt runs, the node working now glows green, finished
//   ones are ticked, and the steps (and a long job's chunks) count up. Click a node to jump to it on the canvas.
// · The "Comfy Blueprint" node: a small came from / now / next box to keep on the canvas. It is virtual: never sent to the
//   server, never part of a render.
// Notes for common nodes live in notes.json; any other node gets ComfyUI's own description and a "why" read from its wires.
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const TAB = "comfy-blueprint";
const GREEN = "#3fcf74";
const S = { graph: null, order: [], used: new Set(), done: new Set(), prev: null, now: null, busy: false, step: null, chunk: null, bars: {}, seen: {}, stepMax: null, last: null, error: false };
const views = new Set();
let NOTES = {};

// ---------------------------------------------------------------- the graph
const def = type => (LiteGraph.registered_node_types[type] || {}).nodeData || {};
const canvasNode = id => app.graph && app.graph.getNodeById(Number(id));
const pretty = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2").replace(/_/g, " ").trim();
function title(id) {
  const g = S.graph && S.graph[id];
  if (!g) return id == null ? "" : `Node ${id}`;
  const n = canvasNode(id), d = def(g.class_type);
  return (n && n.title) || (g._meta && g._meta.title) || d.display_name || pretty(g.class_type);
}
const links = g => Object.entries(g.inputs || {}).filter(([, v]) => Array.isArray(v) && v.length === 2 && typeof v[1] === "number");

// the order ComfyUI runs them in: anything a node needs runs first; ties by node number
function orderOf(g) {
  const ids = Object.keys(g), need = {}, users = {};
  ids.forEach(id => { need[id] = new Set(); users[id] = []; });
  ids.forEach(id => links(g[id]).forEach(([, v]) => { const from = String(v[0]); if (g[from]) { need[id].add(from); users[from].push(id); } }));
  const out = [], ready = ids.filter(id => !need[id].size), byNum = (a, b) => (parseFloat(a) - parseFloat(b)) || a.localeCompare(b);
  while (ready.length) {
    ready.sort(byNum); const id = ready.shift(); out.push(id);
    users[id].forEach(u => { need[u].delete(id); if (!need[u].size && !out.includes(u) && !ready.includes(u)) ready.push(u); });
  }
  return out;
}
// ComfyUI only runs what leads to an ending node (Save, Preview...): everything else is skipped
function usedBy(g) {
  const used = new Set(), walk = id => { if (used.has(id) || !g[id]) return; used.add(id); links(g[id]).forEach(([, v]) => walk(String(v[0]))); };
  Object.keys(g).forEach(id => { if (def(g[id].class_type).output_node) walk(id); });
  return used;
}
function setGraph(g) { S.graph = g; S.order = orderOf(g); S.used = usedBy(g); }
async function readWorkflow() { try { const p = await app.graphToPrompt(); setGraph(p.output || {}); } catch { /* an empty canvas */ } }

// ---------------------------------------------------------------- plain words
function why(id) {
  const g = S.graph[id], note = NOTES[g.class_type];
  if (note && note.why) return note.why;
  if (def(g.class_type).output_node) return "It's an ending node. ComfyUI starts from nodes like this and runs everything that leads into them.";
  const takes = links(g).map(([k, v]) => { const from = S.graph[String(v[0])], outs = from ? def(from.class_type).output_name || def(from.class_type).output || [] : []; return `${outs[v[1]] || k} from ${title(String(v[0]))}`; });
  const gives = S.order.filter(o => links(S.graph[o]).some(([, v]) => String(v[0]) === id)).map(title);
  const a = takes.length ? `It takes ${list(takes)}` : "It needs nothing from other nodes, so it can run first";
  const b = gives.length ? `, and hands its result to ${list([...new Set(gives)])}.` : ".";
  return a + b;
}
const list = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
function what(id) {
  const t = S.graph[id].class_type, d = def(t);
  return (NOTES[t] && NOTES[t].what) || d.description || (d.category ? `A ${String(d.category).split("/").pop()} node.` : "");
}
const nextId = () => S.order.find(id => id !== S.now && S.used.has(id) && !S.done.has(id)) || null;
const fromId = () => { if (S.prev) return S.prev; const i = S.order.indexOf(S.now); return S.order.slice(0, i < 0 ? S.order.length : i).filter(id => S.done.has(id)).pop() || null; };

// ---------------------------------------------------------------- what the server says while a prompt runs
api.addEventListener("execution_start", async () => { await readWorkflow(); Object.assign(S, { busy: true, done: new Set(), prev: null, now: null, step: null, chunk: null, error: false }); draw(); });
api.addEventListener("execution_cached", e => { ((e.detail && e.detail.nodes) || []).forEach(n => S.done.add(String(n))); draw(); });
api.addEventListener("executing", e => {
  const d = e.detail, node = d == null ? null : typeof d === "object" ? d.node : d;
  if (S.now) { S.done.add(S.now); S.prev = S.now; }
  S.now = node == null ? null : String(node); S.step = null; S.chunk = null; S.bars = {}; S.seen = {}; S.stepMax = null;
  if (S.now === null) { S.busy = false; S.last = S.prev; } else S.busy = true;
  draw();
});
api.addEventListener("progress", e => {
  const d = e.detail || {};
  if (d.node != null && String(d.node) !== S.now) { if (S.now) { S.done.add(S.now); S.prev = S.now; } S.now = String(d.node); S.bars = {}; S.seen = {}; S.stepMax = null; }
  // one node can count two things: chunks of a long job (only climbs) and the sampler's steps inside each (starts over)
  const bars = S.bars, seen = S.seen;
  if (bars[d.max] !== undefined && d.value < bars[d.max]) S.stepMax = d.max;
  bars[d.max] = d.value; seen[d.max] = (seen[d.max] || 0) + 1;
  const maxes = Object.keys(bars).map(Number), busiest = maxes.reduce((a, x) => seen[x] > seen[a] ? x : a, maxes[0]);
  const chunkMax = maxes.length > 1 ? maxes.find(x => x !== (S.stepMax ?? busiest)) : null;
  S.chunk = chunkMax != null ? [bars[chunkMax], chunkMax] : null;
  const sm = maxes.length > 1 ? (S.stepMax ?? maxes.find(x => x !== chunkMax)) : d.max;
  S.step = [bars[sm], sm];
  draw();
});
["execution_error", "execution_interrupted"].forEach(t => api.addEventListener(t, () => { S.busy = false; S.last = S.now; S.now = null; S.step = null; S.error = t === "execution_error"; draw(); }));

// ---------------------------------------------------------------- drawing
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const css = document.createElement("style");
css.textContent = `
.cbp{--g:${GREEN};font:13px/1.45 system-ui,"Segoe UI",sans-serif;color:var(--fg-color,#e9e6ef);box-sizing:border-box}
.cbp *{box-sizing:border-box}
.cbp-flow{display:grid;grid-template-rows:repeat(3,auto);gap:3px}
.cbp-st{position:relative;display:flex;align-items:center;gap:8px;min-width:0;padding:5px 9px;border:1px solid #3a3644;border-radius:3px;background:rgba(255,255,255,.03);color:#a9a3b5;overflow:hidden;cursor:pointer}
.cbp-st i{flex:none;width:62px;font:700 9.5px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;font-style:normal;opacity:.75}
.cbp-st b{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbp-st small{flex:none;font-weight:600;color:var(--g)}
.cbp-st u{position:absolute;left:0;bottom:0;height:2px;background:var(--g);transition:width .3s}
.cbp-st.now{border-color:var(--g);color:#fff;background:rgba(63,207,116,.12);box-shadow:0 0 8px 1px rgba(63,207,116,.45)}
.cbp-st.now i{color:var(--g);opacity:1}
.cbp.idle .cbp-st.now{border-color:#3a3644;background:rgba(255,255,255,.03);box-shadow:none;color:#a9a3b5}
.cbp.idle .cbp-st.now i{color:inherit;opacity:.75}
.cbp.err .cbp-st.now{--g:#e0564f}
.cbp-tab{display:flex;flex-direction:column;padding:0 12px 12px}
.cbp-tab .head{position:sticky;top:0;z-index:2;padding:12px 0 2px;background:var(--comfy-menu-bg,#1b1a21)}
.cbp-tab h2{margin:0 0 2px;font:700 16px system-ui}.cbp-tab h2 span{color:#e8b64c}
.cbp-tab .sub{margin:0 0 10px;color:#a9a3b5;font-size:12px}
.cbp-tab .tools{display:flex;gap:6px;margin:8px 0}
.cbp-tab .tools button{border:1px solid #3a3644;background:rgba(255,255,255,.04);color:inherit;border-radius:3px;padding:4px 10px;cursor:pointer;font:600 12px system-ui}
.cbp-tab .tools button:hover{border-color:#e8b64c}
.cbp-tab .swnote{margin:-6px 0 8px;color:#8d879a;font-size:11px}
.cbp-sw{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin-top:6px;padding-top:6px;border-top:1px solid #34333f;font:600 11.5px system-ui;color:#cfcad8}
.cbp-sw b{font:700 9.5px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#8d879a}
.cbp-sw label{display:flex;align-items:center;gap:5px;cursor:pointer}
.cbp-sw i{position:relative;width:24px;height:13px;border-radius:7px;background:#4a4458;transition:background .15s}
.cbp-sw i::after{content:"";position:absolute;left:2px;top:2px;width:9px;height:9px;border-radius:50%;background:#cfcad8;transition:left .15s}
.cbp-sw label.on i{background:#3fcf74}.cbp-sw label.on i::after{left:13px;background:#fff}
.cbp-sw.off-all::after{content:"All off in the DPD Studio menu";color:#e8b64c;font-weight:400;font-size:10.5px}
.cbp-tab ol{list-style:none;margin:0;padding:4px 0 20px}
.cbp-tab li{position:relative;margin-left:8px;padding:8px 8px 10px 16px;border-left:2px solid #3a3644;cursor:pointer}
.cbp-tab li:hover{background:rgba(255,255,255,.03)}
.cbp-tab li::before{content:"";position:absolute;left:-7px;top:13px;width:10px;height:10px;border-radius:50%;background:var(--comfy-menu-bg,#17151d);border:2px solid #5a5666}
.cbp-tab li.done{opacity:.7}.cbp-tab li.done::before{background:#5a5666}
.cbp-tab li.skip{opacity:.45}
.cbp-tab li.now{border-left-color:var(--g);background:linear-gradient(90deg,rgba(63,207,116,.13),transparent 80%)}
.cbp-tab li.now::before{border-color:var(--g);background:var(--g);box-shadow:0 0 9px 2px rgba(63,207,116,.7)}
.cbp-tab li h3{margin:0 0 2px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;font:700 13.5px system-ui;color:#fff}
.cbp-tab li h3 small{font:600 10px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#8d879a}
.cbp-tab li.now h3 small{color:var(--g)}
.cbp-tab li p{margin:0 0 4px}.cbp-tab li .why{color:#a9a3b5;font-size:12px}.cbp-tab li .why b{color:#e8b64c;font-weight:600}
.cbp-tab .chips{display:flex;flex-wrap:wrap;gap:3px 5px;margin-top:3px}
.cbp-tab .chips span{padding:1px 6px;border:1px solid #33303d;border-radius:3px;font-size:11px;color:#c9c4d3}
.cbp-tab .chips span em{font-style:normal;color:#8d879a}.cbp-tab .chips span.set{border-style:dashed;color:#a9a3b5}
.cbp-tab .empty{color:#a9a3b5;padding:16px 4px}
@keyframes cbp-pulse{50%{box-shadow:0 0 14px 3px rgba(63,207,116,.65)}}
.cbp:not(.idle) .cbp-st.now{animation:cbp-pulse 1.6s ease-in-out infinite}`;
document.head.appendChild(css);

function flowHtml() {
  const idle = !S.busy, nx = idle ? null : nextId(), from = fromId();
  const cells = idle
    ? [["last step", S.last ? title(S.last) : "—"], [S.error ? "stopped" : "now", S.error ? `Stopped at ${title(S.last)}` : "Nothing running"], ["next", "Queue a prompt to watch it"]]
    : [["came from", from ? title(from) : "Start"], ["now", S.now ? title(S.now) : "Getting ready"], ["next", nx ? title(nx) : "Finished"]];
  const pct = S.step ? Math.round(100 * S.step[0] / S.step[1]) : 0;
  return cells.map(([k, v], i) => `<div class="cbp-st${i === 1 ? " now" : ""}" data-go="${i === 0 ? from || "" : i === 1 ? S.now || "" : nx || ""}"><i>${k}</i><b title="${esc(v)}">${esc(v)}</b>${i === 1 && !idle && S.step ? `<small>${S.chunk ? `chunk ${S.chunk[0]}/${S.chunk[1]} · ` : ""}${S.step[0]}/${S.step[1]}</small><u style="width:${pct}%"></u>` : ""}</div>`).join("");
}
function rowHtml(id, i) {
  const g = S.graph[id], used = S.used.has(id);
  const state = S.busy && id === S.now ? "now" : S.done.has(id) ? "done" : !used ? "skip" : "";
  const label = state === "now" ? `working now${S.chunk ? ` · chunk ${S.chunk[0]}/${S.chunk[1]}` : ""}${S.step ? ` · step ${S.step[0]}/${S.step[1]}` : ""}` : state === "done" ? "done" : state === "skip" ? "skipped: nothing it feeds is saved or shown" : S.busy && id === nextId() ? "next" : `step ${i + 1}`;
  const wires = [], sets = [];
  links(g).forEach(([k, v]) => { const from = S.graph[String(v[0])], outs = from ? def(from.class_type).output_name || def(from.class_type).output || [] : []; wires.push(`<span><em>${esc(k)} ←</em> ${esc(title(String(v[0])))}${outs[v[1]] ? ` <em>· ${esc(outs[v[1]])}</em>` : ""}</span>`); });
  Object.entries(g.inputs || {}).forEach(([k, v]) => { if (typeof v !== "object" && String(v).trim() && String(v).length < 60) sets.push(`<span class="set"><em>${esc(k)}</em> ${esc(v)}</span>`); });
  const w = what(id);
  return `<li class="${state}" data-go="${id}"><h3>${esc(title(id))}<small>${esc(label)}</small></h3>${w ? `<p>${esc(w)}</p>` : ""}<p class="why"><b>Why here:</b> ${esc(why(id))}</p>${wires.length ? `<div class="chips">${wires.join("")}</div>` : ""}${sets.length ? `<div class="chips">${sets.slice(0, 8).join("")}</div>` : ""}</li>`;
}
function paintTab(el) {
  const flow = el.querySelector(".cbp-flow"), list = el.querySelector("ol");
  el.classList.toggle("idle", !S.busy); el.classList.toggle("err", S.error && !S.busy);
  flow.innerHTML = flowHtml();
  list.innerHTML = S.graph && S.order.length ? S.order.map(rowHtml).join("") : `<div class="empty">This workflow is empty. Add some nodes, or load a workflow, and its blueprint shows up here.</div>`;
  el.querySelector(".sub").textContent = S.busy ? `Running: ${S.order.filter(id => S.used.has(id)).length} nodes, ${S.done.size} done.` : S.graph ? `${S.order.length} nodes, in the order ComfyUI runs them.` : "What each node does, and why it's wired there.";
  if (S.busy && !el.dataset.moved) list.querySelector("li.now")?.scrollIntoView({ block: "nearest" });
}
function paintNode(el) { el.classList.toggle("idle", !S.busy); el.classList.toggle("err", S.error && !S.busy); el.querySelector(".cbp-flow").innerHTML = flowHtml(); }
function draw() { views.forEach(v => v.el.isConnected ? v.paint(v.el) : views.delete(v)); }

function jump(id) {
  const n = id && canvasNode(id); if (!n) return;
  app.canvas.selectNode(n, false); app.canvas.centerOnNode(n); app.canvas.setDirty(true, true);
}
function openTab() {
  if (!shown) return app.extensionManager.toast?.add({ severity: "info", summary: "The Blueprint tab is off", detail: "Turn it on with the Blueprint tab switch on the Comfy Blueprint node.", life: 5000 });
  const st = app.extensionManager.sidebarTab; if (st.activeSidebarTabId !== TAB) st.toggleSidebarTab(TAB);
}

// ---------------------------------------------------------------- on and off
// DPD Studio stays out of the way until a workflow has a Comfy Blueprint node: then the Blueprint tab and Conduit come
// on, and the node's own switches turn each one off for that workflow (they're saved with it). DPD Studio's top menu
// (dpd_menu.js) has the "all off" switch and adds the node. window.DPDStudio tells the other parts what's on.
const NODE = "Comfy Blueprint";
const SWITCHES = [["dpdConduit", "Conduit"], ["dpdTab", "Blueprint tab"]];
const ST = window.DPDStudio = { node: false, conduit: false, tab: false };
const allOn = () => app.extensionManager.setting.get("DPD.Studio.Enabled") !== false;
const theNode = () => (app.graph?.nodes || []).find(n => n.type === NODE);
let ready = false, shown = false;
function syncAll() {
  if (!ready) return;                                        // the graph isn't there until setup
  const n = theNode(), p = (n && n.properties) || {}, all = allOn();
  const next = { node: !!n, conduit: all && !!n && p.dpdConduit !== false, tab: all && !!n && p.dpdTab !== false };
  const changed = Object.keys(next).some(k => next[k] !== ST[k]);
  Object.assign(ST, next);
  syncTab(); paintSwitches();
  if (changed) app.canvas?.setDirty(true, true);
}
function syncTab() {
  if (!ready || ST.tab === shown) return;
  shown = ST.tab;
  const em = app.extensionManager;
  if (shown) em.registerSidebarTab(TAB_DEF);
  else { if (em.sidebarTab.activeSidebarTabId === TAB) em.sidebarTab.toggleSidebarTab(TAB); em.unregisterSidebarTab?.(TAB); }
}
function paintSwitches() {
  document.querySelectorAll(".cbp-sw").forEach(sw => {
    const n = sw._node; if (!n) return;
    sw.classList.toggle("off-all", !allOn());
    sw.querySelectorAll("label").forEach(l => l.classList.toggle("on", allOn() && n.properties?.[l.dataset.p] !== false));
  });
}
function flip(node, key) {
  node.properties = node.properties || {};
  if (!allOn()) { app.extensionManager.setting.set("DPD.Studio.Enabled", true); node.properties[key] = true; }   // all were off: this one comes on
  else node.properties[key] = node.properties[key] === false;
  app.graph?.change?.();
  syncAll();
}
addEventListener("dpd-studio-switch", syncAll);
setInterval(syncAll, 700);                                   // a Blueprint node added, removed, or another workflow opened
const TAB_DEF = {
  id: TAB, icon: "pi pi-sitemap", title: "Blueprint", tooltip: "Comfy Blueprint: what each node does, and why it's wired there", type: "custom",
  render: el => {
    el.innerHTML = `<div class="cbp cbp-tab idle"><div class="head"><h2>Comfy <span>Blueprint</span></h2><p class="sub"></p><p class="swnote">Switch Conduit or this tab off on the Comfy Blueprint node.</p><div class="cbp-flow"></div><div class="tools"><button data-a="refresh">Read the workflow again</button></div></div><ol></ol></div>`;
    const box = el.firstChild;
    box.addEventListener("click", e => { const b = e.target.closest("[data-a=refresh]"); if (b) { readWorkflow().then(draw); return; } const t = e.target.closest("[data-go]"); if (t) jump(t.dataset.go); });
    box.addEventListener("wheel", () => { box.dataset.moved = 1; }, { passive: true });
    views.add({ el: box, paint: paintTab });
    (S.busy ? Promise.resolve() : readWorkflow()).then(draw);
  },
};

async function loadNotes() { try { NOTES = await (await fetch(new URL("./notes.json", import.meta.url))).json(); } catch { NOTES = {}; } }

app.registerExtension({
  name: "Comfy.Blueprint",
  async setup() {
    await loadNotes();
    ready = true; syncAll();
    // keep the blueprint in step with the canvas while nothing runs
    let t = 0;
    const later = () => { if (S.busy) return; clearTimeout(t); t = setTimeout(() => readWorkflow().then(draw), 400); };
    api.addEventListener("graphChanged", later);
    // and a light look every two seconds while the tab is open, for changes no event reports (a new wire, a bypass)
    let lastSeen = "";
    setInterval(async () => {
      if (S.busy || ![...views].some(v => v.paint === paintTab && v.el.isConnected)) return;
      try { const p = await app.graphToPrompt(), now = JSON.stringify(p.output || {}); if (now !== lastSeen) { lastSeen = now; setGraph(p.output || {}); draw(); } } catch { /* mid-edit */ }
    }, 2000);
  },
  registerCustomNodes() {
    class ComfyBlueprintNode extends LGraphNode {
      constructor(t) {
        super(t);
        this.isVirtualNode = true;
        this.serialize_widgets = false;
        this.color = "#1f3a29"; this.bgcolor = "#17151d";
        const el = document.createElement("div");
        el.className = "cbp idle";
        el.innerHTML = `<div class="cbp-flow"></div><div class="cbp-sw" title="DPD Studio's tools in this workflow"><b>On here</b>${SWITCHES.map(([k, l]) => `<label data-p="${k}"><i></i>${l}</label>`).join("")}</div>`;
        el.querySelector(".cbp-sw")._node = this;
        el.addEventListener("click", e => { const sw = e.target.closest(".cbp-sw label"); if (sw) return flip(this, sw.dataset.p); if (e.target.closest(".cbp-sw")) return; const s = e.target.closest("[data-go]"); if (s && s.dataset.go) jump(s.dataset.go); else openTab(); });
        el.title = "Click a step to jump to it; click anywhere else for the full Blueprint";
        this.addDOMWidget("blueprint", "blueprint", el, { serialize: false, hideOnZoom: false, getMinHeight: () => 140 });
        views.add({ el, paint: paintNode });
        this.size = [340, 178];
        paintNode(el);
      }
    }
    ComfyBlueprintNode.title = "Comfy Blueprint";
    ComfyBlueprintNode.category = "utils";
    ComfyBlueprintNode.description = "Turns DPD Studio's tools on in this workflow (Conduit and the Blueprint tab, each with its own switch). Shows where a render is (the node it came from, the one working now, the next) and opens the Blueprint: what every node does and why.";
    LiteGraph.registerNodeType("Comfy Blueprint", ComfyBlueprintNode);
  },
});
