// Comfy Conduit: magnets, stacks and passthrough lanes for ComfyUI's canvas.
// · Magnets: drag a node near another and the edges where they can really connect light up green. Let go and it snaps
//   alongside and wires itself. Where nothing fits, nothing snaps.
// · Stacks: snapped nodes move together. Right-click a node, or use its ⇅ picker, to take it out of its stack.
//   Alt-drag stays ComfyUI's own copy-and-drag; the copy starts outside any stack.
// · Lanes: a wire between two nodes of one stack with others in between is drawn through the stack's lane channel
//   instead of looping across the canvas. The wire itself is an ordinary ComfyUI link: a workflow opened without this
//   pack shows normal wires, and renders are the same either way.
// · The lane picker: the ⇅ badge on a node lists every input it still needs and every node that can feed it, nearest
//   first. Pick one and it's wired (through the lanes, when they share a stack).
import { app } from "../../../scripts/app.js";

const GAP = 22, NEAR = 70, LANE = 8, GREEN = "#3fcf74";
const ON = () => app.extensionManager.setting.get("Comfy.Conduit.Enabled") !== false;
const S = { drag: null, cand: null, lanes: new Map(), rails: [] };
const TH = () => LiteGraph.NODE_TITLE_HEIGHT || 30;
const graph = () => app.canvas.graph || app.graph;

// ---------------------------------------------------------------- geometry
const box = n => ({ x: n.pos[0], y: n.pos[1] - TH(), w: n.size[0], h: n.size[1] + TH() });
const gapBetween = (a, b) => Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
const stackOf = n => n.properties && n.properties.dpdStack;
const members = id => id ? graph().nodes.filter(n => stackOf(n) === id) : [];
const live = n => n && !n.collapsed && n.size;
// the graph keeps its links in a Map in newer frontends and a plain object in older ones
const allLinks = () => { const L = graph().links; return L instanceof Map ? [...L.values()] : Object.values(L || {}); };
const linkById = id => { const L = graph().links; return L instanceof Map ? L.get(id) : L && L[id]; };

