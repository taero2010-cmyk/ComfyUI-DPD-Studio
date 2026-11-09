// DPD Studio System Check: the Loader page's system check and self-test as a ComfyUI node. It reads this machine (GPU,
// its memory, RAM, disk, driver, CUDA, the attention in use) and recommends settings for the models in the workflow
// (picture size, steps, CFG, pictures per run, weight precision), each with its reason. ▶ Run test renders the
// workflow a few times at growing sizes (as previews: nothing is saved, and none of its settings change), times each
// one and watches the GPU's memory, then recommends the biggest size that ran safely and quickly. "Use these" puts
// the recommendation into the workflow, with Undo. On a Drop or Blank Sheet it is a card of its own, and the
// sheet's gear can add it.
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DPD System Check";
const GB = b => Math.round((b || 0) / 2 ** 30 * 10) / 10;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const wOf = (n, name) => n?.widgets?.find(w => w.name === name);
const graph = () => app.graph;
const changed = () => { try { graph()?.change?.(); app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch {} };
function setW(n, name, v) { const w = wOf(n, name); if (!w) return; w.value = v; w.callback?.(v, app.canvas, n); graph().setDirtyCanvas(true, true); }

const css = document.createElement("style");
css.textContent = `
.dsc{--ok:#3fbf7a;--warn:#e0a43c;font:12.5px/1.45 var(--fl,Karla),system-ui,sans-serif;color:var(--ink,#e9e6ef);box-sizing:border-box;display:flex;flex-direction:column;gap:8px}
.dsc *{box-sizing:border-box}
.dsc .chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:5px}
.dsc .chip{display:flex;flex-direction:column;padding:5px 9px;border-radius:8px;background:var(--field,rgba(255,255,255,.05));border:1px solid var(--edge2,#3a3644)}
.dsc .chip i{font:800 9px var(--fl,Karla);letter-spacing:.12em;text-transform:uppercase;font-style:normal;color:var(--mute,#9a94a8)}
.dsc .chip b{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsc .chip b::before{content:"● ";color:var(--ok)}.dsc .chip.warn b::before{color:var(--warn)}
.dsc h5{margin:4px 0 0;font:800 10px var(--fl,Karla);letter-spacing:.13em;text-transform:uppercase;color:var(--title,#e8b64c)}
.dsc .rec{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;align-items:baseline}
.dsc .rec b{font-weight:700;white-space:nowrap}.dsc .rec span{color:var(--mute,#9a94a8);font-size:11.5px}
.dsc .rec .v{color:var(--ink,#fff);font-weight:600;font-size:12.5px}
.dsc .acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.dsc button{border:1px solid var(--edge,#3a3644);background:var(--s1,rgba(255,255,255,.05));color:var(--ink2,#e9e6ef);border-radius:999px;padding:5px 12px;font:700 11px var(--fl,Karla);cursor:pointer}
.dsc button.dgo{background:var(--title,#e8b64c);color:#fff;border-color:transparent}.dsc button[disabled]{opacity:.5;cursor:wait}
.dsc .tests{display:flex;flex-direction:column;gap:3px}
.dsc .t{display:grid;grid-template-columns:18px 92px 1fr auto;gap:8px;align-items:center;padding:4px 8px;border-radius:7px;background:var(--field,rgba(255,255,255,.04));font-size:12px}
.dsc .t .bar{height:5px;border-radius:3px;background:var(--edge2,#3a3644);overflow:hidden}.dsc .t .bar u{display:block;height:100%;background:var(--ok)}
.dsc .t.bad .bar u{background:#e0564f}.dsc .t.best{outline:1.5px solid var(--ok)}
.dsc .note{color:var(--mute,#9a94a8);font-size:11.5px}.dsc .msg{font-weight:600}
.dsc label.auto{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mute,#9a94a8);cursor:pointer}.dsc label.auto input{accent-color:var(--title,#e8b64c);width:auto;flex:none;margin:0;padding:0}`;
document.head.appendChild(css);

// ---- reading the machine
async function machine() {
  const [s, f] = await Promise.all([api.fetchApi("/system_stats").then(r => r.json()).catch(() => ({})), api.fetchApi("/dpd/system").then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
  const dev = (s.devices || [])[0] || {}, sys = s.system || {};
  return {
    gpu: (f.gpu || (dev.name || "").replace(/^cuda:\d+ /, "").replace(/ : .*/, "")).replace(/^NVIDIA (GeForce )?/, ""),
    vram: dev.vram_total || 0, vramFree: dev.vram_free || 0, ram: sys.ram_total || 0, ramFree: sys.ram_free || 0,
    disk: f.disk, driver: f.driver, cuda: f.cuda || (sys.pytorch_version || "").split("+cu")[1], torch: (sys.pytorch_version || "").split("+")[0],
    attention: (sys.argv || []).includes("--use-ck-attention") || f.comfy_kitchen ? "comfy kitchen" + (f.sageattention ? " · Sage" : "") : f.sageattention ? "Sage" : "PyTorch SDPA",
  };
}

// ---- what the workflow (or its sheet) is made of: the models, the size node, the samplers
function parts(node) {
  const sheet = sheetFor(node);
  const nodes = sheet ? sheet.parts().map(id => graph().getNodeById(id)).filter(Boolean) : graph()._nodes;
  const size = nodes.find(n => wOf(n, "width") && wOf(n, "height") && (n.outputs || []).some(o => o.type === "LATENT"));
  const samplers = nodes.filter(n => wOf(n, "steps") && (n.outputs || []).some(o => o.type === "LATENT"));
  const files = nodes.flatMap(n => ["ckpt_name", "unet_name", "model_name"].map(k => wOf(n, k)?.value).filter(Boolean));
  const unet = nodes.find(n => wOf(n, "weight_dtype"));
  return { sheet, nodes, size, samplers, files, unet };
}
const sheetFor = node => { const id = node.properties?.["DPD sheet"]; const s = id != null && graph().getNodeById(id); return s && typeof s.parts === "function" ? s : null; };

// the model family, from its file name, and what it likes
function family(files) {
  const f = files.join(" ").toLowerCase();
  const turbo = /turbo|lightning|schnell|hyper|lcm|distill|fast/.test(f);
  if (/z[_-]?image/.test(f)) return { name: "Z-Image", base: 1024, steps: turbo ? 8 : 28, cfg: turbo ? 1 : 4, turbo };
  if (/flux|klein/.test(f)) return { name: "Flux", base: 1024, steps: turbo ? 4 : 24, cfg: 1, turbo };
  if (/qwen/.test(f)) return { name: "Qwen Image", base: 1024, steps: turbo ? 8 : 24, cfg: turbo ? 1 : 3.5, turbo };
  if (/sd3|sd_3|stable.?diffusion.?3/.test(f)) return { name: "SD 3.5", base: 1024, steps: turbo ? 6 : 28, cfg: turbo ? 1 : 4.5, turbo };
  if (/xl|pony|illustrious|noob/.test(f)) return { name: "SDXL", base: 1024, steps: turbo ? 6 : 28, cfg: turbo ? 1.5 : 6, turbo };
  if (/v1-5|sd15|1\.5|realistic|dreamshaper(?!.*xl)/.test(f)) return { name: "SD 1.5", base: 640, steps: turbo ? 6 : 25, cfg: turbo ? 1.5 : 7, turbo };
  return { name: files.length ? "this model" : "no model yet", base: 1024, steps: turbo ? 8 : 24, cfg: turbo ? 1 : 5, turbo };
}

// the advice: [label, value, why, apply?]
function advise(M, P) {
  const vr = M.vram / 2 ** 30, fam = family(P.files), out = [];
  const big = vr >= 22 ? 1.5 : vr >= 15 ? 1.25 : vr >= 11 ? 1 : vr >= 7 ? 0.85 : 0.75;
  const side = Math.round(fam.base * big / 64) * 64;
  const cur = P.size ? [wOf(P.size, "width").value, wOf(P.size, "height").value] : [1024, 1024];
  const k = Math.sqrt(side * side / (cur[0] * cur[1]));   // keep the shape you chose, change only how big
  const W = Math.max(256, Math.round(cur[0] * k / 64) * 64), H = Math.max(256, Math.round(cur[1] * k / 64) * 64);
  if (P.size) out.push(["Picture size", `${W} × ${H}`, `${fam.name} is made for about ${fam.base}², and ${Math.round(vr)} GB of video memory ${big >= 1.25 ? "has room for more" : big < 1 ? "is happier a little smaller" : "fits it well"}. Your shape is kept.`, { size: [W, H] }]);
  if (P.samplers.length) out.push(["Steps", `${fam.steps}`, fam.turbo ? "a fast (turbo) model: more steps add little" : `${fam.name} usually settles by ${fam.steps}`, { steps: fam.steps }]);
  if (P.samplers.length && wOf(P.samplers[0], "cfg")) out.push(["CFG", `${fam.cfg}`, fam.turbo || fam.cfg === 1 ? "this model is made to run at 1" : `the usual sweet spot for ${fam.name}`, { cfg: fam.cfg }]);
  if (P.size && wOf(P.size, "batch_size")) { const b = vr >= 22 ? 2 : 1; out.push(["Pictures per run", `${b}`, b > 1 ? "plenty of memory: two at once costs little extra time" : "one at a time is quickest on this card", { batch: b }]); }
  if (P.unet) { const fp = String(P.files.join(" ")).match(/int8|fp8|nvfp4|gguf|q\d/i); out.push(["Weights", fp ? fp[0].toUpperCase() : vr <= 16 ? "fp8_e4m3fn" : "default", fp ? "already a small, fast version of the model" : vr <= 16 ? "halves the model's memory on a 16 GB card, almost no visible change" : "full precision fits", !fp && vr <= 16 && (wOf(P.unet, "weight_dtype")?.options?.values || []).includes("fp8_e4m3fn") ? { dtype: "fp8_e4m3fn" } : null]); }
  out.push(["Attention", M.attention, /kitchen|Sage/.test(M.attention) ? "a fast kernel is already on" : "adding SageAttention would speed things up", null]);
  return out;
}

class SystemCheck extends LGraphNode {
  constructor(t) {
    super(t || "System Check");
    this.isVirtualNode = true; this.serialize_widgets = false;
    this.properties = { results: null, auto: false };
    this.color = "#2a3a2f"; this.bgcolor = "#17151d";
    this.el = document.createElement("div"); this.el.className = "dsc";
    this.addDOMWidget("syscheck", "dpd-syscheck", this.el, { serialize: false, hideOnZoom: false, getMinHeight: () => 220 });
    this.el.addEventListener("click", e => this.click(e));
    this.el.addEventListener("change", e => { if (e.target.matches("[data-auto]")) { this.properties.auto = e.target.checked; changed(); } });
    this.size = [420, 420];
    setTimeout(() => this.scan(), 0);
  }
  async scan() { this.M = await machine(); this.paint(); }
  paint() {
    const M = this.M; if (!M) { this.el.innerHTML = `<div class="note">Reading this machine…</div>`; return; }
    const P = parts(this), A = advise(M, P), R = this.properties.results, vr = M.vram / 2 ** 30;
    const chip = (i, b, ok = true) => `<div class="chip ${ok ? "" : "warn"}"><i>${i}</i><b title="${esc(b)}">${esc(b)}</b></div>`;
    this.el.innerHTML = `<div class="chips">${chip("Graphics", `${M.gpu} · ${GB(M.vram)} GB`, vr >= 8)}${chip("Memory", `${GB(M.ram)} GB · ${GB(M.ramFree)} free`, M.ram > 15e9)}${M.disk ? chip(`Disk ${M.disk.drive}`, `${GB(M.disk.free)} GB free`, M.disk.free > 50e9) : ""}${M.driver ? chip("Driver", M.driver) : ""}${chip("CUDA · PyTorch", `${M.cuda || "?"} · ${M.torch || "?"}`)}${chip("Attention", M.attention, /kitchen|Sage/.test(M.attention))}</div>
      <h5>Recommended for this machine${P.files.length ? ` · ${esc(family(P.files).name)}` : ""}</h5>
      <div class="rec">${A.map(([l, v, why]) => `<b>${esc(l)}</b><div><span class="v">${esc(v)}</span> <span>${esc(why)}</span></div>`).join("")}</div>
      ${R?.tests?.length ? `<h5>Test run · ${esc(R.when || "")}</h5><div class="tests">${R.tests.map(t => `<div class="t ${t.err ? "bad" : ""} ${R.best === t.label ? "best" : ""}"><span>${t.err ? "✕" : R.best === t.label ? "✓" : "·"}</span><b>${esc(t.label)}</b><div class="bar" title="video memory in use (models included)"><u style="width:${Math.min(100, Math.round((t.peak || 0) / M.vram * 100))}%"></u></div><span title="${t.total ? `${t.total.toFixed(1)} s in all, loading included` : ""}">${t.err ? esc(t.err) : `${t.secs.toFixed(1)} s painting · ${GB(t.peak)} GB in use`}</span></div>`).join("")}</div>${R.best ? `<div class="note">The biggest size that ran safely and quickly here: <b>${esc(R.best)}</b>.</div>` : ""}` : ""}
      <div class="acts"><button class="dgo" data-use ${P.size || P.samplers.length ? "" : "disabled"} title="Put the recommended settings into ${P.sheet ? "this sheet" : "this workflow"}">Use these settings</button><button data-test ${this.testing ? "disabled" : ""} title="Renders a few quick previews at growing sizes (nothing is saved) and times them">${this.testing ? "Testing…" : "▶ Run test"}</button><button data-rescan title="Read the machine again">↻</button>${this.undo ? `<button data-undo>Undo</button>` : ""}<label class="auto"><input type="checkbox" data-auto ${this.properties.auto ? "checked" : ""}>use the test's results automatically</label></div>
      ${this.msg ? `<div class="msg">${esc(this.msg)}</div>` : ""}`;
    this.adv = A; this.P = P;
    const sh = sheetFor(this); if (sh?.place) requestAnimationFrame(() => sh.place());   // on a sheet, its card makes room
  }
  click(e) {
    const q = s => e.target.closest(s);
    if (q("[data-rescan]")) return this.scan();
    if (q("[data-use]")) return this.use();
    if (q("[data-undo]")) { for (const [n, k, v] of this.undo) setW(n, k, v); this.undo = null; this.msg = "Back as it was."; changed(); this.repaintSheet(); return this.paint(); }
    if (q("[data-test]") && !this.testing) return this.test();
  }
  use(size) {
    if (!size && this.properties.results?.best) size = this.properties.results.best.split(" × ").map(Number);   // the test knows better than the rule of thumb
    const P = parts(this), undo = [], put = (n, k, v) => { const w = wOf(n, k); if (!w || w.value === v) return; undo.push([n, k, w.value]); setW(n, k, v); };
    for (const [, , , a] of this.adv || []) {
      if (!a) continue;
      if (a.size && P.size) { const [W, H] = size || a.size; put(P.size, "width", W); put(P.size, "height", H); }
      if (a.steps) P.samplers.forEach(s => put(s, "steps", a.steps));
      if (a.cfg != null) P.samplers.forEach(s => put(s, "cfg", a.cfg));
      if (a.batch && P.size) put(P.size, "batch_size", a.batch);
      if (a.dtype && P.unet) put(P.unet, "weight_dtype", a.dtype);
    }
    this.undo = undo.length ? undo : null; this.msg = undo.length ? `${undo.length} setting${undo.length > 1 ? "s" : ""} changed for this machine.` : "Everything already fits this machine.";
    changed(); this.repaintSheet(); this.paint();
  }
  repaintSheet() { const s = sheetFor(this); if (s) { s.render(); } }
  // renders the workflow at growing sizes as previews (SaveImage swapped for PreviewImage, a fresh seed each time)
  async test() {
    const P = parts(this); if (!P.size || !P.samplers.length) { this.msg = "The test needs a picture size node and a sampler."; return this.paint(); }
    const q = await api.fetchApi("/queue").then(r => r.json()).catch(() => ({}));
    if ((q.queue_running || []).length || (q.queue_pending || []).length) { this.msg = "Something is already rendering: run the test when the queue is empty."; return this.paint(); }
    this.testing = true; this.msg = ""; const M = this.M = await machine(); const vr = M.vram / 2 ** 30;
    const cur = [wOf(P.size, "width").value, wOf(P.size, "height").value], area = Math.sqrt(cur[0] * cur[1]);
    const sides = vr >= 22 ? [768, 1024, 1280, 1536] : vr >= 11 ? [768, 1024, 1280] : [512, 768, 1024];
    const R = this.properties.results = { tests: [], when: new Date().toLocaleString(), best: null }; this.paint();
    const base = await app.graphToPrompt(), sid = String(P.size.id), samp = P.samplers.map(s => String(s.id));
    for (const side of sides) {
      const k = side / area, W = Math.round(cur[0] * k / 64) * 64, H = Math.round(cur[1] * k / 64) * 64, label = `${W} × ${H}`;
      const out = JSON.parse(JSON.stringify(base.output));
      for (const [id, n] of Object.entries(out)) {
        if (/^Save(Image|AnimatedWEBP|AnimatedPNG)$/.test(n.class_type)) { out[id] = { class_type: "PreviewImage", inputs: { images: n.inputs.images } }; }
        if (samp.includes(id)) { if ("seed" in n.inputs) n.inputs.seed = Math.floor(Math.random() * 1e9); if ("noise_seed" in n.inputs) n.inputs.noise_seed = Math.floor(Math.random() * 1e9); n.inputs.steps = Math.min(n.inputs.steps || 8, 8); }
        if (id === sid) { n.inputs.width = W; n.inputs.height = H; if ("batch_size" in n.inputs) n.inputs.batch_size = 1; }
      }
      const t = { label, side, secs: 0, peak: 0, err: null }; R.tests.push(t); this.paint();
      let peak = 0, stop = false; const poll = (async () => { while (!stop) { const s = await api.fetchApi("/system_stats").then(r => r.json()).catch(() => null); const d = s?.devices?.[0]; if (d) peak = Math.max(peak, d.vram_total - d.vram_free); await new Promise(r => setTimeout(r, 250)); } })();
      const t0 = performance.now(); let s0 = 0, s1 = 0;
      const ex = e => { const id = String(e.detail?.node ?? e.detail ?? ""); if (samp.includes(id)) { if (!s0) s0 = performance.now(); } else if (s0 && !s1) s1 = performance.now(); };
      api.addEventListener("executing", ex);
      try {
        const res = await api.queuePrompt(0, { output: out, workflow: base.workflow });
        const pid = res?.prompt_id;
        await new Promise((ok, bad) => {
          const done = e => { if (e.detail?.prompt_id && e.detail.prompt_id !== pid) return; off(); ok(); };
          const fail = e => { if (e.detail?.prompt_id && e.detail.prompt_id !== pid) return; off(); bad(new Error(e.detail?.exception_message || "it stopped")); };
          const off = () => { api.removeEventListener("execution_success", done); api.removeEventListener("execution_error", fail); api.removeEventListener("execution_interrupted", fail); };
          api.addEventListener("execution_success", done); api.addEventListener("execution_error", fail); api.addEventListener("execution_interrupted", fail);
        });
        t.total = (performance.now() - t0) / 1000; t.secs = s0 ? ((s1 || performance.now()) - s0) / 1000 : t.total;
      } catch (e) { t.err = /out of memory|OOM|CUDA/i.test(e.message) ? "ran out of memory" : String(e.message).slice(0, 60); }
      api.removeEventListener("executing", ex);
      stop = true; await poll; t.peak = peak; this.paint();
      if (t.err) break;   // it ran out of room: no bigger sizes
    }
    // the biggest size that painted without error and no more than 3.2× slower than the smallest (ComfyUI keeps models in
    // video memory, so how full it looks says little: running out is what counts)
    const okT = R.tests.filter(t => !t.err && t.secs <= (R.tests[0]?.secs || 1) * 3.2);
    const best = okT[okT.length - 1]; R.best = best?.label || null; this.testing = false;
    this.msg = best ? `Test done: ${best.label} is the sweet spot here (${best.secs.toFixed(1)} s of painting for ${Math.min(...P.samplers.map(s => wOf(s, "steps").value), 8)} steps). Press Use these settings to take it.` : "Test done: no size ran safely. Try a smaller model.";
    if (best && this.properties.auto) this.use(best.label.split(" × ").map(Number));
    changed(); this.paint();
  }
}
SystemCheck.title = "System Check";
SystemCheck.category = "DPD Studio";
SystemCheck.description = "Reads this machine and recommends settings for the workflow's models; ▶ Run test times a few quick renders and finds the biggest safe picture size.";

app.registerExtension({
  name: "DPD.Studio.SystemCheck",
  registerCustomNodes() { if (!LiteGraph.registered_node_types[TYPE]) LiteGraph.registerNodeType(TYPE, SystemCheck); },
});
setTimeout(function catchUp() { if (!window.LiteGraph || !app.graph) return setTimeout(catchUp, 500); if (!LiteGraph.registered_node_types[TYPE]) LiteGraph.registerNodeType(TYPE, SystemCheck); }, 2000);
