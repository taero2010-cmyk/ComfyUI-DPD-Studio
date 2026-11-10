// DPD Studio Zoom & Pan: keep zooming and panning the canvas while the pointer is over a big node.
// Nodes drawn in HTML (sheets, timelines, video players, editors, pages in a frame) swallow the mouse wheel and the
// drag, so once a node fills the screen you can't zoom out or move past it. With this on:
//   the wheel zooms the canvas over any node, unless what's under the pointer can really scroll that way or draws
//     there itself; Ctrl+wheel always zooms
//   hold Space and drag, or drag with the middle button, anywhere over a node: the canvas moves under your hand
//   a sheet's empty paper drags the canvas too
//   pages inside a node (an iframe from the same server) get the same wheel and pan
// It's on in a workflow that has a "Zoom & Pan" node (its switches choose which parts) or a DPD sheet, and in every
// workflow with Settings → DPD Studio → Zoom & Pan everywhere. "All DPD Studio tools" off turns it off.
import { app } from "/scripts/app.js";

const TYPE = "Zoom & Pan", EVERY = "DPD.ZoomPan.Everywhere", ALL = "DPD.Studio.Enabled";
const PARTS = [["wheel", "Wheel zooms over nodes"], ["pan", "Space or middle-drag pans"], ["frames", "Pages inside nodes too"]];
const setting = id => app.extensionManager?.setting?.get?.(id);
// which parts are on in the workflow showing now
function on(part) {
  if (setting(ALL) === false) return false;
  if (setting(EVERY) === true) return true;
  const nodes = app.graph?._nodes || [], zp = nodes.find(n => n.type === TYPE);
  if (zp) return zp.properties?.[part] !== false;
  return nodes.some(n => /^DPD /.test(n.type || ""));   // DPD sheets have always had it
}
const typing = d => { const a = d.activeElement; return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
// can this element (or one above it, up to the node) scroll the way the wheel goes?
function scrolls(t, stop, e, win = window) {
  if (e.ctrlKey) return false;
  for (let el = t; el && el !== stop && el.nodeType === 1; el = el.parentElement) {
    if (el.tagName === "SELECT" && el.ownerDocument.activeElement === el) return true;
    const s = win.getComputedStyle(el), root = el === el.ownerDocument.documentElement || el === el.ownerDocument.body;
    const y = (root || /(auto|scroll)/.test(s.overflowY)) && el.scrollHeight > el.clientHeight + 1, x = (root || /(auto|scroll)/.test(s.overflowX)) && el.scrollWidth > el.clientWidth + 1;
    if (y && (e.deltaY > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : e.deltaY < 0 && el.scrollTop > 0)) return true;
    if (x && e.shiftKey) return true;
  }
  return false;
}
// move the canvas by a screen distance
const panBy = (dx, dy) => { const c = app.canvas, k = c.ds.scale || 1; c.ds.offset[0] += dx / k; c.ds.offset[1] += dy / k; c.setDirty(true, true); };
function drag(e, from) {
  e.preventDefault(); e.stopPropagation(); e.__dpdPan = true;
  let x = e.clientX, y = e.clientY; const cur = document.body.style.cursor; document.body.style.cursor = "grabbing";
  const mv = m => { panBy(m.clientX - x, m.clientY - y); x = m.clientX; y = m.clientY; };
  const up = () => { from.removeEventListener("pointermove", mv, true); from.removeEventListener("pointerup", up, true); document.body.style.cursor = cur; };
  from.addEventListener("pointermove", mv, true); from.addEventListener("pointerup", up, true);
}
// a sheet's own empty paper (DPD sheets and studio faces)
const paper = t => !!t.closest(".dpd-drop") && t.matches(".paper, .page, .dpd-in, .dpd-drop, .blank, .grpbox")
  || !!t.closest(".sfon") && t.matches(".sf, .sf-top, .sf-name, .sf-name *, .sf-sp, .dscroll, .dstory, .dmon, .dside, .kf, .krow");

function install() {
  if (window.__dpdZoomPan) return; window.__dpdZoomPan = true;
  addEventListener("wheel", e => {
    const c = app.canvas?.canvas, t = e.target;
    if (e.defaultPrevented || e.__dpd || !c || !(t instanceof Element) || t === c || !t.closest(".dom-widget") || !on("wheel")) return;
    if (t.tagName === "CANVAS" || t.tagName === "VIDEO" ? !e.ctrlKey : scrolls(t, t.closest(".dom-widget"), e)) return;
    e.preventDefault();
    const f = new WheelEvent("wheel", e); f.__dpd = true; c.dispatchEvent(f);
  }, { passive: false });
  let space = false;
  addEventListener("keydown", e => { if (e.code === "Space" && !typing(document)) space = true; }, true);
  addEventListener("keyup", e => { if (e.code === "Space") space = false; }, true);
  addEventListener("blur", () => { space = false; });
  addEventListener("mousedown", e => { if (e.button === 1 && e.target instanceof Element && e.target.closest(".dom-widget") && on("pan")) e.preventDefault(); }, true);   // no auto-scroll arrows
  addEventListener("pointerdown", e => {
    const t = e.target; if (e.__dpdPan || !app.canvas || !(t instanceof Element) || !t.closest(".dom-widget")) return;
    if (e.button === 1 || (e.button === 0 && space)) { if (on("pan")) drag(e, window); }
    else if (e.button === 0 && paper(t) && on("pan")) drag(e, window);
  }, true);
  // pages inside a node: hooked the first time the pointer comes over them
  addEventListener("pointerover", e => { const f = e.target; if (f instanceof HTMLIFrameElement && f.closest(".dom-widget")) frame(f); }, true);
}
// a page in a frame: the same wheel and pan, measured on the screen since the frame moves with the canvas
function frame(f) {
  let w, d; try { w = f.contentWindow; d = f.contentDocument; } catch { return; }
  if (!w || !d || w.__dpdCanvas) return; w.__dpdCanvas = true;
  w.addEventListener("wheel", e => {
    const c = app.canvas?.canvas; if (e.defaultPrevented || !c || !on("frames") || !on("wheel")) return;
    for (let el = e.target; !e.ctrlKey && el && el.nodeType === 1; el = el.parentElement) if (/^(CANVAS|VIDEO|IFRAME)$/.test(el.tagName)) return;
    if (scrolls(e.target, null, e, w)) return;
    e.preventDefault();
    const r = f.getBoundingClientRect(), k = r.width / (f.offsetWidth || 1);
    c.dispatchEvent(new WheelEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, clientX: r.left + e.clientX * k, clientY: r.top + e.clientY * k, bubbles: true, cancelable: true }));
  }, { passive: false });
  let space = false;
  w.addEventListener("keydown", e => { if (e.code === "Space" && !typing(d) && on("frames") && on("pan")) { space = true; e.preventDefault(); } }, true);
  w.addEventListener("keyup", e => { if (e.code === "Space") space = false; }, true);
  w.addEventListener("blur", () => { space = false; });
  w.addEventListener("mousedown", e => { if (e.button === 1 && on("frames") && on("pan")) e.preventDefault(); }, true);
  w.addEventListener("pointerdown", e => {
    if (!(e.button === 1 || (e.button === 0 && space)) || !on("frames") || !on("pan")) return;
    e.preventDefault(); e.stopPropagation(); try { e.target.setPointerCapture?.(e.pointerId); } catch {}
    let x = e.screenX, y = e.screenY;   // on the screen: the frame moves as the canvas does
    const mv = m => { panBy(m.screenX - x, m.screenY - y); x = m.screenX; y = m.screenY; };
    const up = () => { w.removeEventListener("pointermove", mv, true); w.removeEventListener("pointerup", up, true); };
    w.addEventListener("pointermove", mv, true); w.addEventListener("pointerup", up, true);
  }, true);
}