// ---------------------------------------------------------------- what can connect
const realInput = s => s && !s.widget;                          // a socket, not a widget converted to one
const fits = (outType, inType) => LiteGraph.isValidConnection(outType, inType) && outType !== "*" && inType !== "*";
// what joining a group would wire: every open input of d fed by a member, and every open input of a member d can feed.
// Members are read top to bottom (then left to right) and each output feeds one input of d, so a positive prompt
// stacked above a negative one lands on "positive" and the lower one on "negative".
const reading = list => [...list].sort((p, q) => (p.pos[1] - q.pos[1]) || (p.pos[0] - q.pos[0]));
function pairs(d, group) {
  const out = [], used = new Set();
  const others = reading(group.filter(m => m !== d && live(m)));
  (d.inputs || []).forEach((inp, i) => {
    if (!realInput(inp) || inp.link != null) return;
    for (const m of others) {
      const j = (m.outputs || []).findIndex((o, k) => !used.has(`${m.id}:${k}`) && fits(o.type, inp.type));
      if (j >= 0) { used.add(`${m.id}:${j}`); out.push({ src: m, out: j, dst: d, in: i, type: inp.type }); break; }
    }
  });
  others.forEach(m => (m.inputs || []).forEach((inp, i) => {
    if (!realInput(inp) || inp.link != null || out.some(p => p.dst === m && p.in === i)) return;
    const j = (d.outputs || []).findIndex(o => fits(o.type, inp.type));
    if (j >= 0) out.push({ src: d, out: j, dst: m, in: i, type: inp.type });
  }));
  return out;
}
// where node d would snap against node n, and what would wire up (with n's whole stack); null if nothing can connect
function fit(d, n) {
  const a = box(d), b = box(n), g = gapBetween(a, b);
  if (g > NEAR) return null;
  const cx = (a.x + a.w / 2) - (b.x + b.w / 2), cy = (a.y + a.h / 2) - (b.y + b.h / 2);
  const side = Math.abs(cx) / (a.w + b.w) > Math.abs(cy) / (a.h + b.h) ? (cx > 0 ? "right" : "left") : (cy > 0 ? "below" : "above");
  const pos = side === "right" ? [b.x + b.w + GAP, n.pos[1]] : side === "left" ? [b.x - a.w - GAP, n.pos[1]]
    : side === "below" ? [b.x, b.y + b.h + GAP + TH()] : [b.x, b.y - a.h - GAP + TH()];
  // judge the wiring as if d were already in place, so "top to bottom" reads right
  const was = [...d.pos]; d.pos[0] = pos[0]; d.pos[1] = pos[1];
  const p = pairs(d, stackOf(n) ? members(stackOf(n)) : [n]);
  d.pos[0] = was[0]; d.pos[1] = was[1];
  if (!p.length) return null;
  return { d, n, side, pairs: p, pos, gap: g };
}
// a spot is free when the node, put there, would not cover any other node
function free(d, pos, skip) {
  const a = { x: pos[0], y: pos[1] - TH(), w: d.size[0], h: d.size[1] + TH() };
  return !graph().nodes.some(m => m !== d && !skip.has(m) && live(m) && (() => { const b = box(m); return a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2; })());
}
function bestFit(d, crew = []) {
  let best = null;
  const skip = new Set(crew);
  graph().nodes.forEach(n => {
    if (n === d || !live(n) || skip.has(n) || (stackOf(d) && stackOf(n) === stackOf(d))) return;
    const f = fit(d, n);
    if (f && !free(d, f.pos, skip)) return;
    // the node you are clearly closest to wins; between near-equals, the one that wires more
    if (f && (!best || (Math.abs(f.gap - best.gap) > 20 ? f.gap < best.gap : f.pairs.length > best.pairs.length || (f.pairs.length === best.pairs.length && f.gap < best.gap)))) best = f;
  });
  return best;
}

// ---------------------------------------------------------------- dragging
function canvasPos(e) { return app.canvas.convertEventToCanvasOffset(e); }
function onDown(e) {
  if (!ON() || e.button !== 0) return;
  const [x, y] = canvasPos(e);
  if (badgeHit(x, y, e)) return;
  const n = graph().getNodeOnPos(x, y);
  if (!n) return;
  // dragging a node of a stack carries the whole stack; Alt is ComfyUI's copy-and-drag, which moves the copy alone
  const crew = e.altKey ? [] : members(stackOf(n)).filter(m => m !== n);
  S.drag = { n, start: [...n.pos], crew: crew.map(m => ({ m, start: [...m.pos] })), alt: e.altKey, moved: false, had: new Set(graph().nodes.map(m => m.id)) };
}
// these run on the capture phase, before the canvas moves the node, so each looks a moment later
function follow(d, alt) {
  const dx = d.n.pos[0] - d.start[0], dy = d.n.pos[1] - d.start[1];
  if (!d.moved && Math.hypot(dx, dy) < 3) return;
  d.moved = true;
  d.crew.forEach(c => { c.m.pos[0] = c.start[0] + dx; c.m.pos[1] = c.start[1] + dy; });
  S.cand = d.alt || alt ? null : bestFit(d.n, d.crew.map(c => c.m));
  app.canvas.setDirty(true, true);
}
function onMove(e) {
  const d = S.drag; if (!d) return;                       // a drag lasts from pointerdown to pointerup
  const alt = e.altKey; setTimeout(() => S.drag === d && follow(d, alt), 0);
}
function onUp(e) {
  const d = S.drag; S.drag = null; if (!d) return;
  const alt = d.alt || e.altKey;
  setTimeout(() => {                                       // after the canvas has finished its own drag
    follow(d, alt);
    const c = S.cand; S.cand = null;
    if (alt) graph().nodes.forEach(m => { if (!d.had.has(m.id) && m.properties && m.properties.dpdStack) delete m.properties.dpdStack; });   // a copy starts on its own
    if (d.moved && c && !alt) snap(c, d);
    app.canvas.setDirty(true, true);
  }, 0);
}
function snap(c, d) {
  const dx = c.pos[0] - c.d.pos[0], dy = c.pos[1] - c.d.pos[1];
  c.d.pos[0] = c.pos[0]; c.d.pos[1] = c.pos[1];
  d.crew.forEach(k => { k.m.pos[0] += dx; k.m.pos[1] += dy; });
  graph().beforeChange?.();
  c.pairs.forEach(p => p.src.connect(p.out, p.dst, p.in));
  const id = stackOf(c.n) || stackOf(c.d) || `s${Date.now().toString(36)}`;
  [c.n, c.d, ...members(stackOf(c.d)), ...members(stackOf(c.n))].forEach(m => { m.properties = m.properties || {}; m.properties.dpdStack = id; });
  graph().afterChange?.();
  app.canvas.setDirty(true, true);
}
// out of the stack: it stays wired, stops moving with the stack, and steps aside so you can see it left
function unstack(n) {
  const list = members(stackOf(n)).filter(m => m !== n); if (!stackOf(n)) return;
  graph().beforeChange?.();
  delete n.properties.dpdStack;
  if (list.length) { const right = Math.max(...list.map(m => box(m).x + box(m).w)); n.pos[0] = right + 60; }
  tidyStack(); graph().afterChange?.(); app.canvas.setDirty(true, true);
}
function takeApart(n) { const s = stackOf(n); graph().beforeChange?.(); members(s).forEach(m => delete m.properties.dpdStack); graph().afterChange?.(); app.canvas.setDirty(true, true); }
function tidyStack() { const count = {}; graph().nodes.forEach(n => { const s = stackOf(n); if (s) count[s] = (count[s] || 0) + 1; }); graph().nodes.forEach(n => { if (stackOf(n) && count[stackOf(n)] < 2) delete n.properties.dpdStack; }); }

// ---------------------------------------------------------------- lanes
// a wire rides the lanes when both ends share a stack and another member sits between them
function planLanes() {
  S.lanes.clear(); S.rails = [];
  const g = graph(), byStack = {};
  g.nodes.forEach(n => { const s = stackOf(n); if (s && live(n)) (byStack[s] = byStack[s] || []).push(n); });
  Object.entries(byStack).forEach(([sid, list]) => {
    if (list.length < 2) return;
    const boxes = list.map(box), left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y)), bottom = Math.max(...boxes.map(b => b.y + b.h));
    const riders = [];
    allLinks().forEach(l => {
      if (!l || l.origin_id == null) return;
      const a = g.getNodeById(l.origin_id), b = g.getNodeById(l.target_id);
      if (!a || !b || stackOf(a) !== sid || stackOf(b) !== sid) return;
      const A = box(a), B = box(b), lo = Math.min(A.y, B.y), hi = Math.max(A.y + A.h, B.y + B.h);
      const between = list.some(m => m !== a && m !== b && box(m).y > lo && box(m).y + box(m).h < hi);
      if (between || B.y + 2 < A.y) riders.push(l);         // and any wire that has to climb back up the stack
    });
    if (!riders.length) return;
    riders.sort((p, q) => p.id - q.id).forEach((l, i) => S.lanes.set(l.id, { x: left - 14 - i * LANE, i, stack: list }));
    S.rails.push({ x: left - 14 - (riders.length - 1) * LANE - 6, y: top + 4, w: (riders.length - 1) * LANE + 12, h: bottom - top - 8, list, riders });
  });
}
function laneColor(l) { const c = app.canvas; return l.color || (c.default_connection_color_byType && c.default_connection_color_byType[l.type]) || (LGraphCanvas.link_type_colors && LGraphCanvas.link_type_colors[l.type]) || "#9aa4b3"; }
function drawLane(ctx, a, b, l, lane) {
  const g = graph(), src = g.getNodeById(l.origin_id), A = box(src), down = b[1] > a[1];
  // each lane crosses the seam under its box at its own height, so wires sharing a seam stay apart
  const below = g.nodes.filter(m => m !== src && stackOf(m) === stackOf(src) && live(m) && box(m).y >= A.y + A.h - 2).map(m => box(m).y);
  const room = Math.max(8, Math.min(GAP, ...(below.length ? [Math.min(...below) - (A.y + A.h)] : [GAP])) - 4);
  const step = (lane.i % 4 + 1) * room / 5;
  const seam = down ? A.y + A.h + step : A.y - step, x = lane.x, r = 5;
  ctx.save();
  ctx.strokeStyle = laneColor(l); ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.arcTo(a[0] + 12, a[1], a[0] + 12, seam, r);              // out of the output, down to the seam under its box
  ctx.arcTo(a[0] + 12, seam, x, seam, r);                     // along the seam, through the stack
  ctx.arcTo(x, seam, x, b[1], r);                             // down the lane
  ctx.arcTo(x, b[1], b[0], b[1], r);                          // and into the input
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}
function drawRails(ctx) {
  S.rails.forEach(r => {
    ctx.save();
    ctx.fillStyle = "rgba(20,19,26,.85)"; ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r.x, r.y, r.w, r.h, 5) : ctx.rect(r.x, r.y, r.w, r.h); ctx.fill(); ctx.stroke();
    ctx.restore();
  });
}