function addNode() {
  const g = app.graph, had = (g?.nodes || []).find(n => n.type === TYPE), n = had || LiteGraph.createNode(TYPE);
  if (!had) { const c = app.canvas, ds = c.ds, el = c.canvas; n.pos = [el.width / 2 / ds.scale - ds.offset[0] - n.size[0] / 2, el.height / 2 / ds.scale - ds.offset[1] - n.size[1] / 2]; g.add(n); }
  app.canvas.selectNode(n, false); app.canvas.setDirty(true, true);
}

app.registerExtension({
  name: "DPD.Studio.ZoomPan",
  settings: [{ id: EVERY, category: ["DPD Studio", "Zoom & Pan", "Everywhere"], name: "Zoom & Pan in every workflow", type: "boolean", defaultValue: false, tooltip: "On: the wheel zooms and Space or middle-drag pans over big nodes in every workflow, with no Zoom & Pan node needed. Off: only in workflows with a Zoom & Pan node or a DPD sheet." }],
  commands: [{ id: "DPD.Studio.AddZoomPan", label: "DPD Studio: add the Zoom & Pan node", menubarLabel: "Add Zoom & Pan", icon: "pi pi-arrows-alt", function: addNode }],
  menuCommands: [{ path: ["DPD Studio"], commands: ["DPD.Studio.AddZoomPan"] }],
  setup() { install(); },
  registerCustomNodes() {
    class ZoomPanNode extends LGraphNode {
      constructor(t) {
        super(t);
        this.isVirtualNode = true; this.serialize_widgets = false;
        this.color = "#1f3a29"; this.bgcolor = "#17151d";
        for (const [k, label] of PARTS) { this.properties[k] ??= true; this.addWidget("toggle", label, true, v => { this.properties[k] = v; }, { on: "on", off: "off" }); }
        this.size = [300, 110];
      }
      onConfigure() { PARTS.forEach(([k], i) => { if (this.widgets?.[i]) this.widgets[i].value = this.properties?.[k] !== false; }); }
    }
    ZoomPanNode.title = TYPE;
    ZoomPanNode.category = "utils";
    ZoomPanNode.description = "Keeps zooming and panning the canvas while the pointer is over a big node (sheets, timelines, players, editors): the wheel zooms, Space or middle-drag pans. Nothing runs on the server.";
    if (!LiteGraph.registered_node_types[TYPE]) LiteGraph.registerNodeType(TYPE, ZoomPanNode);
  },
});