// ---------------------------------------------------------------- the lane picker
const BADGE = 22;
function badgeRect(n) { return [n.pos[0] + n.size[0] - BADGE - 30, n.pos[1] - TH() + (TH() - 18) / 2, BADGE, 18]; }
const needs = n => (n.inputs || []).some(realInput);
function badgeHit(x, y, e) {
  for (const n of [...graph().nodes].reverse()) {
    if (!live(n) || !needs(n)) continue;
    const [bx, by, bw, bh] = badgeRect(n);
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) { e.stopImmediatePropagation(); e.preventDefault(); openPicker(n, e.clientX, e.clientY); return true; }
  }
  return false;
}
function drawBadges(ctx) {
  if (app.canvas.ds.scale < 0.45) return;
  graph().nodes.forEach(n => {
    if (!live(n) || !needs(n)) return;
    const [x, y, w, h] = badgeRect(n), open = (n.inputs || []).some(i => realInput(i) && i.link == null);
    ctx.save();
    ctx.fillStyle = open ? "rgba(232,182,76,.18)" : "rgba(255,255,255,.06)";
    ctx.strokeStyle = open ? "#e8b64c" : "rgba(255,255,255,.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 3) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = open ? "#e8b64c" : "#cfcad8"; ctx.font = "bold 12px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("⇅", x + w / 2, y + h / 2 + 1);
    ctx.restore();
  });
}
const article = t => /^[AEIOU]/i.test(t) ? "an" : "a";
function where(from, to) {
  const s = stackOf(from) && stackOf(from) === stackOf(to);
  if (s) { const list = members(stackOf(to)).sort((p, q) => p.pos[1] - q.pos[1]), k = list.indexOf(from) - list.indexOf(to); if (k) return `${Math.abs(k)} ${Math.abs(k) === 1 ? "box" : "boxes"} ${k < 0 ? "up" : "down"}, through the lanes`; }
  const d = Math.round(Math.hypot(from.pos[0] - to.pos[0], from.pos[1] - to.pos[1]));
  return `${d} px away`;
}
let picker = null;
function closePicker() { picker?.remove(); picker = null; removeEventListener("pointerdown", outside, true); }
const outside = e => { if (picker && !picker.contains(e.target)) closePicker(); };
function openPicker(n, cx, cy) {
  closePicker();
  const g = graph(), rows = [];
  (n.inputs || []).forEach((inp, i) => {
    if (!realInput(inp)) return;
    const l = inp.link != null && linkById(inp.link), have = l ? g.getNodeById(l.origin_id) : null;
    const options = g.nodes.filter(m => m !== n && live(m)).flatMap(m => (m.outputs || []).map((o, j) => fits(o.type, inp.type) ? { m, j, o } : null).filter(Boolean))
      .sort((p, q) => Math.hypot(p.m.pos[0] - n.pos[0], p.m.pos[1] - n.pos[1]) - Math.hypot(q.m.pos[0] - n.pos[0], q.m.pos[1] - n.pos[1]));
    rows.push({ inp, i, have, options });
  });
  picker = document.createElement("div");
  picker.className = "cst-pick";
  picker.innerHTML = `<h4>${esc(n.title)} <span>lanes</span>${stackOf(n) ? `<button class="out" data-out="1">Take out of stack</button>` : ""}</h4>` + rows.map((r, k) => `<section><p><b>${esc(r.inp.label || r.inp.name)}</b> needs ${article(String(r.inp.type))} ${esc(r.inp.type)}${r.have ? ` · now from <i>${esc(r.have.title)}</i>` : ""}</p>${r.options.length ? r.options.slice(0, 6).map((o, q) => `<button data-k="${k}" data-q="${q}"${r.have === o.m ? ' class="on"' : ""}>from <b>${esc(o.m.title)}</b><small>${esc(o.o.label || o.o.name || o.o.type)} · ${esc(where(o.m, n))}</small></button>`).join("") : `<em>Nothing on the canvas makes ${article(String(r.inp.type))} ${esc(r.inp.type)} yet.</em>`}</section>`).join("");
  picker.addEventListener("click", e => {
    if (e.target.closest("button[data-out]")) { unstack(n); closePicker(); return; }
    const b = e.target.closest("button[data-k]"); if (!b) return;
    const r = rows[+b.dataset.k], o = r.options[+b.dataset.q];
    g.beforeChange?.(); o.m.connect(o.j, n, r.i); g.afterChange?.();
    app.canvas.setDirty(true, true); closePicker();
  });
  document.body.appendChild(picker);
  const W = picker.offsetWidth, H = picker.offsetHeight;
  picker.style.left = `${Math.min(cx + 8, innerWidth - W - 8)}px`; picker.style.top = `${Math.min(cy + 8, innerHeight - H - 8)}px`;
  setTimeout(() => addEventListener("pointerdown", outside, true), 0);
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const css = document.createElement("style");
css.textContent = `
.cst-pick{position:fixed;z-index:10000;width:330px;max-height:70vh;overflow:auto;padding:10px 12px;background:#1b1a21;border:1px solid #e8b64c;border-radius:4px;box-shadow:0 14px 40px rgba(0,0,0,.55);font:13px/1.4 system-ui,sans-serif;color:#e9e6ef}
.cst-pick h4{display:flex;align-items:center;gap:6px;margin:0 0 8px;font:700 14px system-ui}.cst-pick h4 button.out{width:auto;margin:0 0 0 auto;padding:3px 8px;font-size:12px;border-color:#e8b64c}.cst-pick h4 span{color:#e8b64c;font-weight:600}
.cst-pick section{margin:0 0 10px}.cst-pick p{margin:0 0 4px;color:#cfcad8}.cst-pick p i{color:#fff;font-style:normal}
.cst-pick button{display:block;width:100%;text-align:left;margin:0 0 3px;padding:5px 8px;border:1px solid #3a3644;border-radius:3px;background:rgba(255,255,255,.03);color:#e9e6ef;font:13px system-ui;cursor:pointer}
.cst-pick button:hover{border-color:${GREEN};background:rgba(63,207,116,.1)}.cst-pick button.on{border-color:#5a5666;opacity:.7}
.cst-pick button small{display:block;color:#8d879a;font-size:11.5px}.cst-pick em{color:#8d879a;font-size:12px}`;
document.head.appendChild(css);

// ---------------------------------------------------------------- drawing the magnets
function drawMagnet(ctx) {
  const c = S.cand; if (!c) return;
  const a = box(c.d), b = box(c.n), ghost = { x: c.pos[0], y: c.pos[1] - TH(), w: a.w, h: a.h };
  ctx.save();
  ctx.setLineDash([6, 4]); ctx.strokeStyle = GREEN; ctx.lineWidth = 2; ctx.fillStyle = "rgba(63,207,116,.08)";
  ctx.beginPath(); ctx.rect(ghost.x, ghost.y, ghost.w, ghost.h); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  ctx.shadowColor = GREEN; ctx.shadowBlur = 14; ctx.lineWidth = 2.5;
  ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  ctx.shadowBlur = 0;
  const name = s => s.label || s.name || s.type;
  const label = c.pairs.map(p => `${name(p.src.outputs[p.out])} → ${name(p.dst.inputs[p.in])}${p.src !== c.n && p.dst !== c.n ? " (lane)" : ""}`).join("   ");
  // and a preview of each wire it will make
  ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
  c.pairs.forEach(p => {
    const from = p.src === c.d ? [c.pos[0] + a.w, c.pos[1] + 14 + p.out * 20] : p.src.getConnectionPos(false, p.out);
    const to = p.dst === c.d ? [c.pos[0], c.pos[1] + 14 + p.in * 20] : p.dst.getConnectionPos(true, p.in);
    ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.bezierCurveTo(from[0] + 60, from[1], to[0] - 60, to[1], to[0], to[1]); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.font = "bold 13px system-ui"; const w = ctx.measureText(label).width + 16;
  const lx = ghost.x, ly = ghost.y - 26;
  ctx.fillStyle = "rgba(14,24,18,.92)"; ctx.fillRect(lx, ly, w, 22); ctx.strokeRect(lx, ly, w, 22);
  ctx.fillStyle = "#c9f5d9"; ctx.textBaseline = "middle"; ctx.fillText(label, lx + 8, ly + 11);
  ctx.restore();
}

app.registerExtension({
  name: "Comfy.Conduit",
  settings: [{ id: "Comfy.Conduit.Enabled", category: ["Comfy Blueprint", "Conduit", "Magnets"], name: "Comfy Conduit: magnets, stacks and passthrough lanes", type: "boolean", defaultValue: true, tooltip: "Drag a node near another to snap and wire it; stacked nodes move together and long wires ride the lanes. Right-click a node to take it out of its stack." }],
  getNodeMenuItems(node) {
    if (!ON() || !stackOf(node)) return [];
    return [{ content: "Take out of stack", callback: () => unstack(node) }, { content: "Take the whole stack apart", callback: () => takeApart(node) }];
  },
  setup() {
    const el = app.canvas.canvas;
    el.addEventListener("pointerdown", onDown, true);
    addEventListener("pointermove", onMove, true);
    addEventListener("pointerup", onUp, true);
    const P = LGraphCanvas.prototype;
    const drawConnections = P.drawConnections;
    P.drawConnections = function (ctx, ...rest) { if (ON()) { planLanes(); drawRails(ctx); } else S.lanes.clear(); return drawConnections.call(this, ctx, ...rest); };
    const renderLink = P.renderLink;
    P.renderLink = function (ctx, a, b, link, skipBorder, flow, color, ...rest) {
      const lane = link && link.id != null && !link._dragging && S.lanes.get(link.id);
      if (lane && !flow) return drawLane(ctx, a, b, link, lane);
      return renderLink.call(this, ctx, a, b, link, skipBorder, flow, color, ...rest);
    };
    const fg = app.canvas.onDrawForeground;
    app.canvas.onDrawForeground = function (ctx, area) { fg && fg.call(this, ctx, area); if (ON()) { drawMagnet(ctx); drawBadges(ctx); } };
    window.__comfyStacks = window.__comfyConduit = { S, fit, bestFit, pairs, snap, planLanes, openPicker, members, unstack };
  },
});
