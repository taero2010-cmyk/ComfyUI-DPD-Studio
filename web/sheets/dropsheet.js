// DPD Studio Drop Sheet: a blank, beautiful page that becomes whatever you drop on it. It has zones, not wires:
// Loaders (models, CLIP, VAE, every LoRA, upscale and ControlNet models: one box, top left), Sampler, Prompt, Canvas
// (picture size, or the start picture for image to image), Pictures, a tile for every other step, and Results. Drop an
// ordinary ComfyUI node anywhere on the sheet and it goes to its zone; the zone grows and the others move around it.
// Zones are tiles you can drag to rearrange and make wide or narrow. Their order on the page is the order things
// happen in: two picture steps run in the order their tiles sit.
// The plumbing every image model needs (VAE Decode and Encode, an empty negative prompt, the start picture's loader)
// is made and wired out of sight; a drawer at the bottom shows it. A broken tile gets a red box saying what it needs,
// with a button that adds it. While it renders, the working tile glows and the sampler shows its progress.
// Absorbed nodes stay real ComfyUI nodes tucked under the paper, so the workflow runs exactly as if wired by hand;
// the sheet itself is a front-end node that never reaches the server.
// Image or Video: the same page for video turns Canvas into Frames (size and length, or Wan Image to Video), lets
// samplers stack (Wan 2.2: high noise, then low noise, in tile order), wires steps that take both prompts (LTX
// Conditioning, Wan Image to Video) into both, makes the video for Save Video itself, and plays results in place.
// It grows sideways as well as down: 2 columns for a few tiles, then 3 and 4 as it fills (or the number you pick),
// the sheet widening to match; wide tiles take two columns.
// Sheets wire together: every sheet has a "picture in" and a "picture out" socket. Wire one sheet's out to another's
// in (to as many as you like, in chains as long as you like) and the second starts from the first's finished picture:
// a Video sheet's start frame, an Image sheet's image to image, or any step that wants a picture.
// Its level switch: 1 · Simple (only what a first picture needs), 2 · Standard, 3 · Everything (every setting of every
// part, the hidden plumbing too).
import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const TYPE = "DPD Drop Sheet", FREE = "DPD Blank Sheet", SHEET = "DPD Sheet", KEY = "DPD sheet", W = 660;
// the sheets: the one DPD Sheet in the menu, and the older tiled Drop Sheet and Blank Sheet, kept so saved workflows open
const isSheet = n => !!n && (n.type === TYPE || n.type === FREE || n.type === SHEET);
const STREAM = ["MODEL", "CLIP", "VAE", "CONDITIONING", "LATENT", "IMAGE"];
const ZONES = {   // id: [name, icon, empty hint, required, wide]
  loaders: ["Loaders", "box", "drop model, CLIP, VAE, LoRA, upscale or ControlNet loaders here", true, false],
  sampler: ["Sampler", "dial", "drop a KSampler here", true, false],
  prompt: ["Prompt", "quote", "drop a CLIP Text Encode here (a second becomes what to avoid)", true, true],
  canvas: ["Canvas", "aspect", "drop an Empty Latent Image here", true, false],
  pictures: ["Pictures", "photo", "drop Load Image nodes here", false, false],
  results: ["Results", "spark", "drop a Save Image or Preview Image here", true, true],
  flow: ["Run flow", "dial", "drop a Comfy Blueprint here", false, false],
  system: ["System", "layers", "drop a System Check here", false, false],
};
const START_ORDER = ["loaders", "sampler", "prompt", "canvas", "pictures", "results", "flow", "system"];
const NEED = { MODEL: ["CheckpointLoaderSimple", "Load Checkpoint"], CLIP: ["CLIPLoader", "Load CLIP"], VAE: ["VAELoader", "Load VAE"], CONDITIONING: ["CLIPTextEncode", "CLIP Text Encode"], LATENT: ["EmptyLatentImage", "Empty Latent Image"],
  IMAGE: ["LoadImage", "Load Image"], MASK: ["LoadImageMask", "Load Image (as Mask)"], UPSCALE_MODEL: ["UpscaleModelLoader", "Load Upscale Model"], CONTROL_NET: ["ControlNetLoader", "Load ControlNet Model"],
  CLIP_VISION: ["CLIPVisionLoader", "Load CLIP Vision"], STYLE_MODEL: ["StyleModelLoader", "Load Style Model"] };
// the sheet's look: paper and accent colours, corners and spacing (presets, or any colour)
const PAPERS = [["#1e1825", "Plum"], ["#121826", "Midnight"], ["#13201a", "Forest"], ["#21180f", "Espresso"], ["#1c1f24", "Slate"], ["#2a1820", "Rose"], ["#f3eee4", "Paper"], ["#eef2f6", "Cloud"]];
const ACCENTS = [["#e8b64c", "Gold"], ["#3fbf8a", "Emerald"], ["#5aa9ff", "Sky"], ["#ff7a59", "Coral"], ["#a98bff", "Violet"], ["#c9ccd6", "Silver"]];
const hexRgb = h => { const m = /^#?([\da-f]{6})$/i.exec(h || ""); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [30, 24, 37]; };
const mixHex = (a, b, k) => "#" + hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * k).toString(16).padStart(2, "0")).join("");
const light = h => { const [r, g, b] = hexRgb(h); return (r * .299 + g * .587 + b * .114) / 255 > .55; };
const FONTS = [["", "Designed mix"], ["Atkinson Hyperlegible", "Atkinson (easiest to read)"], ["Lexend", "Lexend (easy to read)"], ["Inter", "Inter"], ["Nunito", "Nunito (rounded)"], ["Lora", "Lora (serif)"], ["Fraunces", "Fraunces (serif)"], ["JetBrains Mono", "JetBrains Mono"]];
const ICON = {
  power: '<path d="M12 3v8"/><path d="M6.3 7.2a8 8 0 1 0 11.4 0"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>', layers: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>',
  quote: '<path d="M9 7H5v6h4l-2 4"/><path d="M19 7h-4v6h4l-2 4"/>', aspect: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4h3M17 14v-4h-3"/>',
  dial: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 18l6-5 4 3 3-2 5 4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>', check: '<path d="M5 12l4 4 10-10"/>', spark: '<path d="M12 3l1.8 5.6L19.5 10l-5.7 1.5L12 17l-1.8-5.5L4.5 10l5.7-1.4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', drop: '<path d="M12 3c3.5 4.5 6 7.7 6 10.5a6 6 0 0 1-12 0C6 10.7 8.5 7.5 12 3z"/>', grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  wide: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>', pipe: '<path d="M4 8h6a4 4 0 0 1 4 4v0a4 4 0 0 0 4 4h2"/><circle cx="4" cy="8" r="1.5"/><circle cx="20" cy="16" r="1.5"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>', eye: '<path d="M13.5 6.5l4 4M4 20l1.2-4.2 9.6-9.6a2.3 2.3 0 0 1 3.3 3.3l-9.6 9.6z"/><path d="M15.5 4.5l4 4"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  paint: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
};
const toHex = c => { c = String(c || "").trim(); if (/^#[\da-f]{6}$/i.test(c)) return c; if (/^#[\da-f]{3}$/i.test(c)) return "#" + [...c.slice(1)].map(x => x + x).join(""); const m = c.match(/\d+(\.\d+)?/g); return m && m.length >= 3 ? "#" + m.slice(0, 3).map(v => Math.round(+v).toString(16).padStart(2, "0")).join("") : "#888888"; };
const picUrl = v => { const i = String(v).lastIndexOf("/"); return api.apiURL(`/view?filename=${encodeURIComponent(i < 0 ? v : v.slice(i + 1))}&subfolder=${encodeURIComponent(i < 0 ? "" : v.slice(0, i))}&type=input`); };
async function pickPic() {
  const f = await new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.onchange = () => res(i.files[0]); i.click(); }); if (!f) return null;
  const fd = new FormData(); fd.append("image", f, f.name); fd.append("subfolder", "dpd_sheet"); fd.append("overwrite", "true");
  const r = await api.fetchApi("/upload/image", { method: "POST", body: fd }).then(x => x.json());
  return r.subfolder ? `${r.subfolder}/${r.name}` : r.name;
}
const svg = (k, s = 14) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- where a node belongs, from what it gives and takes
// skins for views we know: [what the view is, the dials that dress it in the sheet's colours]. A view we don't know
// keeps its own look inside the card's frame.
const SKINS = [
  [".slx", "Ultimate LTX Director", `--page:var(--bgA);--glow1:color-mix(in srgb,var(--gold) 10%,transparent);--glow2:color-mix(in srgb,var(--title) 8%,transparent);--glow3:transparent;
    --in-a:color-mix(in srgb,var(--t1) 92%,#fff);--in-b:var(--t2);--in-hi:color-mix(in srgb,var(--gold) 8%,transparent);
    --edge:linear-gradient(135deg,var(--clipEdge,#7a6445),color-mix(in srgb,var(--clipEdge,#7a6445) 35%,transparent));
    --text:var(--ink);--text2:var(--ink2);--text3:var(--mute);
    --glass:color-mix(in srgb,#fff 34%,transparent);--glass2:color-mix(in srgb,#fff 48%,transparent);--glass3:color-mix(in srgb,#fff 60%,transparent);
    --stroke:color-mix(in srgb,var(--ink) 12%,transparent);--stroke2:color-mix(in srgb,var(--ink) 20%,transparent);
    --well:color-mix(in srgb,var(--ink) 6%,transparent);--field:color-mix(in srgb,#fff 62%,var(--bgA));
    --ac:var(--acRGB);--ac2:var(--titleRGB);--on:#fff;--brand:linear-gradient(100deg,var(--title) 0%,var(--gold) 100%);
    --shadow:0 20px 50px rgba(60,40,10,.22);--panel-shadow:0 12px 30px rgba(60,40,10,.18);--grain:transparent;--pattern:none;--ambient:.12;--menu:var(--t1);
    --ff:var(--fl,Karla),"Segoe UI",sans-serif;--fh:Fraunces,Georgia,serif`],
  // these paint with fixed colours, so they are re-inked: [what the view is, name, no dials, the class prefix of its rules]
  [".m3td", "MiniMax H3 Timeline Director", null, "m3td"],
  [".mmxd-wrapper, .mmxd-msel", "MiniMax H3 Director", null, "mmxd-"],
  [".pr-wrapper", "LTX Director timeline", null, "pr-"],
];
const skinOf = el => el && SKINS.find(([sel]) => el.matches(sel) || el.querySelector(sel));
const facesOf = n => (n?.widgets || []).filter(w => w.element && !w.element.classList?.contains("comfy-multiline-input") && !["clip", "blueprint", "syscheck"].includes(w.name)).map(w => w.element);
const faceOf = n => facesOf(n)[0] || null;
const skinFor = n => facesOf(n).map(skinOf).find(Boolean);
// re-inking: every colour a view's own rules and inline styles use goes into the sheet's by how light it is. Dark panels
// become paper (darker ones deeper), light words become ink, borders a faint ink line, and real colours keep their hue.
const COLOR_RE = /#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi, HAS_COLOR = /#[\da-f]{3,8}\b|rgba?\(/i;
const rgbaOf = c => {
  let m = /^#([\da-f]{3,8})$/i.exec(c.trim());
  if (m) { let h = m[1]; if (h.length < 6) h = [...h].map(x => x + x).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1); }
  m = /^rgba?\(([^)]+)\)$/i.exec(c.trim()); if (!m) return null;
  const v = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); return v.length >= 3 ? [v[0], v[1], v[2], v[3] ?? 1] : null;
};
const inkOf = (kind, c) => {
  const v = rgbaOf(c); if (!v) return c;
  const [r, g, b, a] = v, hi = Math.max(r, g, b) / 255, lo = Math.min(r, g, b) / 255, L = (hi + lo) / 2, S = hi === lo ? 0 : (hi - lo) / (1 - Math.abs(2 * L - 1));
  if (kind === "auto") kind = S > .3 ? "line" : L > .55 ? "text" : "surface";
  if (S > .3 && L > .12 && L < .92) return kind === "text" ? `color-mix(in srgb,${c} 62%,var(--ink))` : kind === "surface" && L < .36 ? `color-mix(in srgb,${c} 38%,var(--t1))` : c;
  const A = x => a < 1 ? `color-mix(in srgb,${x} ${Math.round(a * 100)}%,transparent)` : x;
  if (kind === "text") return A(L >= .8 ? "var(--ink)" : L >= .6 ? "var(--ink2)" : L >= .3 ? "var(--mute)" : L >= .15 ? "var(--mute2)" : "#fff");
  if (kind === "line") return `color-mix(in srgb,var(--ink) ${Math.round((10 + L * 40) * a)}%,transparent)`;
  if (a < .5) return L > .5 ? `color-mix(in srgb,var(--ink) ${Math.round(a * 100)}%,transparent)` : c;   // a white haze on dark is a faint shade on paper; black shades over pictures stay
  return L < .5 ? `color-mix(in srgb,var(--bgA),#fff ${Math.round(Math.min(75, Math.max(0, (L - .03) * 300)))}%)` : L > .85 ? "var(--ink2)" : "var(--mute)";
};
const kindOfProp = p => p.startsWith("--") ? (/text|muted|fg|ink/i.test(p) ? "text" : /line|stroke|border|edge/i.test(p) ? "line" : "auto")
  : /^(color|caret-color|fill|-webkit-text-fill-color)$/.test(p) ? "text" : /^(border|outline|stroke|column-rule)/.test(p) ? "line" : /^(background|accent-color)/.test(p) ? "surface" : null;
const reinkDecl = (p, v) => { if (p === "text-shadow") return "none"; const k = kindOfProp(p); if (!k || !HAS_COLOR.test(v)) return null; const nv = v.replace(COLOR_RE, c => inkOf(k, c)); return nv === v ? null : nv; };
const INK = { pre: new Set(), rules: [], seen: new Set(), inline: [], dirty: false };
const reinkRules = pre => {
  const out = [];
  for (const ss of document.styleSheets) {
    let rs; try { rs = ss.cssRules; } catch { continue; }
    for (const rl of rs) {
      const sel = rl.selectorText; if (!sel || !sel.includes("." + pre)) continue;
      const d = []; for (const pp of rl.style) { const nv = reinkDecl(pp, rl.style.getPropertyValue(pp)); if (nv) d.push(`${pp}:${nv}!important`); }
      if (d.length) out.push(`${sel.split(/,(?![^(]*\))/).map(x => `.dpd-drop .faceslot.skin ${x.trim()}`).join(",")}{${d.join(";")}}`);
    }
  }
  return out.join("\n");
};
const reinkInline = root => {
  for (const e of [root, ...root.querySelectorAll("[style]")]) {
    const st = e.getAttribute?.("style"); if (!st) continue;
    for (const part of st.split(";")) {
      const t = part.trim(); if (!t || t.includes('"') || INK.seen.has(t)) continue; INK.seen.add(t);
      const i = t.indexOf(":"), nv = i > 0 && reinkDecl(t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()); if (!nv) continue;
      const at = [`[style^="${t}"]`, `[style*="; ${t}"]`, `[style*=";${t}"]`].map(x => `.dpd-drop .faceslot.skin ${x}[style][style]`).join(",");
      INK.inline.push(`${at}{${t.slice(0, i).trim()}:${nv}!important}`); INK.dirty = true;
    }
  }
};
// a timeline drawn on a canvas: the colours it paints with pass through the same re-inking on their way in (pictures and
// video frames it draws are untouched). Only that canvas's own pen is wrapped, and unwrapped when the skin comes off.
const PEN = CanvasRenderingContext2D.prototype, PEN_D = { fillStyle: Object.getOwnPropertyDescriptor(PEN, "fillStyle"), strokeStyle: Object.getOwnPropertyDescriptor(PEN, "strokeStyle") };
const inked = new Set();
const realColor = (expr, slot) => {   // what a sheet colour works out to, in a form a canvas takes
  const pr = slot._dpdProbe || (slot._dpdProbe = Object.assign(document.createElement("i"), { hidden: true })); if (!pr.isConnected) slot.appendChild(pr);
  pr.style.color = ""; pr.style.color = expr; const c = getComputedStyle(pr).color, m = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/.exec(c);
  return m ? `rgba(${[m[1], m[2], m[3]].map(x => Math.round(Math.min(1, Math.max(0, +x)) * 255)).join(",")},${m[4] ?? 1})` : c;
};
const inkCanvas = (cv, slot) => {
  const ctx = cv.getContext("2d"); if (!ctx) return; const key = getComputedStyle(slot).getPropertyValue("--bgA") + getComputedStyle(slot).getPropertyValue("--ink");
  if (ctx._dpdInk && ctx._dpdInk.key === key) return;
  const memo = new Map(); ctx._dpdInk = { key, slot };
  for (const [k, d] of Object.entries(PEN_D)) Object.defineProperty(ctx, k, { configurable: true, get() { return d.get.call(this); },
    set(v) { if (typeof v === "string" && this._dpdInk) { let o = memo.get(v); if (o == null) { o = HAS_COLOR.test(v) ? realColor(v.replace(COLOR_RE, c => inkOf("auto", c)), this._dpdInk.slot) : v; memo.set(v, o); } v = o; } d.set.call(this, v); } });
  inked.add(cv); window.dispatchEvent(new Event("resize"));   // ask it to draw again
};
const unkCanvas = cv => { const ctx = cv.getContext("2d"); if (ctx?._dpdInk) { delete ctx.fillStyle; delete ctx.strokeStyle; ctx._dpdInk = null; window.dispatchEvent(new Event("resize")); } inked.delete(cv); };
const reinkTick = () => {
  for (const sl of document.querySelectorAll(".dpd-drop .faceslot.skin")) {
    for (const [sel, , , pre] of SKINS) if (pre && !INK.pre.has(pre) && sl.querySelector(sel)) { INK.pre.add(pre); INK.rules.push(reinkRules(pre)); INK.dirty = true; }
    reinkInline(sl);
    if (SKINS.some(([sel, , , pre]) => pre && sl.querySelector(sel))) for (const cv of sl.querySelectorAll("canvas")) inkCanvas(cv, sl);
  }
  for (const cv of [...inked]) if (!cv.closest(".dpd-drop .faceslot.skin")) unkCanvas(cv);
  if (!INK.dirty) return; INK.dirty = false;
  let st = document.getElementById("dpd-reink"); if (!st) { st = document.createElement("style"); st.id = "dpd-reink"; document.head.appendChild(st); }
  st.textContent = INK.rules.join("\n") + "\n" + INK.inline.join("\n");   // after the views' own rules; inline looks win over class looks, as they did
};
setInterval(reinkTick, 1200);   // views change their own looks as you use them (a selected clip, a toggled button)
const isPair = n => ["positive", "negative"].every(nm => n.inputs?.some(i => i.name === nm) && n.outputs?.some(o => o.name === nm));   // takes and gives both prompts
const outs = n => (n.outputs || []).map(o => o.type), ins = n => (n.inputs || []).filter(i => !i.widget).map(i => i.type);
function kindOf(n) {
  const t = n.comfyClass || n.type || "", o = outs(n), i = ins(n);
  if (n.type === "Comfy Blueprint") return "blueprint";
  if (n.type === "DPD System Check") return "syscheck";   // this machine and the settings it suits: a card of its own   // where the render is: a card of its own
  if (isSheet(n) || n.isVirtualNode || n.type === "DPD Image Sheet") return null;
  if (/^(SaveImage|PreviewImage|SaveVideo|PreviewVideo|SaveAnimatedWEBP|SaveAnimatedPNG|SaveWEBM)$/.test(t) || /VideoCombine/i.test(t) || ((i.includes("IMAGE") || i.includes("VIDEO")) && !o.length)) return "out";
  if (t === "CreateVideo") return "makevideo";
  if (t === "DPDTextClip") return "textclip";
  if (isPair(n) && o.includes("LATENT")) return "frames";                     // Wan Image to Video and friends
  if (t === "VAEDecode") return "decode";
  if (t === "VAEEncode") return "encode";
  if (o.includes("LATENT") && i.includes("MODEL")) return "sampler";
  if (o.includes("LATENT") && !i.some(x => STREAM.includes(x))) return "size";
  if (o.includes("CONDITIONING") && i.includes("CLIP") && i.length === 1) return "prompt";
  if (o.includes("MODEL") && i.includes("MODEL") && /lora/i.test(t)) return "lora";
  if (!i.some(x => STREAM.includes(x)) && (o.includes("MODEL") || o.includes("CLIP"))) return "model";
  if (o.length === 1 && o[0] === "VAE" && !i.length) return "vae";
  if (!i.length && o.includes("IMAGE")) return "picture";
  if (!i.some(x => STREAM.includes(x)) && o.length && !o.some(x => ["CONDITIONING", "LATENT", "IMAGE"].includes(x))) return "loader";   // models of any kind
  if (o.length || i.length) return "step";
  return null;
}
const ZONE_OF = { blueprint: "flow", syscheck: "system", model: "loaders", loader: "loaders", lora: "loaders", vae: "loaders", sampler: "sampler", prompt: "prompt", size: "canvas", frames: "canvas", picture: "pictures", out: "results" };
// a zone's name, icon and hint for this sheet's kind
const VIDEO_ZONES = { sampler: ["Samplers", "dial", "drop a sampler (Wan 2.2 takes two: high noise, then low noise)"], canvas: ["Frames", "aspect", "drop an empty video latent, or Wan Image to Video"],
  pictures: ["Start frame", "photo", "drop a Load Image for the first frame"], results: ["Results", "spark", "drop a Save Video or Video Combine here"] };
const zoneInfo = (z, kind) => kind === "video" && VIDEO_ZONES[z] ? [...VIDEO_ZONES[z], ...ZONES[z].slice(3)] : ZONES[z];
const graph = () => app.graph;
const byId = id => id == null ? null : graph()?.getNodeById(id);
const changed = () => { try { graph()?.change?.(); app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch {} };
const sheetOf = n => { const id = n?.properties?.[KEY]; const s = id != null && byId(id); return s && isSheet(s) ? s : null; };
const allSheets = () => (graph()?._nodes || []).filter(isSheet);
const wOf = (n, name) => n?.widgets?.find(w => w.name === name);
function setW(n, name, v) { const w = wOf(n, name); if (!w) return; w.value = v; w.callback?.(v, app.canvas, n); graph().setDirtyCanvas(true, true); }
function field(n, name, label, kind = "auto") {
  const w = wOf(n, name); if (!w) return "";
  const vals = w.options?.values, id = `${n.id}:${name}`;
  if (Array.isArray(vals)) return `<div class="f"><label>${esc(label)}</label><select data-w="${id}">${vals.map(v => `<option ${v === w.value ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>`;
  if (kind === "text") return `<textarea data-w="${id}" spellcheck="false">${esc(w.value)}</textarea>`;
  return `<div class="f"><label>${esc(label)}</label><input data-w="${id}" value="${esc(w.value)}"></div>`;
}
const inTn = (n, T) => n?.inputs?.some(i => i.type === T && !i.widget);
const allFields = (n, skip = []) => (n?.widgets || []).filter(w => w.name && w.type !== "button" && !skip.includes(w.name)).map(w => field(n, w.name, w.name.replace(/_/g, " "), w.options?.multiline || w.type === "customtext" ? "text" : "auto")).join("");
let VAE_FILES = null;
api.fetchApi("/object_info/VAELoader").then(r => r.json()).then(j => { VAE_FILES = j?.VAELoader?.input?.required?.vae_name?.[0] || []; allSheets().forEach(s => s.render()); }).catch(() => {});

// ---- the look
let dressed = false;
function dress() {
  if (dressed) return; dressed = true;
  const l = document.createElement("link"); l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Karla:wght@400;500;700;800&family=JetBrains+Mono:wght@400;500&family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;600&family=Inter:wght@400;600&family=Lora:wght@400;600&family=Nunito:wght@400;700&family=Share+Tech+Mono&display=swap";
  document.head.appendChild(l);
  const z = px => `calc(${px}px*var(--z,1))`;
  const css = document.createElement("style");
  css.textContent = `
.dpd-drop{--line:var(--edge);--red:#ff7a6b;box-sizing:border-box;width:100%;padding:12px 14px 14px;font-family:var(--fl,Karla),sans-serif;color:var(--ink);background:linear-gradient(180deg,var(--bgA),var(--bgB));border-radius:0 0 16px 16px}
.dpd-drop *{box-sizing:border-box}
.dpd-drop .hd{display:flex;align-items:center;gap:10px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--edge2)}
.dpd-drop .badge{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,var(--gold2),var(--gold));color:#2a1a00;flex:none}
.dpd-drop .t b{display:block;font:600 ${z(18)}/1.1 var(--fh,Fraunces),serif}
.dpd-drop .t small{font:500 ${z(10)} var(--fl,Karla);letter-spacing:.16em;color:var(--mute);text-transform:uppercase}
.dpd-drop .hd{flex-wrap:wrap}
.dpd-drop .typ{flex-basis:100%;margin-left:0;display:flex;align-items:center;gap:6px;font:500 ${z(10)} var(--fl,Karla);color:var(--mute);letter-spacing:.06em}
.dpd-drop .typ select{width:auto}.dpd-drop .typ input{width:80px}.dpd-drop .typ b{color:var(--gold);min-width:32px}
.dpd-drop .page{display:grid;grid-template-columns:repeat(var(--cols,2),minmax(0,1fr));gap:calc(10px*var(--dn,1));grid-auto-flow:row dense;min-height:120px;border-radius:12px;transition:outline-color .2s;outline:1.5px dashed transparent;outline-offset:4px}
.dpd-drop .page.hot{outline-color:var(--gold)}
.dpd-drop .tile{position:relative;border-radius:var(--r,12px);padding:calc(8px*var(--dn,1)) calc(10px*var(--dn,1)) calc(10px*var(--dn,1));background:linear-gradient(180deg,var(--t1),var(--t2));border:1px solid var(--edge);box-shadow:inset 3px 0 0 var(--gold),0 4px 12px rgba(0,0,0,.25);transition:border-color .2s,box-shadow .3s,transform .15s,opacity .15s}
.dpd-drop .tile.wide{grid-column:span 2}
.dpd-drop .typ .cols{display:flex;border:1px solid var(--edge);border-radius:999px;overflow:hidden;margin-left:6px}
.dpd-drop .typ .cols button{border:0;background:transparent;color:var(--mute);padding:3px 8px;font:700 ${z(10)} var(--fl,Karla);cursor:pointer}
.dpd-drop .typ .cols button.on{background:var(--gold);color:#201400}
.dpd-drop .tile.empty{background:rgba(255,255,255,.015);border:1.5px dashed var(--edge);box-shadow:none;padding:7px 10px}
.dpd-drop .tile.hot{border-color:var(--gold);background:color-mix(in srgb,var(--gold) 9%,transparent);transform:scale(1.01)}
.dpd-drop .tile.bad{border:1.5px solid var(--red);box-shadow:0 0 0 3px rgba(255,122,107,.15)}
.dpd-drop .tile.live{box-shadow:inset 3px 0 0 var(--gold),0 0 0 2px var(--gold),0 0 18px color-mix(in srgb,var(--gold) 55%,transparent)}
.dpd-drop .tile.drag{opacity:.4}.dpd-drop .tile.over{border-color:var(--gold);transform:translateY(3px)}
.dpd-drop .th{display:flex;align-items:center;gap:6px;font:800 ${z(11.5)} var(--fl,Karla);letter-spacing:.13em;color:var(--title,var(--gold));text-transform:uppercase}
.dpd-drop .tile.empty .th{color:var(--mute2)}
.dpd-drop .th .grip{cursor:grab;color:var(--mute2);display:flex;margin-left:-4px}.dpd-drop .th .grip:hover{color:var(--gold)}
.dpd-drop .th .sp{flex:1}
.dpd-drop .th button{background:none;border:0;color:var(--mute2);cursor:pointer;padding:1px;display:flex}.dpd-drop .th button:hover{color:var(--ink)}
.dpd-drop em{display:block;font:italic 400 ${z(12)}/1.35 var(--fh,Fraunces),serif;color:var(--mute2);margin-top:4px}
.dpd-drop .item{position:relative;margin-top:8px;padding-top:8px;border-top:1px solid var(--edge2)}
.dpd-drop .item:first-of-type{border-top:0;padding-top:2px}
.dpd-drop .item .nm{display:flex;align-items:center;gap:6px;font:600 ${z(11)} var(--fl,Karla);color:var(--ink2)}
.dpd-drop .item .nm .sp{flex:1}
.dpd-drop .item .nm button{background:none;border:0;color:var(--mute2);cursor:pointer;padding:1px;display:flex}.dpd-drop .item .nm button:hover{color:var(--ink)}
.dpd-drop .f{display:flex;gap:6px;margin-top:6px;align-items:center}
.dpd-drop .f label{font:500 ${z(10)} var(--fl,Karla);color:var(--mute);letter-spacing:.06em;white-space:nowrap;flex:none}
.dpd-drop select,.dpd-drop input,.dpd-drop textarea{width:100%;min-width:0;background:var(--s2);border:1px solid var(--line);border-radius:7px;padding:5px 8px;color:var(--ink);font:400 ${z(11.5)} var(--fm,"JetBrains Mono"),monospace;outline:none}
.dpd-drop select:focus,.dpd-drop input:focus,.dpd-drop textarea:focus{border-color:var(--gold)}
.dpd-drop textarea{font:400 ${z(13)}/1.45 var(--fh,Fraunces),serif;resize:vertical;min-height:58px;margin-top:6px}
.dpd-drop textarea.neg{min-height:34px;font-size:${z(12)}}
.dpd-drop input[type=range]{padding:0;border:0;background:none;accent-color:var(--gold)}
.dpd-drop .sub{font:400 ${z(10.5)} var(--fm,"JetBrains Mono"),monospace;color:var(--mute);margin-top:4px}
.dpd-drop .lab2{font:700 ${z(9.5)} var(--fl,Karla);letter-spacing:.14em;color:var(--mute2);text-transform:uppercase;margin-top:8px}
.dpd-drop .mode{display:flex;border:1px solid var(--edge);border-radius:999px;overflow:hidden;margin-top:6px}
.dpd-drop .mode button{flex:1;border:0;background:transparent;color:var(--mute);padding:5px 4px;font:700 ${z(10.5)} var(--fl,Karla);cursor:pointer}
.dpd-drop .mode button.on{background:linear-gradient(180deg,var(--gold2),var(--gold));color:#201400}
.dpd-drop .start{display:flex;gap:8px;margin-top:8px}.dpd-drop .start img,.dpd-drop .noimg{width:84px;height:84px;object-fit:cover;border-radius:8px;flex:none;background:repeating-linear-gradient(45deg,var(--s1) 0 10px,var(--t2) 10px 20px);display:flex;align-items:center;justify-content:center;color:var(--mute2);font:italic ${z(10.5)} var(--fh,Fraunces),serif;text-align:center}
.dpd-drop .start>div{flex:1;min-width:0}
.dpd-drop .pill{margin-top:6px;border:1px solid color-mix(in srgb,var(--gold) 60%,transparent);background:var(--s1);color:var(--gold);border-radius:999px;padding:4px 10px;font:700 ${z(10.5)} var(--fl,Karla);cursor:pointer;white-space:nowrap}
.dpd-drop .pill:hover{background:var(--gold);color:#201400}
.dpd-drop .pct{color:var(--gold);font:600 ${z(11)} var(--fl,Karla);min-width:34px;text-align:right}
.dpd-drop .need{display:flex;align-items:center;gap:7px;margin-top:7px;padding:6px 8px;border-radius:8px;background:rgba(255,122,107,.08);color:#ffb3a8;font:500 ${z(11)}/1.35 var(--fl,Karla)}
.dpd-drop .need svg{flex:none;color:var(--red)}.dpd-drop .need span{flex:1}
.dpd-drop .need button{flex:none;border:1px solid rgba(255,122,107,.6);background:var(--s1);color:#ffb3a8;border-radius:999px;padding:3px 9px;font:700 ${z(10.5)} var(--fl,Karla);cursor:pointer;white-space:nowrap}
.dpd-drop .need button:hover{background:var(--red);color:#2a0d08}
.dpd-drop .pics{display:grid;gap:6px;margin-top:8px}.dpd-drop .pics img{width:100%;border-radius:8px;display:block}
.dpd-drop .none{height:150px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--mute2);font:italic ${z(12)} var(--fh,Fraunces),serif;background:repeating-linear-gradient(45deg,var(--s1) 0 10px,var(--t2) 10px 20px);margin-top:8px}
.dpd-drop .bar{height:4px;border-radius:2px;background:var(--edge2);margin-top:8px;overflow:hidden;display:none}.dpd-drop .bar.on{display:block}.dpd-drop .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--gold),var(--gold2));transition:width .2s}
.dpd-drop .ok{display:flex;align-items:center;gap:7px;margin-top:10px;color:#7fd18b;font:500 ${z(11.5)} var(--fl,Karla)}
.dpd-drop .go:not(.dtc .go){margin-top:12px;width:100%;display:flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:999px;padding:10px;background:linear-gradient(180deg,var(--gold2),var(--gold));color:#201400;font:700 ${z(13)} var(--fl,Karla);cursor:pointer;box-shadow:0 6px 16px color-mix(in srgb,var(--gold) 25%,transparent)}
.dpd-drop .kind{display:flex;border:1px solid var(--edge);border-radius:999px;overflow:hidden;margin-left:auto}
.dpd-drop .kind button{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--mute);padding:5px 11px;font:700 ${z(11)} var(--fl,Karla);cursor:pointer}
.dpd-drop .kind button.on{background:linear-gradient(180deg,var(--gold2),var(--gold));color:#201400}
.dpd-drop .pics video{width:100%;border-radius:8px;display:block;background:#000}
.dpd-drop .lvl{display:flex;gap:6px;margin:0 0 11px}
.dpd-drop .lvl button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--edge);background:var(--s1);color:var(--mute);border-radius:9px;padding:6px 4px;font:700 ${z(11)} var(--fl,Karla);cursor:pointer}
.dpd-drop .lvl button b{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--edge2);color:var(--ink);font-size:${z(10)}}
.dpd-drop .lvl button.on{border-color:var(--gold);color:var(--gold);background:color-mix(in srgb,var(--gold) 9%,transparent)}.dpd-drop .lvl button.on b{background:var(--gold);color:#201400}
.dpd-drop .pipes li .f{max-width:420px}
.dpd-drop .pipes{margin-top:10px;font:500 ${z(10.5)} var(--fl,Karla);color:var(--mute2)}
.dpd-drop .pipes summary{cursor:pointer;display:flex;align-items:center;gap:6px;list-style:none}.dpd-drop .pipes summary::-webkit-details-marker{display:none}
.dpd-drop .pipes ul{margin:6px 0 0 20px;padding:0;color:var(--mute)}
.dpd-drop .look{margin:0 0 11px;padding:10px;border-radius:var(--r,12px);background:var(--t2);border:1px solid var(--edge);display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;font:600 ${z(10)} var(--fl,Karla);letter-spacing:.1em;color:var(--mute)}
.dpd-drop .look .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dpd-drop .look .sw{width:22px;height:22px;border-radius:50%;border:2px solid var(--edge);cursor:pointer;padding:0}
.dpd-drop .look .sw.on{border-color:var(--gold);box-shadow:0 0 0 2px color-mix(in srgb,var(--gold) 35%,transparent)}
.dpd-drop .look input[type=color]{width:26px;height:24px;padding:0;border:0;background:none;cursor:pointer}
.dpd-drop .look input[type=range]{width:140px}
.dpd-drop .look .seg2{display:flex;border:1px solid var(--edge);border-radius:999px;overflow:hidden}
.dpd-drop .look .seg2 button{border:0;background:transparent;color:var(--mute);padding:4px 11px;font:700 ${z(10.5)} var(--fl,Karla);cursor:pointer}
.dpd-drop .look .seg2 button.on{background:var(--gold);color:#201400}
.dpd-drop .typ .lk{margin-left:6px;border:1px solid var(--edge);background:var(--s1);color:var(--gold);border-radius:999px;padding:3px 10px;font:700 ${z(10)} var(--fl,Karla);cursor:pointer;letter-spacing:.06em}
.dpd-drop .typ .lk.on{background:var(--gold);color:#201400}
.dpd-drop .tcslot{height:calc(var(--clipH,400px)*var(--z,1));min-height:220px;margin-top:6px;overflow:hidden;border-radius:12px}
.dpd-drop .sfw{margin-top:8px}
.dpd-drop .sfw .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dpd-drop .sfw .pill{margin:0;display:inline-flex;align-items:center;gap:6px}
.dpd-drop .sfw .pill[disabled]{opacity:.6;cursor:wait}
.dpd-drop .sfw .msg{font:500 ${z(11)}/1.35 var(--fl,Karla);color:var(--mute)}.dpd-drop .sfw .msg.err{color:var(--red)}
.dpd-drop .sfw .card{margin-top:8px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--t1) 85%,transparent);border:1.5px solid color-mix(in srgb,var(--gold) 45%,transparent);box-shadow:0 6px 18px rgba(40,25,5,.14)}
.dpd-drop .sfw .card .note{font:italic 400 ${z(12.5)}/1.4 var(--fh,Fraunces),serif;color:var(--ink2);margin-bottom:8px}
.dpd-drop .sfw .ch{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 8px;align-items:start;padding:6px 0;border-top:1px solid var(--edge2);cursor:pointer}
.dpd-drop .sfw .ch input{margin-top:3px;accent-color:var(--gold);width:auto}
.dpd-drop .sfw .ch b{font:700 ${z(11.5)} var(--fl,Karla);color:var(--ink)}
.dpd-drop .sfw .ch .fromto{font:500 ${z(11)} var(--fm,"JetBrains Mono"),monospace;color:var(--ink2);word-break:break-word}.dpd-drop .sfw .ch .fromto s{color:var(--mute2)}
.dpd-drop .sfw .ch .why{grid-column:2;font:400 ${z(11)}/1.35 var(--fl,Karla);color:var(--mute)}
.dpd-drop .sfw .acts{display:flex;gap:8px;margin-top:8px}
.dpd-drop .sfw .acts button{border:0;border-radius:999px;padding:6px 14px;font:700 ${z(11)} var(--fl,Karla);cursor:pointer}
.dpd-drop .sfw .acts .yes{background:var(--gold);color:var(--runInk,#201400)}.dpd-drop .sfw .acts .no{background:transparent;color:var(--mute);border:1px solid var(--edge)}
.dpd-drop .tcgrip{height:12px;margin:2px 0 -4px;cursor:ns-resize;display:flex;align-items:center;justify-content:center;touch-action:none}.dpd-drop .tcgrip::after{content:"";width:46px;height:4px;border-radius:3px;background:color-mix(in srgb,var(--ink) 28%,transparent);transition:background .2s,width .2s}.dpd-drop .tcgrip:hover::after{background:var(--gold);width:70px}
.dpd-drop .xr{display:inline-flex;align-items:center;gap:6px;margin-left:10px;border:1px solid var(--edge);background:var(--s1);color:var(--mute);border-radius:999px;padding:2px 9px;font:700 ${z(10)} var(--fl,Karla);cursor:pointer}.dpd-drop .xr.on{background:var(--gold);color:#201400;border-color:transparent}
.dpd-drop .livepv{position:relative;margin-top:6px}.dpd-drop .livepv img{width:100%;display:block;border-radius:8px;max-height:var(--ph,none);object-fit:contain;background:var(--s1)}
.dpd-drop .livepv span{position:absolute;left:8px;bottom:8px;display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:rgba(20,14,8,.62);color:#fff;font:700 ${z(11)} var(--fl,Karla)}
.dpd-drop .livepv span i{width:7px;height:7px;border-radius:50%;background:#3fcf74;animation:dpdpulse 1s infinite}@keyframes dpdpulse{50%{opacity:.3}}
.dpd-drop .pics:has(.livepv)>img,.dpd-drop .pics:has(.livepv)>video,.dpd-drop .pics:has(.livepv)>.none{display:none}
.dpd-drop .steppic{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}.dpd-drop .steppic img{max-height:var(--ph,220px);object-fit:contain}
.dpd-drop .faceslot{height:calc(var(--fh,640px)*var(--z,1));margin-top:6px;overflow:auto;border-radius:12px;border:2.5px solid var(--clipEdge,var(--edge));background:#111;position:relative}
.dpd-drop .faceslot>*{position:relative!important;transform:none!important;left:auto!important;top:auto!important;width:100%!important;height:100%!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
.dpd-drop .faceslot.skin{background:var(--bgA);border-color:var(--clipEdge,var(--edge))}
${SKINS.filter(x => x[2]).map(([sel, , vars]) => `.dpd-drop .faceslot.skin ${sel}{${vars.replace(/;\s*/g, " !important;")} !important}`).join("\n")}
.dpd-drop .faceslot.multi{display:flex;flex-direction:column;gap:8px}
.dpd-drop .faceslot.multi>*{height:auto!important;flex:0 0 auto!important}
.dpd-drop .faceslot.multi>*:has(canvas){flex:1 0 auto!important;min-height:calc(480px*var(--z,1))}
.dpd-drop .th .skinsw.on{color:var(--title)!important;opacity:1!important}
.dpd-drop .scslot{margin-top:6px}
.dpd-drop .scslot>.dsc{position:static!important;transform:none!important;left:auto!important;top:auto!important;width:100%!important;height:auto!important;display:flex!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
.dpd-drop .bpslot{margin-top:6px}
.dpd-drop .bpslot>.cbp{position:static!important;transform:none!important;left:auto!important;top:auto!important;width:100%!important;height:auto!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;color:var(--ink)}
.dpd-drop .bpslot .cbp-st{border-color:var(--edge2);background:var(--field,var(--s2));color:var(--ink2);border-radius:8px}
.dpd-drop .bpslot .cbp.idle .cbp-st.now{border-color:var(--edge2);background:var(--field,var(--s2));color:var(--ink2)}
.dpd-drop .bpslot .cbp-st i{color:var(--mute)}
.dpd-drop .bpslot .cbp-sw{border-top-color:var(--edge2);color:var(--ink2)}.dpd-drop .bpslot .cbp-sw b{color:var(--mute)}
.dpd-drop .tcslot>.dtc{position:static!important;transform:none!important;left:auto!important;top:auto!important;width:100%!important;height:100%!important;display:flex!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}`;
  document.head.appendChild(css);
}

// ---- the sheet
class DropSheet extends LGraphNode {
  constructor(title) {
    super(title || "Drop Sheet");
    this.isVirtualNode = true; this.serialize_widgets = false;
    this.properties = { zones: {}, steps: [], helpers: {}, order: [...START_ORDER], wide: {}, mode: "t2i" };
    this.color = "#2a2233"; this.bgcolor = "#1b1622";
    this.addInput("picture in", "IMAGE"); this.addOutput("picture out", "IMAGE");   // sheet to sheet
    dress();
    this.el = document.createElement("div"); this.el.className = "dpd-drop";
    this.addDOMWidget("sheet", "dpd-drop", this.el, { serialize: false, hideOnZoom: false, getMinHeight: () => (this.el.querySelector(".dpd-in")?.offsetHeight || 380) + 26 });
    this.el.addEventListener("input", e => this.input(e, false));
    this.el.addEventListener("change", e => this.input(e, true));
    this.el.addEventListener("click", e => this.click(e));
    this.tileDrag(); this.clipDrag();
    this.size = [W, 560];
    setTimeout(() => this.render(), 0);
  }
  // saved lists can come back as plain objects: make them lists again
  norm() {
    const P = this.properties, fix = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : v || [];
    P.zones = P.zones || {}; P.helpers = P.helpers || {}; P.wide = P.wide || {};
    for (const k of Object.keys(P.zones)) P.zones[k] = fix(P.zones[k]).map(String);
    P.steps = fix(P.steps).map(String); P.order = fix(P.order);
    START_ORDER.forEach(z => { if (!P.order.includes(z)) P.order.push(z); });
    P.steps.forEach(id => { if (!P.order.includes(`step:${id}`)) P.order.splice(P.order.indexOf("results"), 0, `step:${id}`); });
    P.order = P.order.filter(z => !z.startsWith("step:") || P.steps.includes(z.slice(5)));
    if (P.last) for (const k of Object.keys(P.last)) P.last[k] = fix(P.last[k]);
    // a card for each part that draws its own view, beside the section it belongs to
    const mine = [...Object.values(P.zones).flat(), ...P.steps].map(String), faced = mine.filter(id => faceOf(byId(id)));
    faced.forEach(id => { if (!P.order.includes(`face:${id}`)) P.order.splice(P.order.indexOf("results"), 0, `face:${id}`); });
    P.order = P.order.filter(z => !z.startsWith("face:") || (mine.includes(z.slice(5)) && byId(z.slice(5))) || !graph()?._nodes?.length);
  }
  in(z) { this.norm(); return (this.properties.zones[z] || []).filter(id => byId(id)); }
  steps() { this.norm(); return this.properties.steps.filter(id => byId(id)); }
  parts() { return [...Object.keys(this.properties.zones).flatMap(z => this.in(z)), ...this.steps(), ...Object.values(this.properties.helpers).map(String).filter(id => byId(id))]; }
  of(kind) { return this.in(ZONE_OF[kind] || "x").map(byId).filter(n => kindOf(n) === kind); }
  // ---- a node dropped on the sheet: into its zone (or a tile of its own), tucked under the paper, wired
  absorb(n) {
    const k = kindOf(n); if (!k) return false;
    this.norm(); const P = this.properties, id = String(n.id);
    if (k === "decode" || k === "encode") P.helpers[k] = id;
    else if (k === "makevideo") P.helpers.video = id;
    else if (k === "syscheck") { const old = byId(P.helpers.syscheck); if (old && String(old.id) !== id) this.release(old.id, true); P.helpers.syscheck = id; }
    else if (k === "blueprint") { const old = byId(P.helpers.blueprint); if (old && String(old.id) !== id) this.release(old.id, true); P.helpers.blueprint = id; }
    else if (k === "textclip") { const old = byId(P.helpers.textclip); if (old && String(old.id) !== id) graph().remove(old); P.helpers.textclip = id;
      if (!this.in("prompt").length) { const p = LiteGraph.createNode("CLIPTextEncode"); if (p) { graph().add(p); p.properties = p.properties || {}; p.properties[KEY] = this.id; p.flags.collapsed = true; P.zones.prompt = [String(p.id)]; } }   // it writes into a prompt, so it brings one
      this.clipNew = true; }   // your own Text Clip takes the prompt's place
    else if (k === "sampler") { if (!this.in("sampler").includes(id)) P.zones.sampler = [...this.in("sampler"), id].slice(-3); }
    else if (k === "frames") { this.of("frames").filter(x => String(x.id) !== id).forEach(x => this.release(x.id, true)); P.zones.canvas = [...this.in("canvas").filter(x => x !== id), id]; }
    else if (k === "step") { if (!P.steps.includes(id)) P.steps.push(id); }
    else if (k === "size") { const z = ZONE_OF[k]; this.in(z).filter(x => kindOf(byId(x)) === k && x !== id).forEach(x => this.release(x, true)); P.zones[z] = [...this.in(z).filter(x => x !== id), id]; }
    else if (k === "vae") { this.of("vae").filter(x => String(x.id) !== id).forEach(x => this.release(x.id, true)); P.zones.loaders = [...this.in("loaders"), id]; }
    else { const z = ZONE_OF[k]; if (!this.in(z).includes(id)) P.zones[z] = [...this.in(z), id]; }
    if (k === "prompt" && this.of("prompt").length > 2) this.release(this.of("prompt")[0].id, true);
    n.properties = n.properties || {}; n.properties[KEY] = this.id; n.flags = n.flags || {}; n.flags.collapsed = true;
    this.norm(); this.wire(); this.render(); changed();
    app.canvas.bringToFront?.(this);
    return true;
  }
  // copies of real nodes, with their settings: onto the sheet (each into its own place), or onto the canvas at a point
  copyOf(ids, at) {
    let y = at?.[1];
    for (const id of ids) {
      const n = byId(id); if (!n) continue;
      const c = n.clone?.(); if (!c) continue; c.id = -1;   // a fresh id (a clone can come back as "undefined", which the graph would keep)
      if (c.properties) delete c.properties[KEY];
      graph().add(c); c.flags = c.flags || {}; c.flags.collapsed = false;
      if (at) { c.pos = [Math.round(at[0]), Math.round(y)]; y += (c.size?.[1] || 80) + LiteGraph.NODE_TITLE_HEIGHT + 24; }
      else this.absorb(c);
    }
    if (at) { changed(); graph().setDirtyCanvas(true, true); }
  }
  release(id, quiet) {
    id = String(id); const n = byId(id); if (!n) return; const P = this.properties;
    for (const w of n.widgets || []) if (w.element?._dpdHome) w.element._dpdHome.appendChild(w.element);   // each moved view (the Text Clip's box, a director's) goes back into its own node
    for (const z of Object.keys(P.zones)) P.zones[z] = (P.zones[z] || []).map(String).filter(x => x !== id);
    P.steps = P.steps.map(String).filter(x => x !== id);
    for (const [k, v] of Object.entries(P.helpers)) if (String(v) === id) delete P.helpers[k];
    delete n.properties[KEY]; n.flags.collapsed = false;
    (n.inputs || []).forEach((inp, i) => { if (inp.link != null) n.disconnectInput(i); });
    (n.outputs || []).forEach((o, i) => { if (o.links?.length) n.disconnectOutput(i); });
    n.pos = [this.pos[0] - n.size[0] - 40, this.pos[1] + 40 + ((this.given = ((this.given || 0) + 1) % 8)) * 46];
    if (!quiet) { this.norm(); this.wire(); this.render(); changed(); }
  }
  add(type) {
    const n = LiteGraph.createNode(type); if (!n) return;
    n.pos = [this.pos[0] - n.size[0] - 40, this.pos[1]]; graph().add(n);
    if (!this.absorb(n)) { app.canvas.selectNode(n); this.render(); }
  }
  // the real nodes: tucked under the paper, or (x-ray) laid out beside the sheet in the order things happen, wires and all
  tuck() {
    const P = this.properties, H = P.helpers;
    if (P.xray) {
      const stages = [[...this.in("loaders"), H.load], [H.textclip, ...this.in("prompt"), H.negative], [...this.in("canvas"), ...this.in("pictures"), H.encode], this.in("sampler"), this.steps(), [H.decode, H.video, ...this.in("results")]];
      let x = this.pos[0] + this.size[0] + 90;
      for (const st of stages) {
        const ns = [...new Set(st.filter(v => v != null).map(String))].map(byId).filter(Boolean); if (!ns.length) continue;
        let y = this.pos[1], w = 0;
        for (const n of ns) { n.flags.collapsed = String(n.id) === String(H.textclip); n.pos = [x, y]; y += (n.flags.collapsed ? 0 : n.size[1]) + LiteGraph.NODE_TITLE_HEIGHT + 34; w = Math.max(w, n.flags.collapsed ? 180 : n.size[0]); }   // the Text Clip's box stays in the sheet
        x += w + 80;
      }
      return;
    }
    this.parts().forEach((id, i) => { const n = byId(id); if (n) { n.pos = [this.pos[0] + 20 + (i % 5) * 8, this.pos[1] + 40 + i * 5]; n.flags.collapsed = true; } }); }
  xray() { this.properties.xray = !this.properties.xray; this.tuck(); this.render(); changed(); graph()?.setDirtyCanvas(true, true); }
  helper(k, type, setup) {
    let n = byId(this.properties.helpers[k]);
    if (!n) { n = LiteGraph.createNode(type); if (!n) return null; graph().add(n); setup?.(n); this.properties.helpers[k] = String(n.id); n.properties = n.properties || {}; n.properties[KEY] = this.id; n.flags.collapsed = true; }
    return n;
  }
  upgrade() {
    const n = LiteGraph.createNode(SHEET); if (!n) return; n._loaded = true;   // it comes with its parts: no start question
    const L = graph().links, get = id => L?.get ? L.get(id) : L?.[id], inL = this.inputs?.[0]?.link != null ? get(this.inputs[0].link) : null, outL = (this.outputs?.[0]?.links || []).map(get).filter(Boolean);
    n.pos = [...this.pos]; graph().add(n);
    const P = this.properties; for (const k of ["zones", "steps", "helpers", "order", "wide", "kind", "mode", "level", "zoom", "font", "live", "stepPics", "links", "last"]) if (P[k] != null) n.properties[k] = JSON.parse(JSON.stringify(P[k]));
    n.properties.grid = true;   // tidy rows, as the Drop Sheet was
    for (const id of this.parts()) { const p = byId(id); if (p) p.properties[KEY] = n.id; }
    for (const x of allSheets()) if (x.properties.links) x.properties.links = x.properties.links.map(v => String(v) === String(this.id) ? String(n.id) : v);
    if (inL) byId(inL.origin_id)?.connect(inL.origin_slot, n, 0); outL.forEach(l => { const t = byId(l.target_id); if (t) n.connect(0, t, l.target_slot); });
    n.setSize([Math.max(this.size[0], 900), Math.max(this.size[1], 640)]);
    P.zones = {}; P.steps = []; P.helpers = {};   // its parts belong to the new sheet now
    n.norm(); n.wire(); n.render(); graph().remove(this); n.mountClip(); changed(); graph().setDirtyCanvas(true, true);
  }
  // ---- linked sheets: sheets joined by a cord work as one. What one lacks (loaders, a prompt, a picture size) comes
  // from its kin, nearest first, and a picture flows left to right: a sheet takes the finished picture of the nearest
  // linked sheet to its left that makes one.
  links() { return (this.properties.links || []).map(byId).filter(x => isSheet(x) && x !== this); }
  kin() { const seen = new Set([this]), q = [this]; while (q.length) for (const x of q.shift().links()) if (!seen.has(x)) { seen.add(x); q.push(x); } seen.delete(this); return [...seen]; }
  borrow(f) { for (const x of this.kin()) { const v = f(x); if (v && (!Array.isArray(v) || v.length)) return v; } return null; }
  link(other, on = true) {
    if (!isSheet(other) || other === this) return;
    for (const [a, b] of [[this, other], [other, this]]) { const L = (a.properties.links || []).map(String).filter(x => x !== String(b.id)); a.properties.links = on ? [...L, String(b.id)] : L; }
    const all = new Set([this, other, ...this.kin(), ...other.kin()]); all.forEach(x => x.wire()); allSheets().forEach(x => x.render()); changed(); graph()?.setDirtyCanvas(true, true);
  }
  makesPicture(d = 0) { return this.in("sampler").length > 0 || (d < 8 && this.steps().length > 0 && !!this.upstream(d + 1)); }
  stage() { const has = z => this.in(z).length > 0; return has("sampler") ? (this.properties.kind === "video" ? "Video" : "Picture") : this.steps().length ? "Finish" : (this.properties.order || []).some(z => String(z).startsWith("face:")) ? "Timeline" : has("prompt") ? "Text" : has("loaders") ? "Loaders" : "Sheet"; }
  // off: a sheet that's off doesn't save or show (its steps let pictures through), and a sheet it feeds is off too
  isOff(d = 0) { if (this.properties.off) return true; const u = d < 8 && this.upstream(); return !!u && u !== this && u.isOff(d + 1); }
  modes() {
    const P = this.properties, want = {}, off = this.isOff(), Z = P.offZ || {}, H = P.helpers;
    for (const id of this.steps()) if (off || Z[`step:${id}`]) want[id] = 4;   // a step that's off lets the picture through
    if (off || Z.results) for (const id of [...this.in("results"), H.video, ...Object.keys(H).filter(k => k.startsWith("pv:")).map(k => H[k])]) if (id != null && byId(id)) want[String(id)] = 2;   // nothing saved or shown
    const M = P.modeSet = P.modeSet || {};
    for (const [id, m] of Object.entries(want)) { const n = byId(id); if (n && n.mode !== m) { n.mode = m; M[id] = m; } else if (n) M[id] = m; }
    for (const [id, m] of Object.entries(M)) if (!(id in want)) { const n = byId(id); if (n && n.mode === m) n.mode = 0; delete M[id]; }   // only what we set goes back; a bypass of your own stays
    graph()?.setDirtyCanvas(true, true);
  }
  // the sheet wired into "picture in" (or the linked sheet to its left), and the real node that gives its finished picture
  upstream(d = 0) {
    const l = this.inputs?.[0]?.link;
    if (l != null) { const L = graph().links, k = L?.get ? L.get(l) : L?.[l], s = byId(k?.origin_id); return isSheet(s) ? s : null; }
    if (d > 8) return null;
    return this.kin().filter(x => x.pos[0] < this.pos[0] && x.makesPicture(d + 1)).sort((a, b) => b.pos[0] - a.pos[0])[0] || null;
  }
  finalImage() { if (!this._final || !byId(this._final.id)) { if (this.wiring) return null; this.wire(); } return this._final && byId(this._final.id) ? this._final : null; }
  onConnectionsChange() { setTimeout(() => { this.wire(); this.render(); this.downstream().forEach(s => { s.wire(); s.render(); }); changed(); }, 0); }
  downstream() { return allSheets().filter(s => s !== this && s.upstream() === this); }
  // ---- the wiring: by what each part gives and takes, and for steps, by the order of their tiles on the page
  wire() {
    if (this.wiring) return; this.wiring = true;
    try { this.wire0(); this.modes(); } finally { this.wiring = false; }
    if (!KIN_WIRING && this.links().length) { KIN_WIRING = true; try { this.kin().forEach(x => { x.wire(); x.render(); }); } finally { KIN_WIRING = false; } }   // its kin may be borrowing from it
  }
  wire0() {
    const up = this.upstream(), upPic = up && up !== this ? up.finalImage() : null;   // another sheet's finished picture
    if (upPic && this.properties.helpers.load) { const h = byId(this.properties.helpers.load); delete this.properties.helpers.load; if (h) graph().remove(h); }   // its own start picture isn't needed now
    const out = (n, T) => n ? n.outputs?.findIndex(o => o.type === T) ?? -1 : -1, inT = (n, T) => n?.inputs?.findIndex(i => i.type === T && !i.widget) ?? -1;
    const origin = id => { const L = graph().links, l = L?.get ? L.get(id) : L?.[id]; return l?.origin_id; };
    const link = (from, T, to, name) => {                        // plug from → to, unless it already is
      if (!from || !to) return; const o = out(from, T), i = name ? to.inputs?.findIndex(x => x.name === name) : inT(to, T); if (o < 0 || i < 0) return;
      const cur = to.inputs[i].link; if (cur != null && String(origin(cur)) === String(from.id)) return;
      from.connect(o, to, i);
    };
    // a loader made just for that part (Load CLIP) wins over a checkpoint that also offers it (LTX's has no text encoder inside)
    const own = this.in("loaders").map(byId), lend = own.some(m => out(m, "MODEL") >= 0) ? [] : this.borrow(x => { const L = x.in("loaders").map(byId); return L.some(m => out(m, "MODEL") >= 0) ? L : null; }) || [];
    const loaders = [...own, ...lend], src = T => { const L = loaders.filter(m => kindOf(m) !== "lora" && out(m, T) >= 0); return L.find(m => m.outputs.length === 1) || L[0]; };
    let M = src("MODEL"), C = src("CLIP");
    const V = this.of("vae")[0] || src("VAE");
    // LoRAs ride the model listed above them in the Loaders box (Wan 2.2: the high-noise LoRA on the high-noise model)
    const models0 = loaders.filter(m => kindOf(m) === "model" && out(m, "MODEL") >= 0), tips = new Map(models0.map(m => [m, m]));
    let base = null;
    for (const n of loaders) {
      const k = kindOf(n);
      if (k === "model" && out(n, "MODEL") >= 0) base = n;
      if (k !== "lora") continue;
      const b = base || models0[0], tip = tips.get(b) || b;
      link(tip, "MODEL", n, "model"); if (b) tips.set(b, n);
      if (n.inputs?.some(i => i.name === "clip")) { link(C, "CLIP", n, "clip"); if (out(n, "CLIP") >= 0) C = n; }
    }
    if (models0[0]) M = tips.get(models0[0]);
    const samplers = this.of("sampler"), samp = samplers[0], ownP = this.of("prompt"), prompts = ownP.length || !samp ? ownP : this.borrow(x => x.of("prompt")) || [], pos = prompts[0];
    const size = this.of("size")[0] || (samp ? this.borrow(x => x.of("size")[0]) : null);   // a prompt and a picture size can live on a linked sheet
    const models = loaders.filter(m => kindOf(m) === "model" && out(m, "MODEL") >= 0);
    const ix = (n, name, io) => (io === "o" ? n?.outputs : n?.inputs)?.findIndex(x => x.name === name) ?? -1;
    const plug = (from, oi, to, ii) => { if (!from || !to || oi < 0 || ii < 0) return; const cur = to.inputs[ii].link; if (cur != null && String(origin(cur)) === String(from.id)) return; from.connect(oi, to, ii); };
    let neg = prompts[1];
    if (!neg && samp && C) neg = this.helper("negative", "CLIPTextEncode", n => setW(n, "text", ""));
    else if (prompts[1] && this.properties.helpers.negative) { const h = byId(this.properties.helpers.negative); delete this.properties.helpers.negative; if (h) graph().remove(h); }
    link(C, "CLIP", pos, "clip"); link(C, "CLIP", neg, "clip");
    // the prompt is written in a Text Clip (your words, a helper to talk it over with, what goes to the model), wired
    // into the prompt's text; it starts with whatever the prompt already said
    if (pos && ownP.includes(pos) && LiteGraph.registered_node_types.DPDTextClip) {
      const tc = this.helper("textclip", "DPDTextClip", n => { const w = wOf(n, "clip"), t = wOf(pos, "text")?.value || "", dark = !light(this.properties.look?.paper || "#1e1825"); w?.options?.setValue?.(JSON.stringify({ mine: t, boxes: 3, theme: dark ? "cinema" : "paper", font: "Georgia" })); });
      link(tc, "STRING", pos, "text");
    }
    // steps, in the order their tiles sit on the page
    const order = this.properties.order.filter(z => z.startsWith("step:")).map(z => byId(z.slice(5))).filter(Boolean);
    const through = T => order.filter(e => !isPair(e) && inT(e, T) >= 0 && out(e, T) >= 0);
    const chain = (start, T) => { let at = start; for (const e of through(T)) { if (at) link(at, T, e); at = e; } return at; };
    // the prompts: one-prompt steps on the positive, then steps that take both (and maybe make the frames)
    let Pn = pos && [pos, out(pos, "CONDITIONING")], Nn = neg && [neg, out(neg, "CONDITIONING")];
    for (const e of through("CONDITIONING")) { if (Pn) plug(Pn[0], Pn[1], e, inT(e, "CONDITIONING")); Pn = [e, out(e, "CONDITIONING")]; }
    let framesLatent = null;
    for (const e of [...this.of("frames"), ...order.filter(isPair)]) {
      if (Pn) plug(Pn[0], Pn[1], e, ix(e, "positive")); if (Nn) plug(Nn[0], Nn[1], e, ix(e, "negative"));
      Pn = [e, ix(e, "positive", "o")]; Nn = [e, ix(e, "negative", "o")];
      if (out(e, "LATENT") >= 0) framesLatent = e;
    }
    let start = framesLatent || size;
    if (this.properties.mode === "i2i" && this.properties.kind !== "video") {
      const pic = upPic || this.of("picture")[0] || this.helper("load", "LoadImage"), enc = this.helper("encode", "VAEEncode");
      link(pic, "IMAGE", enc, "pixels"); link(V, "VAE", enc, "vae"); start = enc;
    }
    M = chain(M, "MODEL");
    const L = chain(start, "LATENT");
    // samplers in tile order: each takes the one before's latent; a second model (Wan 2.2's low noise) goes to the second
    const Ms = [M, ...models.slice(1).map(m => tips.get(m) || m)];
    let lat = L && [L, out(L, "LATENT")];
    samplers.forEach((s, i) => {
      link(Ms[Math.min(i, Ms.length - 1)], "MODEL", s, "model");
      if (Pn) plug(Pn[0], Pn[1], s, ix(s, "positive")); if (Nn) plug(Nn[0], Nn[1], s, ix(s, "negative"));
      if (lat) plug(lat[0], lat[1], s, ix(s, "latent_image")); lat = [s, out(s, "LATENT")];
    });
    const last = samplers[samplers.length - 1], results = this.of("out");
    if (!last && upPic) {   // a finishing sheet (an upscale, a fix): the picture from the sheet before, through its steps
      const I = chain(upPic, "IMAGE"); this._final = I;
      results.forEach(o => { if (inT(o, "IMAGE") >= 0) link(I, "IMAGE", o); });
    }
    if (last) {
      const dec = this.helper("decode", "VAEDecode");
      link(last, "LATENT", dec, "samples"); link(V, "VAE", dec, "vae");
      const I = chain(dec, "IMAGE"); this._final = I;
      results.forEach(o => {
        if (inT(o, "IMAGE") >= 0) return link(I, "IMAGE", o);
        if (inT(o, "VIDEO") >= 0) {                                 // Save Video wants a video: make it, at the frame rate the frames were made for
          const fr = [...this.of("frames"), ...order].map(n => wOf(n, "frame_rate") || wOf(n, "fps")).find(Boolean)?.value || (loaders.some(m => /wan/i.test(wOf(m, "unet_name")?.value || wOf(m, "ckpt_name")?.value || "")) ? 16 : 24);   // Wan makes 16 fps
          const cv = this.helper("video", "CreateVideo", n => setW(n, "fps", fr)); link(I, "IMAGE", cv, "images"); link(cv, "VIDEO", o);
        }
      });
    }
    // a picture after each picture step (an upscale, a fix, a filter), shown in that step's tile: a hidden Preview Image
    // wired to it, made when the step arrives and gone with it
    const H = this.properties.helpers, pics = this.properties.stepPics !== false ? order.filter(e => out(e, "IMAGE") >= 0 && (last || upPic)) : [];
    for (const e of pics) link(e, "IMAGE", this.helper(`pv:${e.id}`, "PreviewImage"), "images");
    for (const k of Object.keys(H)) if (k.startsWith("pv:") && !pics.some(e => `pv:${e.id}` === k)) { const h = byId(H[k]); delete H[k]; if (h) graph().remove(h); }
    // anything a step still wants (an upscale model, a ControlNet, a picture), from whatever here gives it
    const givers = [...loaders, ...(upPic ? [upPic] : []), ...this.of("picture")];
    for (const e of [...order, ...this.of("frames")]) (e.inputs || []).forEach((inp, i) => {   // steps and the frames maker
      if (inp.link != null || inp.widget) return;
      const g = givers.find(x => out(x, inp.type) >= 0); if (g) g.connect(out(g, inp.type), e, i);
    });
    this.tuck();
  }
  // ---- what's broken, tile by tile: [why, node to add, its name]
  needs(z) {
    const have = this.parts().length > 0, P = this.properties, w = [];
    if (!have) return w;
    if (!this.in(z).length && this.kin().some(x => x.in(z).length)) return w;   // a linked sheet has it
    const parts = this.parts().map(byId), gives = T => this.in("loaders").map(byId).some(n => outs(n).includes(T));
    if (z === "loaders") {
      if (!this.in("loaders").length) w.push(["No model yet.", ...NEED.MODEL]);
      else { if (!gives("MODEL")) w.push(["Nothing gives a MODEL.", "UNETLoader", "Load Diffusion Model"]); if (!gives("CLIP")) w.push(["No text encoder (CLIP): the prompt can't be read.", ...NEED.CLIP]); if (!gives("VAE")) w.push(["No VAE: the result can't become a picture.", ...NEED.VAE]); }
    }
    if (z === "prompt" && !this.of("prompt").length) w.push(["No prompt yet.", ...NEED.CONDITIONING]);
    if (z === "sampler" && !this.of("sampler").length) w.push(["No sampler: nothing will be painted.", "KSampler", "KSampler"]);
    const video = P.kind === "video";
    if (z === "canvas" && video && !this.of("size").length && !this.of("frames").length) w.push(["No frames yet: how big and how long.", "EmptyHunyuanLatentVideo", "Empty Video Latent"]);
    if (z === "canvas" && !video && P.mode !== "i2i" && !this.of("size").length) w.push(["No picture size yet.", ...NEED.LATENT]);
    if (z === "canvas" && !video && P.mode === "i2i" && !this.upstream() && !wOf(this.of("picture")[0] || byId(P.helpers.load), "image")?.value) w.push(["Choose a start picture.", null, null]);
    if (z === "results" && !this.of("out").length) w.push(video ? ["Nothing shows or saves the video.", "SaveVideo", "Save Video"] : ["Nothing shows or saves the picture.", "PreviewImage", "Preview Image"]);
    if (z === "canvas") for (const n of this.of("frames")) for (const i of n.inputs || []) if (i.link == null && !i.widget && !/start_image|clip_vision|end_image/.test(i.name)) w.push([`${n.title} needs a ${i.type} for “${i.name}”.`, ...(NEED[i.type] || [null, null])]);
    if (z.startsWith("step:")) { const n = byId(z.slice(5)); for (const i of n?.inputs || []) if (i.link == null && !i.widget) w.push([`Needs a ${i.type} for “${i.name}”.`, ...(NEED[i.type] || [null, null])]); }
    return w;
  }
  // ---- drawing the page
  render() {
    this.norm();
    const P = this.properties, have = this.parts().length;
    const needs = z => this.needs(z).map(([why, type, name]) => `<div class="need">${svg("warn", 14)}<span>${esc(why)}</span>${type ? `<button data-add="${type}" title="Add a ${esc(name)} node, wired in">＋ ${esc(name)}</button>` : ""}</div>`).join("");
    const give = n => `<button data-give="${n.id}" title="Give the ${esc(n.title)} node back">${svg("x", 12)}</button>`;
    const L3 = (P.level || 2) === 3, L1 = (P.level || 2) === 1;
    // level 3 shows every setting a part has; levels 1 and 2 what's given
    const dup = n => kindOf(n) === "prompt" ? "" : `<button data-dup="${n.id}" title="Make a copy of ${esc(n.title)} on the sheet">${svg("copy", 12)}</button>`;
    const item = (n, body, extra = "", keep = []) => `<div class="item"><div class="nm">${esc(n.title)}<span class="sp"></span>${extra}${dup(n)}${give(n)}</div>${L3 ? body + allFields(n, [...keep, ...[...body.matchAll(/data-w="[^:"]+:([^"]+)"/g)].map(m => m[1])]) : body}</div>`;   // Everything adds every other setting under what's already shown
    const tiles = {
      loaders: () => {
        const L = this.in("loaders").map(byId);
        const models = L.filter(n => kindOf(n) === "model"), loras = this.of("lora"), others = L.filter(n => kindOf(n) === "loader");
        const own = models.some(m => outs(m).includes("VAE")), vae = this.of("vae")[0], cur = wOf(vae, "vae_name")?.value, files = VAE_FILES || (cur ? [cur] : []);
        let h = models.map(n => item(n, (L1 ? ["ckpt_name", "unet_name"] : ["ckpt_name", "unet_name", "clip_name", "clip_name1", "clip_name2", "type", "weight_dtype"]).map(k => field(n, k, k.replace(/_name|_/g, " ").trim())).join(""))).join("");
        if (L.length && !L1) h += `<div class="lab2">VAE</div><div class="f"><select data-vae>${own ? `<option value="" ${cur ? "" : "selected"}>from the model (built in)</option>` : `<option value="" disabled ${cur ? "" : "selected"}>pick a VAE…</option>`}${files.map(f => `<option ${f === cur ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div>`;
        if (loras.length) h += `<div class="lab2">LoRAs · ${loras.length}</div>` + loras.map((n, i) => item(n, field(n, "lora_name", "file") + (L1 ? field(n, "strength_model", "strength") : `<div class="f"><label>model</label><input data-w="${n.id}:strength_model" value="${esc(wOf(n, "strength_model")?.value)}"><label>clip</label><input data-w="${n.id}:strength_clip" value="${esc(wOf(n, "strength_clip")?.value)}"></div>`), i ? `<button data-up="${n.id}" title="Earlier in the chain">${svg("up", 12)}</button>` : "")).join("");
        if (others.length && !L1) h += `<div class="lab2">More models</div>` + others.map(n => item(n, (n.widgets || []).filter(w => w.name && !w.hidden).map(w => field(n, w.name, w.name.replace(/_/g, " "))).join(""))).join("");
        return h;
      },
      sampler: () => this.of("sampler").map(n => item(n, L1 ? field(n, "steps", "steps") + `<div class="bar"><i></i></div>` : `<div class="f"><label>steps</label><input data-w="${n.id}:steps" value="${esc(wOf(n, "steps")?.value)}"><label>cfg</label><input data-w="${n.id}:cfg" value="${esc(wOf(n, "cfg")?.value)}"></div>` + field(n, "sampler_name", "sampler") + field(n, "scheduler", "sched") + (wOf(n, "seed") ? field(n, "seed", "seed") : field(n, "noise_seed", "seed")) + (wOf(n, "start_at_step") ? field(n, "start_at_step", "from step") + field(n, "end_at_step", "to step") : "") + (P.mode !== "i2i" ? field(n, "denoise", "denoise") : "") + `<div class="bar"><i></i></div>`)).join(""),
      prompt: () => this.of("prompt").map((n, i) => (i ? `<div class="lab2">avoid</div>` : "") + item(n, (!i && byId(P.helpers.textclip) ? `<div class="tcslot" style="--clipH:${P.clipH || 400}px"></div><div class="tcgrip" data-tcgrip title="Drag to make the writing area taller"></div>${this.sfwHtml()}` : field(n, "text", "", "text")).replace("<textarea", i ? '<textarea class="neg"' : "<textarea"), "", ["text"])).join("")
        + (this.of("prompt").length === 1 && byId(P.helpers.negative) ? `<div class="lab2">avoid</div>${field(byId(P.helpers.negative), "text", "", "text").replace("<textarea", '<textarea class="neg"')}` : ""),
      canvas: () => {
        const size = this.of("size")[0], samp = this.of("sampler")[0];
        if (P.kind === "video") {
          const fr = [...this.of("frames"), ...this.of("size")];
          return fr.map(n => item(n, ["width", "height", "length", L1 ? "" : "batch_size"].filter(Boolean).filter(k => wOf(n, k)).map(k => field(n, k, k.replace("_size", ""))).join("") + (wOf(n, "length") ? `<div class="sub">${Math.round(((wOf(n, "length").value || 1) - 1) / 24 * 10) / 10}s at 24 fps</div>` : ""))).join("");
        }
        let h = `<div class="mode"><button data-mode="t2i" class="${P.mode !== "i2i" ? "on" : ""}">Text → image</button><button data-mode="i2i" class="${P.mode === "i2i" ? "on" : ""}">Image → image</button></div>`;
        if (P.mode !== "i2i") h += size ? item(size, `<div class="f"><label>width</label><input data-w="${size.id}:width" value="${esc(wOf(size, "width")?.value)}"><label>height</label><input data-w="${size.id}:height" value="${esc(wOf(size, "height")?.value)}"></div>${L1 ? "" : `<div class="f"><label>batch</label><input data-w="${size.id}:batch_size" value="${esc(wOf(size, "batch_size")?.value)}"></div>`}`) : "";
        else {
          const load = this.of("picture")[0] || byId(P.helpers.load), w = wOf(load, "image"), d = wOf(samp, "denoise")?.value ?? .6;
          const img = w?.value ? api.apiURL(`/view?filename=${encodeURIComponent(w.value)}&type=input`) : "";
          h += `<div class="start">${img ? `<img src="${img}">` : `<div class="noimg">start picture</div>`}<div>${load ? field(load, "image", "picture") : ""}<button class="pill" data-upload>＋ Upload a picture</button>
            ${samp ? `<div class="f"><label>change</label><input type="range" min="0.05" max="1" step="0.01" value="${d}" data-w="${samp.id}:denoise" data-live><b class="pct">${Math.round(d * 100)}%</b></div>` : ""}</div></div>`;
        }
        return h;
      },
      pictures: () => (this.upstream() ? `<div class="item"><div class="nm">${svg("photo", 13)}From the sheet “${esc(this.upstream().title)}”<span class="sp"></span></div><div class="sub">its finished picture comes in here</div></div>` : "") + this.of("picture").map(n => { const v = wOf(n, "image")?.value; return item(n, `<div class="start">${v ? `<img src="${api.apiURL(`/view?filename=${encodeURIComponent(v)}&type=input`)}">` : `<div class="noimg">no picture</div>`}<div>${field(n, "image", "picture")}</div></div>`); }).join(""),
      system: () => `<div class="scslot"></div>`,
      flow: () => `<div class="bpslot" title="Where the render is: the step it came from, the one working now (green), the next. Click it for the full Blueprint."></div>`,
      results: () => this.of("out").map(n => item(n, `<div class="pics">${(P.last?.[n.id] || []).map(u => /\.(mp4|webm|mov|mkv)(&|$)/i.test(u.split("?")[1] || u) || /filename=[^&]*\.(mp4|webm|mov)/i.test(u) ? `<video src="${u}" autoplay loop muted playsinline controls></video>` : `<img src="${u}">`).join("") || `<div class="none">your picture appears here</div>`}</div>` + (wOf(n, "filename_prefix") && !L1 ? field(n, "filename_prefix", "save as") : "") + (byId(P.helpers.video) && !L1 && inTn(n, "VIDEO") ? field(byId(P.helpers.video), "fps", "fps") : ""), "", ["pics"])).join(""),
    };
    const tile = z => {
      const step = z.startsWith("step:"), n = step && byId(z.slice(5));
      if (step && !n) return "";
      if (z === "flow" && !byId(P.helpers.blueprint)) return "";
      if (z.startsWith("face:")) {
        const f = byId(z.slice(5)); if (!f) return "";
        return `<div class="tile wide face" data-zone="${z}" draggable="false"><div class="th"><span class="grip" data-grip title="Drag to move this tile">${svg("grip", 13)}</span>${svg("film", 13)}${esc(f.title)}<span class="sp"></span>${skinFor(f) ? `<button class="skinsw ${P.noskin?.[f.id] ? "" : "on"}" data-skin="${f.id}" title="${P.noskin?.[f.id] ? "Dress it in the sheet's colours" : "Back to its own colours"}">${svg("paint", 13)}</button>` : ""}<button data-wide="${z}" title="Make it wide or narrow">${svg("wide", 13)}</button></div>
          <div class="sub">its own view, live: use it here as you would on the canvas${skinFor(f) ? (P.noskin?.[f.id] ? " · in its own colours" : " · in the sheet's colours") : " · in its own colours"}</div><div class="faceslot ${skinFor(f) && !P.noskin?.[f.id] ? "skin" : ""}" data-face="${f.id}" style="--fh:${P.faceH?.[f.id] || 640}px"></div><div class="tcgrip" data-facegrip="${f.id}" title="Drag to make its view taller (and the card wider)"></div></div>`;
      }
      if (z === "system" && !byId(P.helpers.syscheck)) return "";   // only when a Comfy Blueprint is on the sheet
      const [name, icon, hint] = step ? [n.title, "plus", ""] : zoneInfo(z, P.kind);
      const body = step ? (L3 ? allFields(n) : (n.widgets || []).filter(w => w.name && !/^(control_after_generate|upload)$/.test(w.name) && !w.hidden).slice(0, L1 ? 2 : 99).map(w => field(n, w.name, w.name.replace(/_/g, " "), w.options?.multiline ? "text" : "auto")).join("")) : tiles[z]();
      const filled = step || z === "flow" || z === "system" || (z === "canvas" ? true : z === "pictures" && this.upstream() ? true : this.in(z).length > 0), bad = this.needs(z).length > 0;
      const wide = P.wide[z] ?? (step ? true : ZONES[z][4]);
      const where = step && ({ IMAGE: "works on the picture after it's made", MODEL: "changes the model, after the LoRAs", CONDITIONING: "shapes the prompt before the sampler", LATENT: "works on the latent before the sampler" }[["IMAGE", "MODEL", "CONDITIONING", "LATENT"].find(T => n.inputs?.some(i => i.type === T && !i.widget) && n.outputs?.some(o => o.type === T))] || "wired to what it needs");
      return `<div class="tile ${filled ? "" : "empty"} ${bad ? "bad" : ""} ${wide ? "wide" : ""}" data-zone="${z}" draggable="false">
        <div class="th"><span class="grip" data-grip title="Drag to move this tile">${svg("grip", 13)}</span>${svg(icon, 13)}${esc(name)}<span class="sp"></span><button data-wide="${z}" title="${wide ? "Make it narrow" : "Make it wide"}">${svg("wide", 13)}</button>${step ? give(n) : ""}</div>
        ${step ? `<div class="sub">${where}</div>` : ""}${filled ? body : `<em>${hint}</em>`}${step && P.last?.[`pv:${n.id}`]?.length ? `<div class="pics steppic" title="What this step made, last run">${P.last[`pv:${n.id}`].map(u => `<img src="${u}">`).join("")}</div>` : ""}${needs(z)}</div>`;
    };
    const pipes = Object.entries(P.helpers).map(([k, id]) => byId(id) && `<li>${esc(byId(id).title)} <span style="opacity:.7">(${{ video: "turns the frames into a video", decode: "turns the result into a picture", encode: "turns the start picture into a latent", negative: "an empty prompt to avoid", load: "loads the start picture", textclip: "where the prompt is written, shown in the Prompt card", ...Object.fromEntries(Object.keys(P.helpers).filter(k => k.startsWith("pv:")).map(k => [k, `shows what ${byId(k.slice(3))?.title || "a step"} made, in its tile`])), blueprint: "shows where the render is, in the Run flow card", syscheck: "reads this machine and suggests settings, in the System card" }[k] || k})</span>${L3 ? allFields(byId(id)) : ""}</li>`).filter(Boolean);
    this.el.innerHTML = `<div class="dpd-in">
      <div class="hd"><div class="badge">${svg("layers", 17)}</div>${this.type === TYPE ? `<button class="mini ok2 upg" data-upgrade title="Move everything onto the new DPD Sheet: free layout, looks, links, the Switchboard (your parts and settings come along)">Switch to the new DPD Sheet</button>` : ""}<div class="t"><b>Drop sheet</b><small>DPD Studio · ${P.kind === "video" ? "video" : "image"}</small></div>
        <div class="kind">${[["image", "photo", "Image"], ["video", "film", "Video"]].map(([k, i, l]) => `<button data-kind="${k}" class="${(P.kind || "image") === k ? "on" : ""}">${svg(i, 13)}${l}</button>`).join("")}</div>
        <div class="typ">${svg("quote", 12)}<select data-type="font" title="One font for all of this sheet's words">${FONTS.map(([f, l]) => `<option value="${f}" ${f === (P.font || "") ? "selected" : ""}>${l}</option>`).join("")}</select>SIZE<input type="range" min="80" max="220" step="5" value="${Math.round((P.zoom || 1) * 100)}" data-type="zoom"><b>${Math.round((P.zoom || 1) * 100)}%</b><button class="lk ${P.lookOpen ? "on" : ""}" data-lookopen title="Paper and accent colours, corners and spacing">LOOK</button>COLUMNS<span class="cols">${[["auto", "Auto"], [2, "2"], [3, "3"], [4, "4"]].map(([c, l]) => `<button data-cols="${c}" class="${String(P.cols || "auto") === String(c) ? "on" : ""}" title="${c === "auto" ? "More columns as the sheet fills" : `${c} columns`}">${l}</button>`).join("")}</span></div></div>
      ${P.lookOpen ? (() => { const L = P.look || {}; return `<div class="look">
        <span>PAPER</span><div class="row">${PAPERS.map(([c, n]) => `<button class="sw ${(L.paper || "#1e1825") === c ? "on" : ""}" data-paper="${c}" title="${n}" style="background:${c}"></button>`).join("")}<input type="color" data-lookc="paper" value="${L.paper || "#1e1825"}" title="Any colour"></div>
        <span>ACCENT</span><div class="row">${ACCENTS.map(([c, n]) => `<button class="sw ${(L.accent || "#e8b64c") === c ? "on" : ""}" data-accent="${c}" title="${n}" style="background:${c}"></button>`).join("")}<input type="color" data-lookc="accent" value="${L.accent || "#e8b64c"}" title="Any colour"></div>
        <span>CORNERS</span><div class="row"><input type="range" min="0" max="24" step="1" value="${L.r ?? 12}" data-lookc="r"><b class="pct">${L.r ?? 12}px</b></div>
        <span>SPACING</span><div class="row"><span class="seg2"><button data-dense="0" class="${L.dense ? "" : "on"}">Cozy</button><button data-dense="1" class="${L.dense ? "on" : ""}">Compact</button></span><button class="pill" data-lookreset>Reset look</button></div></div>`; })() : ""}
      <div class="lvl">${[[1, "Simple"], [2, "Standard"], [3, "Everything"]].map(([l, n]) => `<button data-level="${l}" class="${(P.level || 2) === l ? "on" : ""}" title="${["", "Just what a first picture needs", "The settings most people change", "Every setting of every part, the hidden plumbing too"][l]}"><b>${l}</b>${n}</button>`).join("")}</div>
      <div class="page" style="--cols:${this.cols()}">${P.order.map(tile).join("")}</div>
      ${have && !P.order.some(z => this.needs(z).length) ?`<div class="ok">${svg("check", 14)}Everything a picture needs is here.</div>` : ""}
      <button class="go" type="button">${svg("spark", 15)}Run sheet</button>
      ${pipes.length ? `<details class="pipes" ${L3 ? "open" : ""}><summary>${svg("pipe", 13)}Plumbing: ${pipes.length} part${pipes.length > 1 ? "s" : ""} wired for you, out of sight<button class="xr ${P.xray ? "on" : ""}" data-xray title="Lay out the real ComfyUI nodes and their wires beside the sheet, for when something breaks">${svg("pipe", 12)}${P.xray ? "Hide" : "Show"} the real nodes</button></summary><ul>${pipes.join("")}</ul></details>` : ""}</div>`;
    this.typeApply(); this.mountClip(); this.fit();
    this.el.querySelectorAll("img").forEach(i => i.addEventListener("load", () => this.fit(), { once: true }));
  }
  fit() {
    requestAnimationFrame(() => {
      const inner = this.el.querySelector(".dpd-in"); if (!inner) return;
      const h = inner.offsetHeight + 26 + LiteGraph.NODE_TITLE_HEIGHT, w = Math.round((this.cols() * 315 + 30) * (this.properties.zoom || 1));
      if (Math.abs(this.size[1] - h) > 2 || Math.abs(this.size[0] - w) > 2) { const again = Math.abs(this.size[0] - w) > 2; this.setSize([w, h]); graph()?.setDirtyCanvas(true, true); if (again) this.fit(); }
    });
  }
  // how many columns: the one picked, or more as the sheet fills (every filled tile counts; LoRAs and steps add up)
  cols() {
    const P = this.properties; if (P.cols && P.cols !== "auto") return +P.cols;
    const filled = P.order.filter(z => z.startsWith("step:") || this.in(z).length).length + Math.floor(this.of("lora").length / 3);
    return filled <= 6 ? 2 : filled <= 9 ? 3 : 4;
  }
  // the paper, the accent, the corners and the spacing; dark ink on light paper
  lookApply() {
    const L = this.properties.look || {}, p = L.paper || "#1e1825", a = L.accent || "#e8b64c", lt = light(p), s = this.el.style;
    const v = lt ? { bgA: p, bgB: mixHex(p, "#000000", .04), t1: mixHex(p, "#ffffff", .55), t2: mixHex(p, "#ffffff", .35), s1: mixHex(p, "#000000", .06), s2: "#ffffff", edge: mixHex(p, "#000000", .22), edge2: mixHex(p, "#000000", .12), ink: "#231b2a" }
                 : { bgA: mixHex(p, "#ffffff", .03), bgB: p, t1: mixHex(p, "#ffffff", .09), t2: mixHex(p, "#ffffff", .05), s1: mixHex(p, "#ffffff", .08), s2: mixHex(p, "#000000", .45), edge: mixHex(p, "#ffffff", .2), edge2: mixHex(p, "#ffffff", .12), ink: "#f1ecf6" };
    v.mute = mixHex(v.ink, p, .38); v.mute2 = mixHex(v.ink, p, .58); v.ink2 = mixHex(v.ink, p, .2);
    Object.entries(v).forEach(([k, c]) => s.setProperty(`--${k}`, c));
    s.setProperty("--gold", a); s.setProperty("--gold2", mixHex(a, "#ffffff", .35)); s.setProperty("--acRGB", hexRgb(a).join(","));
    s.setProperty("--r", `${L.r ?? 12}px`); s.setProperty("--dn", L.dense ? .7 : 1);
    this.bgcolor = v.bgB; this.color = v.t1; graph()?.setDirtyCanvas(true, true);
  }
  typeApply() { this.lookApply(); const z = this.properties.zoom || 1, f = this.properties.font; this.el.style.setProperty("--z", z); ["--fh", "--fl", "--fm"].forEach(v => f ? this.el.style.setProperty(v, `"${f}"`) : this.el.style.removeProperty(v)); }
  // ---- the sheet's own controls
  // the Text Clip's own box, moved into the Prompt card (it stays the Text Clip node's widget, so it saves and runs as one)
  mountClip() {
    for (const [sel, k, w] of [[".tcslot", "textclip", "clip"], [".bpslot", "blueprint", "blueprint"], [".scslot", "syscheck", "syscheck"]]) {
      const slot = this.el.querySelector(sel), box = byId(this.properties.helpers[k])?.widgets?.find(x => x.name === w)?.element;
      if (!slot || !box || box.parentElement === slot) continue;
      if (!box._dpdHome && box.parentElement) box._dpdHome = box.parentElement;
      slot.appendChild(box); box.hidden = false;
      if (this.place) requestAnimationFrame(() => this.place());   // its card is taller now: the page makes room
    }
    for (const slot of this.el.querySelectorAll(".faceslot")) {
      const boxes = facesOf(byId(slot.dataset.face)); slot.classList.toggle("multi", boxes.length > 1); let moved = false;
      for (const box of boxes) {
        if (box.parentElement === slot) continue;
        if (!box._dpdHome && box.parentElement) box._dpdHome = box.parentElement;
        slot.appendChild(box); box.hidden = false; moved = true;
      }
      if (moved) window.dispatchEvent(new Event("resize"));   // a view that sizes itself to its box gets to look again
    }
    reinkTick();
  }
  input(e, done) {
    if (e.target.closest(".dtc")) return;   // typing in the Text Clip is the Text Clip's business
    const t = e.target;
    if (t.dataset.type) { if (t.dataset.type === "zoom") { this.properties.zoom = +t.value / 100; t.nextElementSibling.textContent = `${t.value}%`; } else this.properties.font = t.value; this.typeApply(); this.fit(); changed(); return; }
    if (t.matches("[data-vae]")) { if (done) this.vae(t.value); return; }
    if (t.dataset.lookc) { const L = this.properties.look = this.properties.look || {}, k = t.dataset.lookc; L[k] = k === "r" ? +t.value : t.value; if (k === "r") t.nextElementSibling.textContent = `${t.value}px`; this.lookApply(); if (done) { this.render(); changed(); } return; }
    const w = t.closest("[data-w]"); if (!w) return;
    const [id, name] = w.dataset.w.split(/:(.*)/s), n = byId(id), wd = wOf(n, name); if (!wd) return;
    let v = w.value; if (typeof wd.value === "number") { v = parseFloat(v); if (!isFinite(v)) return; }
    setW(n, name, v); changed();
    if (w.matches("[data-live]")) w.nextElementSibling.textContent = `${Math.round(v * 100)}%`;
    if (done && (name === "image")) this.render();
  }
  click(e) {
    const q = s => e.target.closest(s);
    if (q("[data-give]")) return this.release(q("[data-give]").dataset.give);
    if (q("[data-skin]")) { const id = q("[data-skin]").dataset.skin, N = this.properties.noskin = this.properties.noskin || {}; N[id] = !N[id]; this.render(); changed(); return; }
    if (q("[data-dup]")) return this.copyOf([q("[data-dup]").dataset.dup]);
    if (q("[data-add]")) return this.add(q("[data-add]").dataset.add);
    if (q("[data-upgrade]")) return this.upgrade();
    if (q("[data-mode]")) { this.properties.mode = q("[data-mode]").dataset.mode; const s = this.of("sampler")[0]; if (s && wOf(s, "denoise")) setW(s, "denoise", this.properties.mode === "i2i" ? (wOf(s, "denoise").value >= .99 ? .6 : wOf(s, "denoise").value) : 1); this.wire(); this.render(); changed(); return; }
    if (q("[data-upload]")) return this.upload();
    if (q("[data-kind]")) { this.properties.kind = q("[data-kind]").dataset.kind; this.wire(); this.render(); changed(); return; }
    const L = this.properties.look = this.properties.look || {};
    if (q("[data-lookopen]")) { this.properties.lookOpen = !this.properties.lookOpen; this.render(); return; }
    if (q("[data-paper]")) { L.paper = q("[data-paper]").dataset.paper; this.render(); changed(); return; }
    if (q("[data-accent]")) { L.accent = q("[data-accent]").dataset.accent; this.render(); changed(); return; }
    if (q("[data-dense]")) { L.dense = q("[data-dense]").dataset.dense === "1"; this.render(); changed(); return; }
    if (q("[data-lookreset]")) { this.properties.look = {}; this.render(); changed(); return; }
    if (q("[data-cols]")) { const c = q("[data-cols]").dataset.cols; this.properties.cols = c === "auto" ? "auto" : +c; this.render(); changed(); return; }
    if (q("[data-level]")) { this.properties.level = +q("[data-level]").dataset.level; this.render(); changed(); return; }
    if (q("[data-wide]")) { const z = q("[data-wide]").dataset.wide, P = this.properties, now = P.wide[z] ?? (z.startsWith("step:") || ZONES[z]?.[4]); P.wide[z] = !now; this.render(); changed(); return; }
    if (q("[data-up]")) { const id = q("[data-up]").dataset.up, L = this.properties.zones.loaders, ls = this.of("lora").map(n => String(n.id)), i = ls.indexOf(id); if (i > 0) { const a = L.indexOf(ls[i - 1]), b = L.indexOf(id); [L[a], L[b]] = [L[b], L[a]]; this.wire(); this.render(); changed(); } return; }
    if (q("[data-xray]")) { e.preventDefault(); return this.xray(); }
    if (q("[data-sfw]")) { if (!this.sfw?.busy) this.sfwAsk(); return; }
    if (q("[data-sfwuse]")) return this.sfwUse();
    if (q("[data-sfwno]")) { this.sfw = null; return this.render(); }
    if (q("[data-sfwundo]")) { for (const [id, name, val] of this.sfw.undo) setW(byId(id), name, val); this.sfw = { msg: "Back as it was." }; this.render(); changed(); return; }
    if (q("[data-sfwon]")) { const c = this.sfw?.changes?.[+q("[data-sfwon]").dataset.sfwon]; if (c) c.on = q("[data-sfwon]").checked; return; }
    if (q(".go") && !q(".dtc")) app.queuePrompt(0, 1);
  }
  vae(file) {
    const n = this.of("vae")[0];
    if (!file) { if (n) { this.properties.zones.loaders = this.in("loaders").filter(x => x !== String(n.id)); graph().remove(n); } this.wire(); this.render(); changed(); return; }
    if (n) { setW(n, "vae_name", file); this.render(); changed(); return; }
    const l = LiteGraph.createNode("VAELoader"); if (!l) return; graph().add(l); setW(l, "vae_name", file); this.absorb(l);
  }
  async upload() {
    const f = await new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.onchange = () => res(i.files[0]); i.click(); }); if (!f) return;
    const fd = new FormData(); fd.append("image", f, f.name); fd.append("overwrite", "true");
    const r = await api.fetchApi("/upload/image", { method: "POST", body: fd }).then(x => x.json());
    if (this.properties.mode === "i2i" && !this.of("picture")[0]) this.wire();
    const load = this.of("picture")[0] || byId(this.properties.helpers.load), w = wOf(load, "image"); if (!w) return;
    const name = r.subfolder ? `${r.subfolder}/${r.name}` : r.name;
    if (Array.isArray(w.options?.values) && !w.options.values.includes(name)) w.options.values.push(name);
    setW(load, "image", name); this.render(); changed();
  }
  // tiles move by their ⠿ grip: drop one on another and it takes that place
  tileDrag() {
    this.el.addEventListener("pointerdown", e => {
      const g = e.target.closest("[data-grip]"); if (!g) return;
      e.preventDefault(); e.stopPropagation();
      const tile = g.closest(".tile"), z = tile.dataset.zone; tile.classList.add("drag");
      const over = m => { this.el.querySelectorAll(".over").forEach(x => x.classList.remove("over")); const t = document.elementFromPoint(m.clientX, m.clientY)?.closest?.(".dpd-drop .tile"); if (t && t !== tile && this.el.contains(t)) t.classList.add("over"); return t; };
      const mv = m => over(m);
      const up = m => {
        removeEventListener("pointermove", mv, true); removeEventListener("pointerup", up, true);
        const t = over(m); this.el.querySelectorAll(".over,.drag").forEach(x => x.classList.remove("over", "drag"));
        if (!t || t === tile || !this.el.contains(t)) return;
        const O = this.properties.order, from = O.indexOf(z); O.splice(from, 1); O.splice(O.indexOf(t.dataset.zone) + (from <= O.indexOf(t.dataset.zone) ? 1 : 0), 0, z);
        this.wire(); this.render(); changed();
      };
      addEventListener("pointermove", mv, true); addEventListener("pointerup", up, true);
    }, true);
  }
  // ---- settings from words: what you wrote in the Text Clip, read for the settings it implies (picture size, steps,
  // cfg, sampler, LoRA strengths, what to avoid). Claude only suggests; nothing changes until you press Use.
  sfwFields() {
    const P = this.properties, rows = [], add = (n, name, label) => { const w = wOf(n, name); if (!w || w.value == null || (w.options?.multiline && name !== "text")) return; const o = w.options || {}; rows.push({ key: `${n.id}:${name}`, label, value: w.value, ...(Array.isArray(o.values) ? { choices: o.values.slice(0, 60) } : typeof w.value === "number" ? { min: o.min, max: o.max } : {}) }); };
    for (const n of [...this.of("size"), ...this.of("frames")]) ["width", "height", "length", "batch_size"].forEach(k => add(n, k, { width: "Width", height: "Height", length: "Length (frames)", batch_size: "Pictures per run" }[k]));
    const many = this.of("sampler").length > 1;
    for (const n of this.of("sampler")) { const of = many ? ` (${n.title})` : ""; [["steps", "Steps"], ["cfg", "CFG"], ["sampler_name", "Sampler"], ["scheduler", "Scheduler"]].forEach(([k, l]) => add(n, k, l + of)); if (P.mode === "i2i") add(n, "denoise", "How much to change the start picture" + of); }
    for (const n of this.of("lora")) { add(n, "strength_model", `LoRA strength: ${String(wOf(n, "lora_name")?.value || "").split(/[\/]/).pop()}`); }
    for (const id of P.steps) { const n = byId(id); if (n) (n.widgets || []).filter(w => typeof w.value === "number" && !/seed/.test(w.name)).forEach(w => add(n, w.name, `${w.name.replace(/_/g, " ")} (${n.title})`)); }
    const neg = this.of("prompt")[1] || byId(P.helpers.negative); if (neg) add(neg, "text", "What to avoid");
    return rows;
  }
  words() {
    const tc = byId(this.properties.helpers.textclip); let S = {};
    try { S = JSON.parse(wOf(tc, "clip")?.value || "{}"); } catch {}
    return { text: (S.follow === "final" ? S.final : "") || S.mine || wOf(this.of("prompt")[0], "text")?.value || "", engine: S.engine || "claude" };
  }
  async sfwAsk() {
    const { text, engine } = this.words(), rows = this.sfwFields();
    if (!text.trim()) { this.sfw = { msg: "Write what you want in the Text Clip first, then ask." }; return this.render(); }
    if (engine === "off") { this.sfw = { msg: "The Text Clip's helper is off. Pick Claude or LM Studio in its bar.", err: true }; return this.render(); }
    if (!rows.length) { this.sfw = { msg: "Nothing on this sheet has settings to change yet." }; return this.render(); }
    this.sfw = { busy: true }; this.render();
    const models = this.in("loaders").map(byId).flatMap(n => ["ckpt_name", "unet_name", "clip_name", "lora_name"].map(k => wOf(n, k)?.value).filter(Boolean));
    const ask = `Read what this person wants their ${this.properties.kind === "video" ? "video" : "picture"} to be, then choose the settings that serve it best.
WHAT THEY WROTE:
${text}

THE MODELS LOADED: ${models.join(", ") || "unknown"}. Respect what these models need (a turbo or distilled model wants few steps and a low cfg; never push it outside what works for it).
THE SETTINGS YOU MAY CHANGE (key, what it is, its value now, and its allowed choices or range):
${JSON.stringify(rows)}

Change only what their words give a real reason to change: an aspect or orientation they mention or imply (portrait, landscape, banner, phone wallpaper, square) becomes width and height (keep about the same number of pixels as now, multiples of 64), more or less detail becomes steps, a look becomes sampler or scheduler from the allowed choices, and things they don't want go into what to avoid. Leave everything else alone. Every value must be one of its choices, or a number inside its range.
Reply with JSON only, no other words, shaped exactly like:
{"note": "one friendly sentence on what you read in their words", "changes": [{"key": "the key", "value": "the new value", "why": "a few plain words"}]}`;
    try {
      const j = await api.fetchApi("/dpd_text/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine, goes_to: "the sheet's settings (answer in JSON only)", chat: [], message: ask }) }).then(x => x.json());
      if (j.error) throw new Error(j.error);
      const m = String(j.text || "").match(/\{[\s\S]*\}/); if (!m) throw new Error("The answer had no settings in it.");
      const out = JSON.parse(m[0]), byKey = Object.fromEntries(rows.map(r => [r.key, r]));
      const changes = (out.changes || []).map(c => {
        const row = byKey[c.key]; if (!row) return null;
        let v = c.value;
        if (row.choices) { v = row.choices.find(x => String(x) === String(v)); if (v === undefined) return null; }
        else if (typeof row.value === "number") { v = Number(v); if (!isFinite(v)) return null; if (row.min != null) v = Math.max(row.min, v); if (row.max != null) v = Math.min(row.max, v); if (Number.isInteger(row.value) && /width|height|length|steps|batch/.test(c.key)) v = Math.round(v); }
        else v = String(v);
        return String(v) === String(row.value) ? null : { ...row, to: v, why: String(c.why || ""), on: true };
      }).filter(Boolean);
      this.sfw = changes.length ? { note: out.note || "", changes } : { msg: (out.note ? out.note + " " : "") + "Everything already fits your words: nothing to change." };
    } catch (e) { this.sfw = { msg: String(e.message || e).slice(0, 240), err: true }; }
    this.render();
  }
  sfwUse() {
    const S = this.sfw; if (!S?.changes) return;
    const undo = [];
    for (const c of S.changes.filter(c => c.on)) { const [id, name] = c.key.split(/:(.*)/s), n = byId(id); if (!n) continue; undo.push([id, name, wOf(n, name)?.value]); setW(n, name, c.to); }
    this.sfw = { msg: `${undo.length} setting${undo.length === 1 ? "" : "s"} changed to fit your words.`, undo };
    this.render(); changed();
  }
  sfwHtml() {
    const S = this.sfw || {}, v = x => esc(String(x).length > 90 ? String(x).slice(0, 90) + "…" : x);
    return `<div class="sfw"><div class="row"><button class="pill" data-sfw ${S.busy ? "disabled" : ""} title="Claude reads what you wrote and suggests the size, steps, sampler and more to match. Nothing changes until you say so.">${svg("spark", 12)}${S.busy ? "Reading your words…" : "Settings from my words"}</button>${S.msg ? `<span class="msg ${S.err ? "err" : ""}">${esc(S.msg)}</span>` : ""}${S.undo ? `<button class="pill" data-sfwundo>Undo</button>` : ""}</div>
      ${S.changes ? `<div class="card">${S.note ? `<div class="note">${esc(S.note)}</div>` : ""}${S.changes.map((c, i) => `<label class="ch"><input type="checkbox" data-sfwon="${i}" ${c.on ? "checked" : ""}><span><b>${esc(c.label)}</b><br><span class="fromto"><s>${v(c.value)}</s> → ${v(c.to)}</span></span>${c.why ? `<span class="why">${esc(c.why)}</span>` : ""}</label>`).join("")}
        <div class="acts"><button class="yes" data-sfwuse>Use these settings</button><button class="no" data-sfwno>Not now</button></div></div>` : ""}</div>`;
  }
  // the bar under the Text Clip makes it taller (and, on the Blank Sheet, its card wider)
  clipDrag() {
    this.el.addEventListener("pointerdown", e => {
      const fg = e.target.closest("[data-facegrip]"); if (fg) return this.faceDrag(e, fg);
      const g = e.target.closest("[data-tcgrip]"); if (!g) return;
      e.preventDefault(); e.stopPropagation();
      const P = this.properties, slot = this.el.querySelector(".tcslot"), k = app.canvas.ds.scale || 1, z = P.zoom || 1, sx = e.clientX, sy = e.clientY, h0 = P.clipH || 400;
      const tile = g.closest(".tile"), f = P.free?.prompt, w0 = f?.w; this.lead = "prompt";
      const mv = m => {
        P.clipH = Math.max(220, Math.round(h0 + (m.clientY - sy) / k / z)); slot?.style.setProperty("--clipH", `${P.clipH}px`);
        if (f) { f.w = Math.max(300, Math.round(w0 + (m.clientX - sx) / k)); tile.style.width = `${f.w}px`; }
      };
      const up = () => { removeEventListener("pointermove", mv, true); removeEventListener("pointerup", up, true); this.place ? this.place() : this.fit(); this.lead = null; changed(); };
      addEventListener("pointermove", mv, true); addEventListener("pointerup", up, true);
    }, true);
  }
  faceDrag(e, g) {
    e.preventDefault(); e.stopPropagation();
    const P = this.properties, id = g.dataset.facegrip, slot = g.previousElementSibling, k = app.canvas.ds.scale || 1, zz = P.zoom || 1, sx = e.clientX, sy = e.clientY;
    const H = P.faceH = P.faceH || {}, h0 = H[id] || 640, tile = g.closest(".tile"), z = tile.dataset.zone, f = P.free?.[z], w0 = f?.w; this.lead = z;
    const mv = m => { H[id] = Math.max(240, Math.round(h0 + (m.clientY - sy) / k / zz)); slot.style.setProperty("--fh", `${H[id]}px`); if (f) { f.w = Math.max(360, Math.round(w0 + (m.clientX - sx) / k)); tile.style.width = `${f.w}px`; } };
    const up = () => { removeEventListener("pointermove", mv, true); removeEventListener("pointerup", up, true); window.dispatchEvent(new Event("resize")); this.place ? this.place() : this.fit(); this.lead = null; changed(); };
    addEventListener("pointermove", mv, true); addEventListener("pointerup", up, true);
  }
  hot(z) { this.el.querySelectorAll(".hot").forEach(x => x.classList.remove("hot")); if (!z) return; const t = this.el.querySelector(`.tile[data-zone="${z}"]`); (t || this.el.querySelector(".page"))?.classList.add("hot"); }
  live(id) { this.el.querySelectorAll(".live").forEach(x => x.classList.remove("live")); if (id == null) return; id = String(id); const z = this.properties.order.find(z => z === `step:${id}` || (this.properties.zones[z] || []).includes(id)); if (z) this.el.querySelector(`.tile[data-zone="${z}"]`)?.classList.add("live"); }
  shown(id, images) {
    const pv = Object.keys(this.properties.helpers).find(k => k.startsWith("pv:") && String(this.properties.helpers[k]) === id);
    if (!pv && !this.of("out").some(n => String(n.id) === id)) return;
    (this.properties.last = this.properties.last || {})[pv || id] = images.map(im => api.apiURL(`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder || "")}&type=${im.type}&t=${Date.now()}`));
    this.render(); changed();
  }
  // a live preview as the picture forms; the finished one replaces it
  preview(id, blob) {
    if (this.properties.live === false || !this.parts().includes(String(id))) return;
    const url = URL.createObjectURL(blob); if (this._pv) URL.revokeObjectURL(this._pv); this._pv = url;
    let box = this.el.querySelector(".livepv");
    if (!box) {
      const host = this.el.querySelector(".tile[data-zone=results] .pics") || this.el.querySelector(".tile[data-zone=sampler]"); if (!host) return;
      host.insertAdjacentHTML(host.classList.contains("pics") ? "afterbegin" : "beforeend", `<div class="livepv"><img alt="live preview"><span><i></i>Painting…</span></div>`); box = host.querySelector(".livepv");
      box.querySelector("img").addEventListener("load", () => this.place?.(), { once: true });
    }
    box.querySelector("img").src = url;
    const p = PROG || this._prog; box.querySelector("span").lastChild.textContent = p && p[1] > 1 ? `Painting · step ${p[0]} of ${p[1]}` : "Painting…";
  }
  liveDone() { this.el.querySelector(".livepv")?.remove(); this._prog = null; PROG = null; if (this._pv) { URL.revokeObjectURL(this._pv); this._pv = null; } this.place?.(); }
  progress(v, max) { this._prog = [v, max]; const b = this.el.querySelector(".bar"); if (!b) return; b.classList.toggle("on", v < max); b.querySelector("i").style.width = `${Math.round(v / max * 100)}%`; }
  onConfigure() { this._loaded = true; setTimeout(() => { this.norm(); this.tuck(); this.render(); }, 0); }
  onRemoved() { this.parts().forEach(id => { const n = byId(id); if (n) { delete n.properties[KEY]; n.flags.collapsed = false; } }); }
  onDrawBackground() {
    const pc = this.parts().length; if (this._pc != null && pc < this._pc) setTimeout(() => { this.wire(); this.render(); changed(); }, 0); this._pc = pc; if (this.el.querySelector(".tcslot:empty, .bpslot:empty, .scslot:empty, .faceslot:empty")) this.mountClip(); if (!this.flags.collapsed && !this.properties.xray && this.parts().some(id => { const n = byId(id); return n && (n.pos[0] < this.pos[0] || n.pos[0] > this.pos[0] + 60); })) this.tuck(); }
}
DropSheet.title = "Drop Sheet";
DropSheet.category = "DPD Studio";

// ---- the Blank Sheet: the same wiring on a plain tan page you lay out yourself. It starts empty, any size you drag
// it to; a small gear in the corner holds the settings. Whatever you drop on it lands in its group (Loaders, Prompt,
// Sampler…), each group a card you can move anywhere on the page by its top bar and widen by its corner.
const FREE_CSS = `
.dpd-drop.free{padding:0;height:100%;border-radius:0 0 14px 14px;background:var(--bgA);background-image:radial-gradient(color-mix(in srgb,var(--ink) 9%,transparent) 1px,transparent 1.2px);background-size:22px 22px}
.dpd-drop.free .dpd-in{position:relative;height:100%;overflow:hidden}
.dpd-drop.free .paper{position:absolute;inset:0;display:block!important;min-height:0;border-radius:0 0 14px 14px;outline-offset:-8px}
.dpd-drop.free .paper.hot{outline:2px dashed var(--gold)}
.dpd-drop.free .tile{position:absolute;margin:0;box-shadow:0 6px 18px rgba(60,40,10,.18),inset 3px 0 0 var(--gold)}
.dpd-drop.free .tile .th{cursor:grab;margin:-8px -10px 4px;padding:8px 10px 6px;border-radius:var(--r,12px) var(--r,12px) 0 0}
.dpd-drop.free .tile.moving{opacity:.85;box-shadow:0 14px 30px rgba(60,40,10,.3),inset 3px 0 0 var(--gold);z-index:5}
.dpd-drop.free .tile .th .grip{cursor:grab}
.dpd-drop.free .tile .rs{position:absolute;right:2px;bottom:2px;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,color-mix(in srgb,var(--ink) 30%,transparent) 50% 60%,transparent 60% 72%,color-mix(in srgb,var(--ink) 30%,transparent) 72% 82%,transparent 82%)}
.dpd-drop.free .blank{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--mute2);font:italic 400 calc(15px*var(--z,1))/1.4 var(--fh,Fraunces),serif;text-align:center;pointer-events:none;padding:30px}
.dpd-drop.free .blank small{font:500 calc(11px*var(--z,1)) var(--fl,Karla);letter-spacing:.08em;font-style:normal;opacity:.8}
.dpd-drop.free .gear{position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;border:1px solid var(--edge);background:color-mix(in srgb,var(--bgA) 80%,#fff);color:var(--mute);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:8;transition:transform .3s,color .2s}
.dpd-drop.free .gear:hover,.dpd-drop.free .gear.on{color:var(--gold);transform:rotate(60deg)}
.dpd-drop.free .set{position:absolute;top:42px;right:8px;width:min(400px,calc(100% - 16px));max-height:calc(100% - 50px);overflow:auto;z-index:8;padding:12px;border-radius:var(--r,12px);background:var(--t1);border:1px solid var(--edge);box-shadow:0 14px 34px rgba(40,25,5,.28)}
.dpd-drop.free .set h4{margin:0 0 8px;font:600 calc(15px*var(--z,1)) var(--fh,Fraunces),serif}
.dpd-drop.free .set .kind{margin:0 0 10px}.dpd-drop.free .set .typ{margin-bottom:10px;flex-wrap:wrap}
.dpd-drop.free .set .go{margin-top:2px}
.dpd-drop.free .foot{position:absolute;left:10px;right:10px;bottom:10px;display:flex;align-items:flex-end;gap:10px;pointer-events:none;z-index:6}
.dpd-drop.free .foot>*{pointer-events:auto}
.dpd-drop.free .foot .miss{flex:1;display:flex;flex-wrap:wrap;gap:6px}.dpd-drop.free .foot .need{margin:0;background:color-mix(in srgb,var(--bgA) 70%,#fff);box-shadow:0 3px 10px rgba(60,40,10,.12)}
.dpd-drop.free .foot .ok{margin:0;flex:1}
.dpd-drop.free .foot .go{width:auto;margin:0;padding:9px 18px;flex:none}
.dpd-drop.free .set .sty{display:flex;align-items:center;gap:8px;margin:0 0 10px;font:600 calc(10px*var(--z,1)) var(--fl,Karla);letter-spacing:.1em;color:var(--mute)}
.dpd-drop.free .set .sty .seg2{display:flex;border:1px solid var(--edge);border-radius:999px;overflow:hidden}
.dpd-drop.free .set .sty button{border:0;background:transparent;color:var(--mute);padding:4px 12px;font:700 calc(10.5px*var(--z,1)) var(--fl,Karla);cursor:pointer}
.dpd-drop.free .set .sty button.on{background:var(--gold);color:#fff}
/* Melt: a dropped node's box dissolves into the paper; only its fields stand up off the page, and a fading line
   under each section says where it ends */
.dpd-drop.free .tile{transition:background-color .9s ease,border-color .9s ease,box-shadow .9s ease,padding .9s ease}
.dpd-drop.free.melt .tile{background:transparent;border-color:transparent;box-shadow:none;padding:2px 6px 16px}
.dpd-drop.free.melt .tile::after{content:"";position:absolute;left:6px;right:6px;bottom:3px;height:2.5px;border-radius:2px;background:linear-gradient(90deg,var(--gold) 0,var(--gold) 40%,color-mix(in srgb,var(--gold) 30%,transparent) 80%,transparent);transition:opacity .9s}
.dpd-drop.free.melt .tile.fresh{background:linear-gradient(180deg,var(--t1),var(--t2));border-color:var(--edge);box-shadow:0 6px 18px rgba(60,40,10,.18),inset 3px 0 0 var(--gold);padding:8px 10px 10px}
.dpd-drop.free.melt .tile.fresh::after{opacity:0}
.dpd-drop.free.melt .tile .th{margin:-2px -6px 2px;padding:4px 6px;background:none;font-size:calc(11.5px*var(--z,1));font-weight:800}
.dpd-drop.free.melt .tile .th button,.dpd-drop.free.melt .tile .th .grip,.dpd-drop.free.melt .tile .rs{opacity:0;transition:opacity .2s}
.dpd-drop.free.melt .tile:hover .th button,.dpd-drop.free.melt .tile:hover .th .grip,.dpd-drop.free.melt .tile:hover .rs{opacity:1}
.dpd-drop.free.melt .tile:hover{outline:1px dashed color-mix(in srgb,var(--gold) 35%,transparent);outline-offset:3px;border-radius:var(--r,12px)}
.dpd-drop.free.melt .tile.live{box-shadow:none;outline:1.5px solid var(--gold);outline-offset:3px}
.dpd-drop.free.melt .item{border-top:0;margin-top:6px;padding-top:0}
.dpd-drop.free.melt .item .nm{font-size:calc(10px*var(--z,1));color:var(--mute2);letter-spacing:.04em}
.dpd-drop.free.melt .f label{color:var(--mute2)}
.dpd-drop.free.melt select,.dpd-drop.free.melt input:not([type=range]):not([type=color]),.dpd-drop.free.melt textarea{background:color-mix(in srgb,#ffffff 62%,var(--bgA));border:1px solid color-mix(in srgb,var(--ink) 7%,transparent);box-shadow:0 2px 7px rgba(60,40,10,.13),inset 0 1px 0 rgba(255,255,255,.7);border-radius:8px}
.dpd-drop.free.melt select:focus,.dpd-drop.free.melt input:focus,.dpd-drop.free.melt textarea:focus{border-color:var(--gold);box-shadow:0 3px 12px rgba(60,40,10,.18),0 0 0 3px color-mix(in srgb,var(--gold) 18%,transparent)}
.dpd-drop.free.melt .tcslot{box-shadow:0 4px 16px rgba(60,40,10,.16)}
.dpd-drop.free.melt .none,.dpd-drop.free.melt .pics img{box-shadow:0 4px 14px rgba(60,40,10,.16)}
/* every colour the settings can change */
.dpd-drop.free{background-image:radial-gradient(var(--dot) 1px,transparent 1.2px)}
.dpd-drop.free .f label,.dpd-drop.free .item .nm,.dpd-drop.free .lab2,.dpd-drop.free.melt .f label,.dpd-drop.free.melt .item .nm{color:var(--lab)}
.dpd-drop.free .tile select,.dpd-drop.free .tile input:not([type=range]):not([type=color]),.dpd-drop.free .tile textarea{background:var(--field);color:var(--fieldInk)}
.dpd-drop.free.melt .tile::after{background:linear-gradient(90deg,var(--lineC) 0,var(--lineC) 40%,color-mix(in srgb,var(--lineC) 30%,transparent) 80%,transparent)}
.dpd-drop.free .go{background:var(--run);color:var(--runInk);box-shadow:0 6px 16px color-mix(in srgb,var(--run) 30%,transparent)}
.dpd-drop.free.melt .tile .th{font-size:calc(13.5px*var(--z,1));font-weight:800;letter-spacing:.12em}
/* the Text Clip: the page's main event, melted into the paper in the sheet's own colours, inside a dark tan frame */
.dpd-drop.free .tcslot{border:3px solid var(--clipEdge);border-radius:16px;box-shadow:0 6px 22px rgba(60,40,10,.2),inset 0 0 0 1px color-mix(in srgb,#fff 30%,transparent)}
.dpd-drop.free:not(.clipown) .tcslot>.dtc{--dtc-bg:var(--clipBg)!important;--dtc-pane:var(--clipPane)!important;--dtc-text:var(--ink)!important;--dtc-dim:var(--mute)!important;--dtc-line:color-mix(in srgb,var(--clipEdge) 35%,transparent)!important;--dtc-ai:var(--gold)!important;--dtc-you:var(--title)!important;--dtc-out:var(--clipEdge)!important;border-radius:13px}
.dpd-drop.free .tile[data-zone=prompt] .item>.nm{display:none}
.dpd-drop.free:not(.clipown) .tcslot .dtc-head{color:var(--clipHead)!important;font-size:calc(11.5px*var(--z,1))!important;font-weight:800!important;letter-spacing:.12em!important;padding:6px 10px 3px!important}
.dpd-drop.free:not(.clipown) .tcslot .dtc-head .n{font-size:calc(10.5px*var(--z,1));font-weight:500;letter-spacing:0;color:var(--mute)}
.dpd-drop.free .tile[data-zone=prompt] .th{font-size:calc(15px*var(--z,1))}
.dpd-drop.free .colors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px;margin:4px 0 12px}
.dpd-drop.free .colors label{display:flex;align-items:center;gap:7px;font:600 calc(11px*var(--z,1)) var(--fl,Karla);color:var(--ink2);cursor:pointer;min-width:0}
.dpd-drop.free .colors label span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpd-drop.free .colors input[type=color]{width:26px;height:22px;padding:0;border:1px solid var(--edge);border-radius:6px;background:none;cursor:pointer;flex:none}
.dpd-drop.free .colors i{font-style:normal;font-size:calc(9px*var(--z,1));color:var(--mute2);letter-spacing:.06em}
.dpd-drop.free .colors button{border:0;background:none;color:var(--mute2);cursor:pointer;padding:0 2px;font-size:13px;line-height:1}.dpd-drop.free .colors button:hover{color:var(--ink)}
.dpd-drop.free .set .hh{display:flex;align-items:center;gap:8px;margin:10px 0 6px;font:800 calc(10px*var(--z,1)) var(--fl,Karla);letter-spacing:.13em;color:var(--mute);text-transform:uppercase}.dpd-drop.free .set .hh .sp{flex:1}
.dpd-drop.free .set .pal{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.dpd-drop.free .set .pal button{display:flex;align-items:center;gap:6px;border:1px solid var(--edge);background:var(--s1);color:var(--ink2);border-radius:999px;padding:3px 10px 3px 4px;font:700 calc(10.5px*var(--z,1)) var(--fl,Karla);cursor:pointer}
.dpd-drop.free .set .pal button b{width:16px;height:16px;border-radius:50%;box-shadow:inset -6px 0 0 var(--a)}
.dpd-drop.free .set .mini{border:1px solid var(--edge);background:var(--s1);color:var(--ink2);border-radius:999px;padding:3px 10px;font:700 calc(10px*var(--z,1)) var(--fl,Karla);cursor:pointer;letter-spacing:.04em}
.dpd-drop.free .set .xrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 10px;font:500 calc(11px*var(--z,1)) var(--fl,Karla);color:var(--mute)}
.dpd-drop.free .set .xrow .xr{margin:0}
.dpd-drop.free .set .rec{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--edge2)}.dpd-drop.free .set .rec:last-of-type{border-bottom:1px solid var(--edge2)}
.dpd-drop.free .set .rec>div{flex:1;min-width:0}.dpd-drop.free .set .rec b{display:block;font:800 calc(11.5px*var(--z,1)) var(--fl,Karla);color:var(--title)}
.dpd-drop.free .set .rec small{display:block;font:400 calc(10.5px*var(--z,1))/1.35 var(--fl,Karla);color:var(--mute)}
.dpd-drop.free .set .rec .have{display:inline-flex;align-items:center;gap:4px;font:600 calc(10.5px*var(--z,1)) var(--fl,Karla);color:var(--mute);white-space:nowrap}
.dpd-drop.free .set .rec .mini{white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
.dpd-drop.free .set .xrow .seg2{display:flex;border:1px solid var(--edge);border-radius:999px;overflow:hidden}
.dpd-drop.free .set .xrow .seg2 button{border:0;background:transparent;color:var(--mute);padding:4px 12px;font:700 calc(10.5px*var(--z,1)) var(--fl,Karla);cursor:pointer}
.dpd-drop.free .set .xrow .seg2 button.on{background:var(--gold);color:var(--runInk)}
/* Run and the gear, top right: the gear in the section titles' colour */
.dpd-drop.free .tops{position:absolute;top:8px;right:8px;display:flex;align-items:center;gap:8px;z-index:8}
.dpd-drop.free .tops .go{margin:0;width:auto;padding:6px 16px;font-size:calc(12px*var(--z,1));color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.25)}.dpd-drop.free .tops .go svg{stroke:#fff}
.dpd-drop.free .tops .gear{position:static;color:var(--title);border:1.5px solid color-mix(in srgb,var(--title) 50%,transparent);background:color-mix(in srgb,var(--bgA) 70%,#fff)}
.dpd-drop.free .tops .gear{width:30px;height:30px}.dpd-drop.free .tops .gear svg{stroke-width:2.3;width:17px;height:17px}
.dpd-drop.free .tops .gear:hover,.dpd-drop.free .tops .gear.on{color:var(--title);border-color:var(--title)}
/* title bands: one colour for the whole sheet from the settings, or each section its own */
.dpd-drop.free.hasband .tile .th{background:var(--headBg);color:var(--headInk)}
.dpd-drop.free.melt.hasband .tile .th,.dpd-drop.free.melt .tile .th.band{padding:6px 10px;margin:-2px -6px 6px}
.dpd-drop.free.hasband .tile .th,.dpd-drop.free .tile .th.band{border-radius:var(--hr,8px)}
.dpd-drop.free .set h4{display:flex;align-items:center;gap:6px}.dpd-drop.free .set h4 .sp{flex:1}
.dpd-drop.free .set h4 .mini,.dpd-drop.free .tpop .done .mini{font-family:var(--fl,Karla)}
.dpd-drop.free .mini.ok2{background:var(--title);color:#fff;border-color:transparent}
.dpd-drop.free .tpop .done{display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--edge2);padding-top:8px;margin-top:2px}
.dpd-drop.free .tile .th.band button,.dpd-drop.free .tile .th.band .grip,.dpd-drop.free.hasband .tile .th button,.dpd-drop.free.hasband .tile .th .grip{color:inherit;opacity:.75}
.dpd-drop.free.melt .tile.styled{padding:8px 10px 16px;border-radius:var(--r,12px);box-shadow:0 4px 14px rgba(60,40,10,.14)}
/* a section's own look */
.dpd-drop.free .tile.popped{z-index:7}
.dpd-drop.free .tpop{position:absolute;top:34px;right:6px;width:270px;z-index:9;padding:10px 12px;border-radius:12px;background:var(--t1);border:1px solid var(--edge);box-shadow:0 14px 34px rgba(40,25,5,.28);text-transform:none;letter-spacing:0}
.dpd-drop.free .tpop .tph{display:flex;align-items:center;gap:6px;font:600 calc(11px*var(--z,1)) var(--fl,Karla);color:var(--ink2);margin-bottom:8px}.dpd-drop.free .tpop .tph .sp{flex:1}
.dpd-drop.free .tpop .tph button{border:0;background:none;color:var(--mute2);cursor:pointer;display:flex}
.dpd-drop.free .tpop .bandsw{display:flex;gap:5px;flex-wrap:wrap;margin:0 0 8px}
.dpd-drop.free .tpop .bandsw button{width:20px;height:20px;border-radius:6px;border:1.5px solid color-mix(in srgb,var(--ink) 18%,transparent);cursor:pointer;padding:0}
.dpd-drop.free .tpop .bandsw button.on{outline:2px solid var(--gold);outline-offset:1px}
.dpd-drop.free .start{flex-wrap:wrap}.dpd-drop.free .start>div{flex:1 1 140px}
.dpd-drop.free .tile[data-zone=pictures]{display:flex;flex-wrap:wrap;align-content:flex-start;column-gap:12px}
.dpd-drop.free .tile[data-zone=pictures]>*{flex:1 1 100%}
.dpd-drop.free .tile[data-zone=pictures]>.item{flex:1 1 150px;min-width:0;border-top:0;margin-top:6px;padding-top:0}
.dpd-drop.free .tile[data-zone=pictures]>.rs,.dpd-drop.free .tile[data-zone=pictures]>.tpop{flex:none}
.dpd-drop.free .tile[data-zone=pictures] .start{flex-direction:column}
.dpd-drop.free .tile[data-zone=pictures] .start img,.dpd-drop.free .tile[data-zone=pictures] .noimg{width:100%;height:auto;max-height:var(--ph,260px);aspect-ratio:auto;object-fit:contain}
.dpd-drop.free .tile[data-zone=results] .pics img,.dpd-drop.free .tile[data-zone=results] .pics video{max-height:var(--ph,none);object-fit:contain}
.dpd-drop.free .tile[data-zone=pictures] .noimg{height:120px}
.dpd-drop.free .tile[data-zone=pictures] .start>div{flex:none;width:100%}
.dpd-drop.free .tpop .swtabs{display:flex;align-items:center;gap:4px;margin:0 0 6px}.dpd-drop.free .tpop .swtabs .sp{flex:1}
.dpd-drop.free .tpop .swtabs button{white-space:nowrap;border:1px solid var(--edge);background:transparent;color:var(--mute);border-radius:999px;padding:2px 9px;font:700 calc(10px*var(--z,1)) var(--fl,Karla);cursor:pointer}
.dpd-drop.free .tpop .swtabs button.on{background:var(--title);color:#fff;border-color:transparent}
.dpd-drop.free .tpop .bandsw .mc{position:relative;display:inline-flex}
.dpd-drop.free .tpop .bandsw .mc i{position:absolute;top:-6px;right:-6px;width:13px;height:13px;border-radius:50%;background:var(--t1);border:1px solid var(--edge);color:var(--ink2);font:700 10px/11px var(--fl,Karla);text-align:center;font-style:normal;cursor:pointer;opacity:0;transition:opacity .12s}
.dpd-drop.free .tpop .bandsw .mc:hover i{opacity:1}.dpd-drop.free .tpop .bandsw .mc i:hover{background:var(--red);color:#fff;border-color:transparent}
.dpd-drop.free .tpop .bandsw .eye{width:22px;height:20px;border-radius:6px;border:1.5px solid color-mix(in srgb,var(--ink) 18%,transparent);background:var(--field);color:var(--ink2);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.dpd-drop.free .tpop .bandsw .eye:hover,.dpd-drop.free .eye2:hover{color:var(--gold)}
.dpd-drop.free .colors .eye2{display:flex;opacity:0;transition:opacity .15s;color:var(--mute)!important;padding:0 2px!important}.dpd-drop.free .colors label:hover .eye2{opacity:1}
.dpd-drop.free .tpop .bandsw .any{position:relative;width:20px;height:20px;border-radius:50%;background:conic-gradient(#e44,#ec4,#4c6,#4ce,#46e,#c4e,#e44);box-shadow:0 0 0 1.5px color-mix(in srgb,var(--ink) 18%,transparent);cursor:pointer;overflow:hidden}
.dpd-drop.free .tpop .bandsw .any input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;padding:0;border:0}
.dpd-drop.free .tpop .lk2{font:800 calc(9.5px*var(--z,1)) var(--fl,Karla);letter-spacing:.13em;text-transform:uppercase;color:var(--mute);margin:4px 0 6px}
.dpd-drop.free .tpop .looks{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
.dpd-drop.free .tpop .chip{display:inline-flex;align-items:center;gap:4px;padding:3px 4px 3px 4px;border-radius:999px;border:1px solid var(--edge);background:var(--s1);font:700 calc(10.5px*var(--z,1)) var(--fl,Karla);color:var(--ink2);cursor:pointer}
.dpd-drop.free .tpop .chip:hover{border-color:var(--gold)}
.dpd-drop.free .tpop .chip i{width:12px;height:12px;border-radius:4px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 20%,transparent)}
.dpd-drop.free .tpop .chip button{border:0;background:none;color:var(--mute2);cursor:pointer;padding:0 3px;font-size:12px;line-height:1}.dpd-drop.free .tpop .chip button:hover{color:var(--red)}
.dpd-drop.free .tpop .none2{font:italic 400 calc(11px*var(--z,1)) var(--fh,Fraunces),serif;color:var(--mute2)}
.dpd-drop.free .tpop input[data-lookname]{background:var(--field);border:1px solid var(--edge);border-radius:7px;padding:4px 8px;color:var(--ink);font:500 calc(11.5px*var(--z,1)) var(--fl,Karla)}
.dpd-drop.free .tpop .mini[disabled]{opacity:.45;cursor:default}
.dpd-drop.free .tpop .bandsw .none{background:var(--field);color:var(--mute);font-size:12px;line-height:1}
.dpd-drop .paper,.dpd-drop.free .blank{cursor:grab}
.dpd-drop .tile,.dpd-drop .set,.dpd-drop .tops,.dpd-drop .foot,.dpd-drop .grpbar{cursor:auto}
.dpd-drop.free .tpop .colors{grid-template-columns:1fr;margin:0 0 8px}
.dpd-drop.free .tpop .xrow{margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;font:600 calc(11px*var(--z,1)) var(--fl,Karla);color:var(--ink2)}.dpd-drop.free .tpop .xrow .pct{min-width:30px}.dpd-drop.free .tpop input[type=range]{flex:1;accent-color:var(--gold)}
/* groups: picked sections, and a dashed line round each group */
.dpd-drop.free .tile.picked{outline:2px solid var(--title)!important;outline-offset:5px;border-radius:var(--r,12px)}
.dpd-drop.free .th .lk.on{color:var(--title)!important;opacity:1!important}.dpd-drop.free .th .lk.pick{color:var(--gold)!important;opacity:1!important}
.dpd-drop.free .grpbox{position:absolute;border:1.5px dashed color-mix(in srgb,var(--title) 50%,transparent);border-radius:calc(var(--r,12px) + 8px);pointer-events:none;background:color-mix(in srgb,var(--title) 3%,transparent)}
.dpd-drop.free.leaving .paper{outline:2.5px dashed #b4553f;outline-offset:-8px}
.dpd-drop.free .tile.leaving{opacity:.45}
.dpd-drop.free .tile.copying{outline:2px dashed var(--title);outline-offset:4px;border-radius:var(--r,12px)}
.dpd-drop.free.copymode,.dpd-drop.free.copymode *{cursor:copy!important}
.dpd-drop.free .leavehint.copy{background:var(--title)}
.dpd-drop.free .tile.nocopy{animation:dpdno .3s 2}@keyframes dpdno{50%{transform:translateX(4px)}}
.dpd-drop.free .leavehint{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:10;padding:7px 16px;border-radius:999px;background:#b4553f;color:#fff;font:700 calc(12px*var(--z,1)) var(--fl,Karla);box-shadow:0 8px 22px rgba(60,20,10,.3);pointer-events:none;white-space:nowrap}
.dpd-drop.free .grpbar{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:9;display:flex;align-items:center;gap:8px;padding:5px 6px 5px 14px;border-radius:999px;background:var(--t1);border:1px solid var(--edge);box-shadow:0 8px 22px rgba(40,25,5,.22);font:600 calc(11.5px*var(--z,1)) var(--fl,Karla);color:var(--ink2);white-space:nowrap}
.dpd-drop.free .grpbar .mini{border:1px solid var(--edge);background:var(--s1);color:var(--ink2);border-radius:999px;padding:4px 12px;font:700 calc(10.5px*var(--z,1)) var(--fl,Karla);cursor:pointer}
.dpd-drop.free .grpbar .mini.go2{background:var(--title);color:#fff;border-color:transparent}`;
// what the settings can colour: [key, name, what it is]
const COLORS = [["paper", "Paper", "the page"], ["accent", "Accent", "buttons, glow, focus"], ["title", "Section titles", "LOADERS, PROMPT…"], ["ink", "Words", "names and text"], ["lab", "Small labels", "steps, cfg, width…"],
  ["field", "Fields", "boxes you type in"], ["fieldInk", "Field words", "what's typed in them"], ["lineC", "Section lines", "under each section (Melt)"], ["clipEdge", "Text Clip frame", "the dark tan border"], ["clipBg", "Text Clip page", "behind its boxes"],
  ["clipPane", "Text Clip boxes", "where you write"], ["clipHead", "Text Clip headings", "CLAUDE, YOUR WORDS, GOES TO THE MODEL"], ["run", "Run button", "Run sheet"], ["dot", "Paper dots", "the dotted grid"], ["headBg", "Title bands", "a colour bar behind LOADERS, SAMPLER… (none until you pick one)"]];
const PALETTES = [["Tan", "#e3cfa9", "#8a5a2b"], ["Linen", "#f1ebe0", "#9b6b43"], ["Sage", "#d9e2cf", "#4f6b3e"], ["Sky", "#dde7f0", "#3d6690"], ["Blush", "#f0dcd8", "#9c4a5a"], ["Night", "#1d1a22", "#e8b64c"], ["Forest", "#1f2e1d", "#c9c08a"]];
let freeDressed = false;
// how long the render has been going, the last and best times, and what's waiting
const RUN = { t0: 0, on: false, last: null, best: null, q: 0, err: false };
const fmtT = ms => ms == null ? "–:––" : `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(1).padStart(4, "0")}`;
const clockFace = () => ({
  big: fmtT(RUN.on ? Date.now() - RUN.t0 : RUN.last ?? 0),
  st: RUN.on ? (PROG && PROG[1] > 1 ? `Rendering · step ${PROG[0]} of ${PROG[1]}` : "Rendering…") : RUN.err ? "Stopped" : RUN.last != null ? "Done" : "Ready",
  sm: `last ${fmtT(RUN.last)} · best ${fmtT(RUN.best)}${RUN.q ? ` · ${RUN.q} waiting` : ""}`,
});
const clockPaint = () => { const f = clockFace(); document.querySelectorAll(".dpd-drop .clk").forEach(c => { c.querySelector(".big").textContent = f.big; c.querySelector(".st").textContent = f.st; c.querySelector(".sm").textContent = f.sm; c.classList.toggle("running", RUN.on); }); };
setInterval(() => { if (RUN.on) clockPaint(); }, 100);
// how full the graphics card and the memory are: VRAM outside, GPU load in the middle, RAM inside
const HW = { vram: null, gpu: null, ram: null, at: 0 };
const lvlC = v => v == null ? "#5a5560" : v < 60 ? "#3dff9a" : v < 80 ? "#ffe14a" : v < 92 ? "#ff9b2f" : "#ff3b5c";
const RINGS = [["vram", 86, 13], ["gpu", 67, 10], ["ram", 51, 8]];
const meterSvg = () => `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="98" class="face"/>${RINGS.map(([k, r, w]) => `<circle cx="100" cy="100" r="${r}" stroke-width="${w}" class="trk" style="stroke-dasharray:${(.75 * 2 * Math.PI * r).toFixed(1)} 999"/><circle cx="100" cy="100" r="${r}" stroke-width="${w}" class="val" data-ring="${k}"/>`).join("")}
  <text x="100" y="104" class="mv">–</text><text x="100" y="128" class="ml">VRAM</text></svg>`;
const meterPaint = () => document.querySelectorAll(".dpd-drop .mtr").forEach(m => {
  for (const [k, r] of RINGS) { const v = HW[k], a = m.querySelector(`[data-ring="${k}"]`), L = .75 * 2 * Math.PI * r; if (!a) continue; a.style.strokeDasharray = `${((v ?? 0) / 100 * L).toFixed(1)} 999`; a.style.color = a.style.stroke = lvlC(v); }
  const mv = m.querySelector(".mv"); mv.textContent = HW.vram == null ? "–" : `${Math.round(HW.vram)}%`; mv.style.fill = mv.style.color = lvlC(HW.vram);
  const pc = v => v == null ? "–" : `${Math.round(v)}%`;
  m.querySelector(".mleg").innerHTML = RINGS.map(([k]) => `<span ${k === "gpu" && HW.gpu == null ? `title="GPU load comes from the Crystools monitor, which is switched off (its refresh rate in Settings is 0)"` : ""}><i style="background:${lvlC(HW[k])};color:${lvlC(HW[k])}"></i>${{ vram: "VRAM", gpu: "GPU", ram: "RAM" }[k]} <b>${pc(HW[k])}</b></span>`).join("");
});
const hwPoll = async () => {   // without Crystools sending its numbers, ComfyUI's own stats (no GPU load in those)
  if (!document.querySelector(".dpd-drop .mtr") || Date.now() - HW.at < 4000) return;
  try {
    const j = await (await api.fetchApi("/system_stats")).json(), d = j.devices?.[0], sy = j.system || {};
    HW.vram = d?.vram_total ? (1 - d.vram_free / d.vram_total) * 100 : null; HW.ram = sy.ram_total ? (1 - sy.ram_free / sy.ram_total) * 100 : null; meterPaint();
  } catch {}
};
setInterval(hwPoll, 2000);
const OWN = ["clock", "meter", "board"];
const START_OPTS = ["Ask each time", "Blank page", "Laid out", "Image starter", "Video starter", "Tidy grid"];   // the sheet's own cards, not parts
const CLOCK_COLS = [["", "Header brown"], ["#ff2a2a", "Alarm red"], ["#3dff9a", "Neon green"], ["#5ad8ff", "Ice blue"], ["#ffb02e", "Amber"]];
const OWN_CSS = `
.dpd-drop .tile.own .clk{--cc:var(--title);container-type:inline-size;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 8px 10px;border-radius:calc(var(--r,10px)*.8);margin-top:4px}
.dpd-drop .clk.dark{background:#0c090e;box-shadow:inset 0 0 0 1px #000,inset 0 3px 14px rgba(0,0,0,.85)}
.dpd-drop .clk .big{font:400 clamp(30px,22cqw,190px)/1 "Share Tech Mono",ui-monospace,monospace;color:var(--cc);letter-spacing:.03em;font-variant-numeric:tabular-nums;white-space:nowrap}
.dpd-drop .clk .st{font:700 clamp(13px,6.2cqw,44px)/1.2 var(--fl,Karla),sans-serif;color:var(--cc);opacity:.9}
.dpd-drop .clk .sm{font:400 clamp(11px,4.2cqw,28px)/1.3 "Share Tech Mono",ui-monospace,monospace;color:var(--cc);opacity:.72;text-align:center}
.dpd-drop .clk.glow .big,.dpd-drop .clk.glow .st{text-shadow:0 0 6px var(--cc),0 0 20px color-mix(in srgb,var(--cc) 55%,transparent)}
.dpd-drop .clk.running .big{animation:dpdtick 1s steps(2) infinite}
@keyframes dpdtick{50%{opacity:.88}}
.dpd-drop .mtr{display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:4px}
.dpd-drop .mtr svg{width:100%;max-width:560px;height:auto;overflow:visible}
.dpd-drop .mtr .face{fill:#0c090e;stroke:color-mix(in srgb,var(--ink) 25%,transparent);stroke-width:2}
.dpd-drop .mtr circle.trk,.dpd-drop .mtr circle.val{fill:none;transform:rotate(135deg);transform-origin:100px 100px;stroke-linecap:round}
.dpd-drop .mtr .trk{stroke:rgba(255,255,255,.07)}
.dpd-drop .mtr .val{stroke-dasharray:0 999;transition:stroke-dasharray .7s ease,stroke .7s;filter:drop-shadow(0 0 4px currentColor) drop-shadow(0 0 9px currentColor)}
.dpd-drop .mtr .mv{font:400 44px "Share Tech Mono",ui-monospace,monospace;text-anchor:middle;dominant-baseline:middle;filter:drop-shadow(0 0 6px currentColor);transition:fill .7s}
.dpd-drop .mtr .ml{font:700 11px var(--fl,Karla),sans-serif;letter-spacing:.2em;text-anchor:middle;fill:#cfc6d6;opacity:.75}
.dpd-drop .mtr .mleg{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;font-size:calc(12px*var(--z,1));color:var(--ink2)}
.dpd-drop .mtr .mleg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;box-shadow:0 0 6px currentColor;vertical-align:middle}
.dpd-drop.free .tops .lkb{position:relative;height:30px;min-width:30px;padding:0 7px;border-radius:15px;display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--title);border:1.5px solid color-mix(in srgb,var(--title) 50%,transparent);background:color-mix(in srgb,var(--bgA) 70%,#fff)}
.dpd-drop.free .tops .lkb.on{background:var(--title);color:#fff;border-color:var(--title)}.dpd-drop.free .tops .lkb b{font:700 12px var(--fl,Karla)}
.dpd-drop.free .linkmenu{position:absolute;top:46px;right:8px;width:min(330px,calc(100% - 16px));z-index:9;padding:10px 12px;border-radius:var(--r,12px);background:var(--t1);border:1px solid var(--edge);box-shadow:0 14px 34px rgba(40,25,5,.28);display:flex;flex-direction:column;gap:6px;color:var(--ink)}
.dpd-drop.free .linkmenu h5{display:flex;align-items:center;margin:0;font:600 calc(14px*var(--z,1)) var(--fh,Fraunces),serif}
.dpd-drop.free .linkmenu .lmq{display:flex;gap:6px;flex-wrap:wrap}
.dpd-drop.free .linkmenu .lmr{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center;font-weight:600;cursor:pointer}.dpd-drop.free .linkmenu .lmr small{grid-column:2;color:var(--mute);font-weight:400}
.dpd-drop.free .linkmenu .lmn,.dpd-drop.free .linkmenu em{color:var(--mute);font-size:calc(11px*var(--z,1))}
.dpd-drop.free .plug{position:absolute;right:-1px;top:50%;transform:translateY(-50%);width:22px;height:44px;border-radius:12px 0 0 12px;background:color-mix(in srgb,var(--title) 22%,var(--bgA));border:1.5px solid color-mix(in srgb,var(--title) 45%,transparent);border-right:0;color:var(--title);display:flex;align-items:center;justify-content:center;cursor:crosshair;z-index:7}
.dpd-drop.free .plug.on{background:var(--title);color:#fff}
.dpd-drop.free .tile .pwr2{color:var(--mute)}.dpd-drop.free .tile .pwr2.on{color:#2f9e5b}
.dpd-drop.free .tile.off>:not(.th):not(.rs){opacity:.4;filter:grayscale(1)}.dpd-drop.free .tile.off .th{text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--ink) 40%,transparent)}
.dpd-drop.free.sheetoff .paper>.tile:not(.own){filter:grayscale(.85);opacity:.55}
.dpd-drop.free .chooser{position:absolute;inset:44px 14px 14px;z-index:9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;border-radius:var(--r,12px);background:color-mix(in srgb,var(--bgA) 88%,#fff);border:1.5px solid color-mix(in srgb,var(--title) 35%,transparent);box-shadow:0 14px 34px rgba(60,40,10,.18);overflow:auto}
.dpd-drop.free .chooser h3{margin:0;font:600 calc(20px*var(--z,1)) var(--fh,Fraunces),serif;color:var(--title)}
.dpd-drop.free .chooser .chs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;width:100%;max-width:820px}
.dpd-drop.free .chooser .chs button{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:12px;border-radius:12px;cursor:pointer;text-align:left;background:color-mix(in srgb,#fff 55%,var(--bgA));border:1.5px solid color-mix(in srgb,var(--ink) 14%,transparent);color:var(--ink);transition:transform .15s,border-color .15s,box-shadow .15s}
.dpd-drop.free .chooser .chs button:hover{transform:translateY(-2px);border-color:var(--title);box-shadow:0 8px 18px rgba(60,40,10,.18)}
.dpd-drop.free .chooser .chs svg{stroke:var(--title)}.dpd-drop.free .chooser .chs b{font:700 calc(14px*var(--z,1)) var(--fl,Karla)}.dpd-drop.free .chooser .chs small{color:var(--mute);font-size:calc(11.5px*var(--z,1));line-height:1.35}
.dpd-drop.free .chooser .chk{display:flex;align-items:center;gap:6px;color:var(--ink2);font-size:calc(12px*var(--z,1));cursor:pointer}.dpd-drop.free .chooser .chk small{color:var(--mute)}
.dpd-drop.free .fixbar{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:9;display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:min(560px,calc(100% - 260px));padding:5px 6px 5px 8px;border-radius:16px;background:#ffe9b8;border:1.5px solid #d99a2b;box-shadow:0 6px 18px rgba(120,70,0,.22);color:#5a3a06}
.dpd-drop.free .fixbar.low{top:44px}
.dpd-drop.free .foot .miss{display:none}   /* the bar at the top says it all now */
.dpd-drop.free .fixbar .fxh{display:flex;align-items:center;gap:6px;background:none;border:0;cursor:pointer;color:inherit;font:600 calc(12px*var(--z,1)) var(--fl,Karla)}
.dpd-drop.free .fixbar .fxh svg{stroke:#c87a00}.dpd-drop.free .fixbar .fxh b{font-weight:800}.dpd-drop.free .fixbar .fxh span{opacity:.7;text-decoration:underline}
.dpd-drop.free .fixbar .fxl{flex-basis:100%;display:flex;flex-direction:column;gap:5px;padding:4px 2px 2px}
.dpd-drop.free .fixbar .fxl>div{display:flex;align-items:center;gap:8px;justify-content:space-between;font-size:calc(12px*var(--z,1))}
.dpd-drop.free .offnote{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:8;display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:14px;background:#2a2026;color:#fff;font:700 calc(12px*var(--z,1)) var(--fl,Karla)}
.dpd-drop .board{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.dpd-drop .board .bhint{color:var(--mute);font-size:calc(12px*var(--z,1));font-style:italic}
.dpd-drop .board .bsub{margin-top:4px;font:700 calc(10px*var(--z,1)) var(--fl,Karla);letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.dpd-drop .board .chainstrip{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px;border-radius:10px;background:#0c090e}
.dpd-drop .board .pill{background:transparent;box-shadow:none;padding:5px 11px;border-radius:14px;font:700 calc(12px*var(--z,1)) var(--fl,Karla);color:#cfc6d6;border:1.5px solid #3a3040;transition:all .3s}
.dpd-drop .board .pill.now{color:#0c090e;background:#3dff9a;border-color:#3dff9a;box-shadow:0 0 10px #3dff9a,0 0 22px rgba(61,255,154,.5)}
.dpd-drop .board .pill.off{opacity:.4;text-decoration:line-through}.dpd-drop .board .arr{color:#6d6275}
.dpd-drop .board .brow{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center;padding:6px 8px;border-radius:10px;background:color-mix(in srgb,#fff 35%,transparent)}
.dpd-drop .board .brow.off{opacity:.6}
.dpd-drop .board .bnm b{display:block;font:700 calc(13px*var(--z,1)) var(--fl,Karla);color:var(--ink)}.dpd-drop .board .bnm small{color:var(--mute);font-size:calc(11px*var(--z,1))}
.dpd-drop .board .pwr{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid #b9aab0;background:#e9e1d6;color:#8d7f86}
.dpd-drop .board .pwr.on{border-color:#2f9e5b;background:#2f9e5b;color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,#2f9e5b 25%,transparent)}
.dpd-drop .board .bsecs{grid-column:2;display:flex;gap:5px;flex-wrap:wrap}
.dpd-drop .board .bsecs button{display:flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;cursor:pointer;font:600 calc(11px*var(--z,1)) var(--fl,Karla);border:1.5px solid #b9aab0;background:transparent;color:var(--mute)}
.dpd-drop .board .bsecs button.on{border-color:#2f9e5b;color:#1f7a44;background:color-mix(in srgb,#2f9e5b 12%,transparent)}
.dpd-drop .ownpick{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.dpd-drop .ownpick .sw{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
.dpd-drop .ownpick .sw.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--bgA)}
`;
const GAP = 14, CARD = 300, GRID = 22;
let LOOKS = [];   // saved section looks: [{ name, s }]
api.fetchApi("/userdata/dpd_sheet_looks.json").then(r => r.ok ? r.json() : []).then(j => { LOOKS = Array.isArray(j) ? j : []; }).catch(() => {});
let MYCOLS = [], SWSET = "comfy";   // your own colours, and which row of swatches shows
api.fetchApi("/userdata/dpd_sheet_colors.json").then(r => r.ok ? r.json() : []).then(j => { MYCOLS = Array.isArray(j) ? j : []; if (MYCOLS.length) SWSET = "mine"; }).catch(() => {});
const saveCols = () => api.fetchApi("/userdata/dpd_sheet_colors.json?overwrite=true", { method: "POST", body: JSON.stringify(MYCOLS) }).catch(() => {});
const addMy = (...vs) => { for (let v of vs) { v = toHex(v); if (/^#[\da-f]{6}$/i.test(v)) MYCOLS = [v, ...MYCOLS.filter(x => x !== v)]; } MYCOLS = MYCOLS.slice(0, 36); saveCols(); };
// the main colours of pictures: a few from each, no two alike
function picColors(imgs, each = 4) {
  const out = [];
  for (const im of imgs) {
    try {
      if (!im.complete || !im.naturalWidth) continue;
      const cv = document.createElement("canvas"); cv.width = cv.height = 48; const x = cv.getContext("2d"); x.drawImage(im, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data, cnt = {}; let took = 0;
      for (let i = 0; i < d.length; i += 4) { const k = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`; cnt[k] = (cnt[k] || 0) + 1; }
      for (const [k] of Object.entries(cnt).sort((a, b) => b[1] - a[1])) {
        const c = k.split(",").map(v => (+v << 4) + 8);
        if (out.every(o => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > 56)) { out.push(c); if (++took >= each) break; }
      }
    } catch {}   // a picture from elsewhere can't be read
  }
  return out.map(c => "#" + c.map(v => Math.min(255, v).toString(16).padStart(2, "0")).join(""));
}
const saveLooks = () => api.fetchApi("/userdata/dpd_sheet_looks.json?overwrite=true", { method: "POST", body: JSON.stringify(LOOKS) }).catch(() => {});   // the grid is the paper's dots
class BlankSheet extends DropSheet {
  constructor() {
    super("Blank Sheet");
    if (!freeDressed) { freeDressed = true; const c = document.createElement("style"); c.textContent = FREE_CSS + OWN_CSS; document.head.appendChild(c); }
    this.el.classList.add("free");
    Object.assign(this.properties, { free: {}, look: { paper: "#e3cfa9", accent: "#8a5a2b", r: 10 } });
    const wd = this.widgets?.find(w => w.name === "sheet"); if (wd?.options) wd.options.getMinHeight = () => 200;   // the page is as tall as you drag it
    this.size = [820, 560];
    this.el.addEventListener("change", e => { const v = e.target.closest("[data-startsel]")?.value; if (v) app.extensionManager?.setting?.set?.("DPD.Sheet.Start", v); });
    this.el.addEventListener("input", e => { const c = e.target.closest("[data-clockcin]"); if (c) { this.properties.clockC = c.value; this.el.querySelectorAll(".clk").forEach(k => { k.style.setProperty("--cc", c.value); k.classList.add("glow"); }); changed(); } });
    setTimeout(() => { if (!this._loaded && this.graph) this.startAs(); }, 60);
    this.el.addEventListener("pointerdown", e => { if (!e.target.closest("[data-plug]")) return; e.preventDefault(); e.stopPropagation(); this.plugDrag(e); }, true);
  }
  startAs() {
    const how = app.extensionManager?.setting?.get?.("DPD.Sheet.Start") ?? app.ui?.settings?.getSettingValue?.("DPD.Sheet.Start") ?? "Ask each time";
    if (how === "Ask each time") { if (this.type === SHEET) { this.properties.choosing = true; this.render(); } return; }   // the older Blank Sheet just starts blank
    this.startWith(how);
  }
  startWith(how) {
    const P = this.properties; delete P.choosing;
    if (how === "Laid out") {
      P.clock = P.meter = true; this.homeOwn("clock"); this.homeOwn("meter");
      for (const t of ["DPDTextClip", "Comfy Blueprint", "DPD System Check"]) { if (!LiteGraph.registered_node_types[t]) continue; const n = LiteGraph.createNode(t); if (n) { graph().add(n); this.absorb(n); } }
    } else if (how === "Image starter" || how === "Video starter") {   // a sampler, then whatever it needs, each wired in
      if (how === "Video starter") P.kind = "video";
      const k = LiteGraph.createNode("KSampler"); if (k) { graph().add(k); this.absorb(k); } this.fixAll();
    } else if (how === "Tidy grid") P.grid = true;
    this.render(); changed();
  }
  chooserHtml() {
    const C = [["Blank page", "layers", "Just the paper. Drop anything on it."], ["Laid out", "dial", "The timer, memory ring, Text Clip, Comfy Blueprint and System Check."], ["Image starter", "photo", "Loaders, prompt, sampler, size and results, ready to fill in."],
      ["Video starter", "film", "The same for video: frames, sampler and a saved video."], ["Tidy grid", "wide", "Sections arrange themselves in neat rows. Drag one to reorder."]];
    return `<div class="chooser"><h3>How would you like to start?</h3><div class="chs">${C.map(([v, i, t]) => `<button data-startpick="${v}">${svg(i, 22)}<b>${v}</b><small>${t}</small></button>`).join("")}</div>
      <label class="chk"><input type="checkbox" data-startkeep> Always start this way <small>(change it later in the gear, or in ComfyUI's Settings)</small></label></div>`;
  }
  // Tidy grid: every card in rows, in the page's order, the sheet's own cards first
  cardW(z) { return z === "prompt" ? (this.properties.helpers.textclip ? 620 : 540) : (z === "results" || z === "flow" || z.startsWith("step:")) ? 360 : z === "system" ? 440 : z === "clock" ? 352 : z === "meter" ? 264 : z === "board" ? 380 : z.startsWith("face:") ? 900 : CARD; }
  gridLay(tiles, F, room) {
    const P = this.properties, rank = z => OWN.includes(z) ? OWN.indexOf(z) - 10 : (P.order.indexOf(z) + 1 || 999);
    let x = GRID, y = GRID, rowH = 0;
    for (const t of [...tiles].sort((a, b) => rank(a.dataset.zone) - rank(b.dataset.zone))) {
      const z = t.dataset.zone, w = F[z]?.w || this.cardW(z), lim = y === GRID ? room - 200 : room - GRID;   // the first row keeps clear of Run and the gear
      t.style.width = w + "px"; const h = t.offsetHeight;
      if (x > GRID && x + w > lim) { x = GRID; y += rowH + GAP; rowH = 0; }
      F[z] = { ...(F[z] || {}), x, y, w }; x += w + GAP; rowH = Math.max(rowH, h);
    }
  }
  regrid() {   // a card let go somewhere: the order follows where the cards now sit, row by row
    const P = this.properties, F = P.free || {}, zs = Object.keys(F).filter(z => P.order.includes(z)).sort((a, b) => Math.round(F[a].y / 120) - Math.round(F[b].y / 120) || F[a].x - F[b].x);
    P.order = [...zs, ...P.order.filter(z => !zs.includes(z))];
  }
  // the timer and the ring start in the top left corner; once moved they stay where you put them, even while hidden
  homeOwn(k) { const F = this.properties.free = this.properties.free || {}; if (!F[k]) F[k] = k === "clock" ? { x: GRID, y: GRID, w: 352 } : k === "meter" ? { x: GRID + 352 + GRID, y: GRID, w: 264 } : { x: GRID * 4 + 352 + 264, y: GRID, w: 380 }; this._pin = [...(this._pin || []), k]; }
  ownTiles() {
    const P = this.properties, f = clockFace(), cc = P.clockC || "", bar = (k, icon, name) => `<div class="th"><span class="grip" data-grip title="Drag to move it (next to Results, say)">${svg("grip", 13)}</span>${svg(icon, 13)}${name}<span class="sp"></span><button data-ownhide="${k}" title="Hide it (the gear brings it back)">${svg("x", 12)}</button></div>`;
    return (P.clock ? `<div class="tile wide own" data-zone="clock" draggable="false">${bar("clock", "dial", "Timer")}<div class="clk ${cc ? "glow" : ""} ${P.clockDark ? "dark" : ""} ${RUN.on ? "running" : ""}" ${cc ? `style="--cc:${cc}"` : ""}><div class="big">${f.big}</div><div class="st">${f.st}</div><div class="sm">${f.sm}</div></div></div>` : "")
      + (P.meter ? `<div class="tile own" data-zone="meter" draggable="false">${bar("meter", "spark", "Memory")}<div class="mtr">${meterSvg()}<div class="mleg"></div></div></div>` : "")
      + (P.board ? `<div class="tile wide own" data-zone="board" draggable="false">${bar("board", "power", "Switchboard")}${this.boardHtml()}</div>` : "");
  }
  // everything the page still needs, once each: its sections' needs, and parts whose node pack isn't installed
  allNeeds() {
    const P = this.properties, seen = new Set(), out = [];
    for (const z of [...Object.keys(ZONES), ...(P.order || []).filter(z => String(z).startsWith("step:"))]) for (const n of this.needs(z)) if (!seen.has(n[0])) { seen.add(n[0]); out.push(n); }
    for (const id of this.parts()) { const n = byId(id); if (n && !LiteGraph.registered_node_types[n.type]) out.push([`${n.title || n.type} isn't installed.`, null, null, true]); }
    return out;
  }
  // add each missing node in turn (what one brings can settle the next), each tried once
  fixAll() { const tried = new Set(); for (let i = 0; i < 10; i++) { const t = this.allNeeds().find(x => x[1] && !tried.has(x[1])); if (!t) break; tried.add(t[1]); this.add(t[1]); } this.render(); changed(); }
  // every sheet in the workflow with a switch, and each one's steps: linked sheets first, in the order a picture goes
  boardHtml() {
    const chain = [this, ...this.kin()].sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]), others = allSheets().filter(x => !chain.includes(x));
    const nm = x => esc(/^(Blank|Drop|DPD) Sheet$/.test(x.title) ? `${x.stage()} sheet` : x.title);
    const row = x => {
      const own = !!x.properties.off, off = x.isOff(), secs = [...x.steps().map(id => [`step:${id}`, byId(id)?.title || "Step"]), ...(x.of("out").length ? [["results", "Save / show"]] : [])];
      return `<div class="brow ${off ? "off" : ""}"><button class="pwr ${own ? "" : "on"}" data-boardoff="${x.id}" title="${own ? "Turn this sheet on" : "Turn this sheet off: it won't save or show, and its steps let the picture through"}">${svg("power", 15)}</button><div class="bnm"><b>${nm(x)}</b><small>${x.stage()}${x === this ? " · this sheet" : ""}${off && !own ? " · off: the sheet feeding it is off" : ""}</small></div>${secs.length ? `<div class="bsecs">${secs.map(([z, t]) => `<button class="${x.properties.offZ?.[z] ? "" : "on"}" data-boardz="${x.id}|${z}" title="${z === "results" ? "Save and show the result" : "On: it works on the picture. Off: the picture goes straight through"}">${svg("power", 11)}${esc(t)}</button>`).join("")}</div>` : ""}</div>`;
    };
    return `<div class="board">${chain.length > 1 ? `<div class="chainstrip">${chain.map((x, i) => `${i ? `<span class="arr">→</span>` : ""}<span class="pill ${x.isOff() ? "off" : ""}" data-chainsheet="${x.id}" title="Lights up while it works">${nm(x)}</span>`).join("")}</div>` : `<div class="bhint">Link sheets with the chain button by the gear, or drag the plug on a sheet's right edge onto another sheet.</div>`}
      ${chain.map(row).join("")}${others.length ? `<div class="bsub">Not linked</div>${others.map(row).join("")}` : ""}</div>`;
  }
  linkMenu() {
    const mine = this.links(), all = allSheets().filter(x => x !== this).sort((a, b) => a.pos[0] - b.pos[0]);
    const R = all.filter(x => x.pos[0] > this.pos[0]).sort((a, b) => a.pos[0] - b.pos[0])[0], L = all.filter(x => x.pos[0] < this.pos[0]).sort((a, b) => b.pos[0] - a.pos[0])[0];
    const nm = x => esc(/^(Blank|Drop|DPD) Sheet$/.test(x.title) ? `${x.stage()} sheet` : x.title);
    return `<div class="linkmenu"><h5>Link this sheet<span class="sp"></span><button class="mini" data-linkmenu>Done</button></h5>
      <div class="lmq">${L ? `<button class="mini ${mine.includes(L) ? "ok2" : ""}" data-linkto="${L.id}">← ${mine.includes(L) ? "Linked to" : "Link to"} ${nm(L)}</button>` : ""}${R ? `<button class="mini ${mine.includes(R) ? "ok2" : ""}" data-linkto="${R.id}">${mine.includes(R) ? "Linked to" : "Link to"} ${nm(R)} →</button>` : ""}</div>
      ${all.length ? all.map(x => `<label class="lmr"><input type="checkbox" data-linkto="${x.id}" ${mine.includes(x) ? "checked" : ""}>${nm(x)}<small>${x.stage()} · ${x.pos[0] < this.pos[0] ? "on the left" : "on the right"}</small></label>`).join("") : `<em>No other sheets yet: add another Blank Sheet to link it.</em>`}
      <small class="lmn">Linked sheets share what they have (loaders, a prompt, a size), and a picture flows from left to right.</small></div>`;
  }
  // a cord from the plug on the right edge to another sheet
  plugDrag(e) {
    const ov = document.createElementNS("http://www.w3.org/2000/svg", "svg"); ov.setAttribute("style", "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999");
    const a = getComputedStyle(this.el).getPropertyValue("--gold").trim() || "#8a5a2b", sx = e.clientX, sy = e.clientY;
    ov.innerHTML = `<path fill="none" stroke="${a}" stroke-width="7" stroke-linecap="round" opacity=".85"/><circle r="9" fill="${a}"/>`; document.body.appendChild(ov);
    const [pa, ci] = ov.children, under = m => { const b = app.canvas.canvas.getBoundingClientRect(), [gx, gy] = app.canvas.ds.convertCanvasToOffset([m.clientX - b.left, m.clientY - b.top]); return allSheets().find(x => x !== this && gx >= x.pos[0] && gx <= x.pos[0] + x.size[0] && gy >= x.pos[1] - LiteGraph.NODE_TITLE_HEIGHT && gy <= x.pos[1] + x.size[1]); };
    const mv = m => { const k = Math.max(40, Math.abs(m.clientX - sx) / 2); pa.setAttribute("d", `M${sx},${sy} C${sx + k},${sy} ${m.clientX - k},${m.clientY} ${m.clientX},${m.clientY}`); ci.setAttribute("cx", m.clientX); ci.setAttribute("cy", m.clientY); ci.setAttribute("r", under(m) ? 13 : 9); };
    const up = m => { removeEventListener("pointermove", mv, true); removeEventListener("pointerup", up, true); ov.remove(); const t = under(m); if (t) this.link(t, !this.links().includes(t)); };
    mv(e); addEventListener("pointermove", mv, true); addEventListener("pointerup", up, true);
  }
  // the cords: drawn on the canvas between linked sheets (not ComfyUI wires: the sheets do the real wiring)
  onDrawForeground(ctx) {
    const a = this.properties.look?.accent || "#8a5a2b";
    for (const x of this.links()) {
      const dx = x.pos[0] - this.pos[0], dy = x.pos[1] - this.pos[1], right = dx >= 0;
      const x1 = right ? this.size[0] : 0, y1 = this.size[1] / 2, x2 = right ? dx : dx + x.size[0], y2 = dy + x.size[1] / 2, k = Math.max(60, Math.abs(x2 - x1) / 2) * (right ? 1 : -1);
      ctx.save(); ctx.lineCap = "round"; ctx.globalAlpha = .9;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.bezierCurveTo(x1 + k, y1, x2 - k, y2, x2, y2);
      ctx.strokeStyle = a; ctx.lineWidth = 11; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 3; ctx.setLineDash([3, 12]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = a; for (const [px, py] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }
  // the page: the Drop Sheet's own cards, set loose on the paper; its header, level and look go behind the gear
  render() {
    super.render();
    const P = this.properties, inn = this.el.querySelector(".dpd-in"); if (!inn) return;
    const have = this.parts().length, page = inn.querySelector(".page");
    page.insertAdjacentHTML("afterbegin", this.ownTiles());
    if (P.choosing) inn.insertAdjacentHTML("beforeend", this.chooserHtml());
    const tiles = [...page.querySelectorAll(".tile")], missing = tiles.filter(t => t.classList.contains("empty")).flatMap(t => [...t.querySelectorAll(".need")]);
    tiles.filter(t => t.classList.contains("empty") || (!have && t.dataset.zone === "canvas")).forEach(t => t.remove());   // a blank page stays blank
    page.classList.add("paper"); this.el.classList.toggle("melt", P.style === "melt"); this.el.classList.toggle("clipown", !!P.clipOwn);
    page.style.removeProperty("--cols");
    this.normGroups();
    tiles.forEach(t => {
      if (!t.isConnected) return;
      const z = t.dataset.zone, g = this.groupOf(z), pk = this.picked?.has(z);
      t.insertAdjacentHTML("beforeend", `<span class="rs" data-rs title="${z === "pictures" || z === "results" ? "Drag to make it wider, and its pictures taller" : "Drag to make it wider"}"></span>`);
      const pw = z.startsWith("step:") || z === "results", zo = !!P.offZ?.[z];
      if (pw) { t.classList.toggle("off", zo); t.querySelector(".th .sp")?.insertAdjacentHTML("afterend", `<button class="pwr2 ${zo ? "" : "on"}" data-power="${z}" title="${zo ? "Turn it on" : z === "results" ? "Turn it off: nothing saved or shown" : "Turn it off: the picture goes straight through"}">${svg("power", 13)}</button>`); }
      t.querySelector(".th .sp")?.insertAdjacentHTML("afterend", `<button data-tlook="${z}" title="This section's colours and picture">${svg("paint", 13)}</button><button data-link="${z}" class="lk ${g ? "on" : pk ? "pick" : ""}" title="${g ? "Grouped: click to ungroup" : "Pick it to group with other sections (or Shift+click its title)"}">${svg("link", 13)}</button>`);
      t.classList.toggle("picked", !!pk); t.classList.toggle("grouped", !!g);
      if (this.lookZ === z) { t.classList.add("popped"); t.insertAdjacentHTML("beforeend", this.tpop(z)); }
      this.dressTile(t);
    });
    if (this.picked?.size) page.insertAdjacentHTML("beforeend", `<div class="grpbar">${this.picked.size} picked${this.picked.size > 1 ? `<button class="mini go2" data-group>${svg("link", 12)} Group them</button>` : `<span style="opacity:.7">· pick one more</span>`}<button class="mini" data-pickclear>Cancel</button></div>`);
    if (!have) page.insertAdjacentHTML("beforeend", `<div class="blank">Drop your nodes here<small>loaders · prompts · samplers · pictures · anything</small><small>they wire themselves, then move them wherever you like</small></div>`);
    const hd = inn.querySelector(".hd"), look = inn.querySelector(".look"), lvl = inn.querySelector(".lvl"), pipes = inn.querySelector(".pipes"), ok = inn.querySelector(":scope > .ok"), go = inn.querySelector(":scope > .go");   // the sheet's own Run, not the Text Clip's Ask
    hd.querySelector(".cols")?.previousSibling?.remove?.(); hd.querySelector(".cols")?.remove();
    const set = document.createElement("div"); set.className = "set"; set.hidden = !this.gearOpen;
    set.innerHTML = `<h4>Sheet settings<span class="sp"></span><button class="mini" data-setcancel title="Put back every setting as it was when you opened this">Cancel</button><button class="mini ok2" data-gear>Done</button></h4><div class="sty">STYLE<span class="seg2">${[["cards", "Cards", "Each section in its own box"], ["melt", "Melt", "Boxes melt into the page; only the fields stand out"]].map(([k, l, t]) => `<button data-sheetstyle="${k}" class="${(P.style || "cards") === k ? "on" : ""}" title="${t}">${l}</button>`).join("")}</span></div>`;
    set.append(hd.querySelector(".kind"), hd.querySelector(".typ"));
    if (look) set.append(look); set.append(lvl);
    const L = P.look || {}, C = L.c || {}, cur = getComputedStyle(this.el);
    set.insertAdjacentHTML("beforeend", `<div class="hh">Colours<span class="sp"></span><button class="mini" data-colreset title="Every colour back to automatic">Reset colours</button></div>
      <div class="pal">${PALETTES.map(([n, pp, a]) => `<button data-pal="${pp},${a}" title="${n} paper, every other colour to match" style="--a:${a}"><b style="background:${pp}"></b>${n}</button>`).join("")}</div>
      <div class="colors">${COLORS.map(([k, n, t]) => { const v = k === "paper" ? L.paper : k === "accent" ? L.accent : C[k], own = v != null && v !== "", fixed = k === "paper" || k === "accent"; return `<label title="${t}${own || fixed ? "" : " (automatic, from the paper and accent)"}"><input type="color" data-col="${k}" value="${own ? v : toHex(cur.getPropertyValue(k === "paper" ? "--bgA" : k === "accent" ? "--gold" : `--${k}`))}"><span>${n}</span><button class="eye2" data-eyecol="${k}" title="Pick from the screen">${svg("eye", 11)}</button>${fixed ? "" : own ? `<button data-colauto="${k}" title="Back to automatic">×</button>` : `<i>auto</i>`}</label>`; }).join("")}</div>
      <div class="xrow">Band corners<input type="range" min="0" max="20" value="${L.hr ?? 8}" data-bandr style="flex:1;accent-color:var(--gold)"><b class="pct">${L.hr ?? 8}px</b></div>
      <div class="hh">Background picture</div><div class="xrow"><button class="mini" data-bgimg>${L.img ? "Change picture" : "＋ Choose a picture"}</button>${L.img ? `<button class="mini" data-bgoff>Remove</button></div><div class="xrow">Strength<input type="range" min="5" max="100" value="${100 - (L.fade ?? 35)}" data-bgshow style="flex:1;accent-color:var(--gold)">` : ""}</div>
      <div class="hh">Recommended</div>
      <div class="rec"><div><b>Text Clip</b><small>write your prompt with Claude's help; it leads the page</small></div>${byId(P.helpers.textclip) ? `<span class="have">${svg("check", 12)} on this sheet</span>` : LiteGraph.registered_node_types.DPDTextClip ? `<button class="mini ok2" data-recadd="clip">＋ Add</button>` : `<span class="have">comes with the DPD Rich Text pack (coming soon)</span>`}</div>
      <div class="rec"><div><b>Comfy Blueprint</b><small>shows where a render is: the step it came from, the one working now (green), and the next</small></div>${byId(P.helpers.blueprint) ? `<span class="have">${svg("check", 12)} on this sheet</span>` : graph()._nodes.some(n => n.type === "Comfy Blueprint" && !sheetOf(n)) ? `<button class="mini ok2" data-recput title="Bring the one in this workflow onto the sheet">＋ Put it here</button>` : LiteGraph.registered_node_types["Comfy Blueprint"] ? `<button class="mini ok2" data-recadd="blueprint">＋ Add</button>` : `<span class="have">not installed</span>`}</div>
      <div class="rec"><div><b>System Check</b><small>reads this machine, suggests the size, steps and more, and ▶ Run test finds the biggest safe size</small></div>${byId(P.helpers.syscheck) ? `<span class="have">${svg("check", 12)} on this sheet</span>` : graph()._nodes.some(n => n.type === "DPD System Check" && !sheetOf(n)) ? `<button class="mini ok2" data-recput="syscheck" title="Bring the one in this workflow onto the sheet">＋ Put it here</button>` : LiteGraph.registered_node_types["DPD System Check"] ? `<button class="mini ok2" data-recadd="syscheck">＋ Add</button>` : `<span class="have">not loaded</span>`}</div>
      <div class="hh">On the page</div>
      <div class="xrow"><span class="seg2"><button data-own="clock" class="${P.clock ? "on" : ""}" title="A big timer: how long this render has run, the last and best times">Timer</button><button data-own="meter" class="${P.meter ? "on" : ""}" title="A ring that fills as the graphics card and memory fill">Memory ring</button><button data-own="board" class="${P.board ? "on" : ""}" title="Every sheet and step with an on/off switch, and the chain of linked sheets">Switchboard</button></span><span style="opacity:.7">click to show or hide</span></div>
      ${P.clock ? `<div class="xrow ownpick">Timer colour${CLOCK_COLS.map(([c, n]) => `<button class="sw ${(P.clockC || "") === c ? "on" : ""}" data-clockc="${c}" title="${n}" style="background:${c || "var(--title)"}"></button>`).join("")}<input type="color" data-clockcin value="${P.clockC || toHex(getComputedStyle(this.el).getPropertyValue("--title"))}" title="Any colour"><span class="seg2"><button data-clockdark="0" class="${P.clockDark ? "" : "on"}">On paper</button><button data-clockdark="1" class="${P.clockDark ? "on" : ""}" title="Dark glass behind the digits, like an alarm clock">Dark face</button></span></div>` : ""}
      <div class="xrow">New sheets start as<select data-startsel>${START_OPTS.map(v => `<option ${(app.extensionManager?.setting?.get?.("DPD.Sheet.Start") || "Ask each time") === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="hh">While it renders</div>
      <div class="xrow"><span class="seg2"><button data-livepv="1" class="${P.live !== false ? "on" : ""}" title="Watch the picture form in Results as the sampler works">Live preview</button><button data-livepv="0" class="${P.live === false ? "on" : ""}">Off</button></span></div>
      <div class="xrow"><span class="seg2"><button data-steppics="1" class="${P.stepPics !== false ? "on" : ""}" title="Each picture step (an upscale, a fix) shows what it made in its own card">A picture after each step</button><button data-steppics="0" class="${P.stepPics === false ? "on" : ""}">Off</button></span></div>
      <div class="hh">Layout</div><div class="xrow"><span class="seg2"><button data-gridmode="0" class="${P.grid ? "" : "on"}" title="Sections stay where you put them">Free layout</button><button data-gridmode="1" class="${P.grid ? "on" : ""}" title="Sections arrange themselves in neat rows; drag one to change the order">Tidy grid</button></span></div><div class="xrow"><span class="seg2"><button data-snap="1" class="${P.snap !== false ? "on" : ""}" title="Sections line up on the paper's dots as you move and widen them">Snap to grid</button><button data-snap="0" class="${P.snap === false ? "on" : ""}" title="Sections go exactly where you let go">Free</button></span><button class="mini" data-tidy title="Line every section up on the grid now">Tidy up</button></div>
      <div class="hh">Text Clip</div><div class="xrow"><span class="seg2"><button data-clipown="0" class="${P.clipOwn ? "" : "on"}" title="It wears the sheet's colours, melted into the page">Match the sheet</button><button data-clipown="1" class="${P.clipOwn ? "on" : ""}" title="It keeps the colours picked in its own bar">Its own colours</button></span></div>
      <div class="hh">Under the hood</div><div class="xrow"><button class="xr ${P.xray ? "on" : ""}" data-xray title="Lay out the real ComfyUI nodes and their wires beside the sheet, for when something breaks">${svg("pipe", 12)}${P.xray ? "Hide" : "Show"} the real nodes and wiring</button>${P.xray ? "laid out to the right of the sheet" : ""}</div>`);
    if (pipes) { pipes.querySelector(".xr")?.remove(); set.append(pipes); }
    hd.remove();
    const foot = document.createElement("div"); foot.className = "foot";
    if (have) { const m = document.createElement("div"); m.className = "miss"; missing.forEach(n => m.append(n)); foot.append(ok || m); }
    const tops = document.createElement("div"); tops.className = "tops";
    if (have) tops.append(go); else set.append(go);   // Run sits by the gear, where it can't be missed; an empty page shows nothing but the paper
    const nl = this.links().length;
    tops.insertAdjacentHTML("beforeend", `<button class="lkb ${nl ? "on" : ""} ${this.linkOpen ? "open" : ""}" data-linkmenu title="${nl ? `Linked to ${nl} sheet${nl > 1 ? "s" : ""}` : "Link this sheet to others"}">${svg("link", 14)}${nl ? `<b>${nl}</b>` : ""}</button><button class="gear ${this.gearOpen ? "on" : ""}" data-gear title="Settings">${svg("gear", 15)}</button>`);
    if (this.linkOpen) inn.insertAdjacentHTML("beforeend", this.linkMenu());
    inn.insertAdjacentHTML("beforeend", `<div class="plug ${nl ? "on" : ""}" data-plug title="Drag onto another sheet to link them (or unlink)">${svg("link", 12)}</div>`);
    this.el.classList.toggle("sheetoff", this.isOff());
    const miss = have ? this.allNeeds() : [];
    if (miss.length) inn.insertAdjacentHTML("beforeend", `<div class="fixbar ${this.isOff() ? "low" : ""}"><button class="fxh" data-fixopen title="${this.fixOpen ? "Hide the list" : "What's missing, and a fix for each"}">${svg("warn", 14)}<b>${miss.length} missing</b><span>${this.fixOpen ? "hide" : "show"}</span></button>${miss.some(x => x[1]) ? `<button class="mini ok2" data-fixall title="Add every missing node, wired in, with its usual settings">Fix it all</button>` : ""}
      ${this.fixOpen ? `<div class="fxl">${miss.map(([w, t, nm, pack]) => `<div><span>${esc(w)}</span>${t ? `<button class="mini" data-add="${t}" title="Add a ${esc(nm)} node, wired in">＋ ${esc(nm)}</button>` : pack ? `<button class="mini" data-getpacks title="Open the Manager's list of missing node packs">Find it</button>` : ""}</div>`).join("")}</div>` : ""}</div>`);
    if (this.isOff()) inn.insertAdjacentHTML("beforeend", `<div class="offnote">${svg("power", 13)}${this.properties.off ? "This sheet is off" : "Off: the sheet feeding it is off"}</div>`);
    inn.append(set, foot, tops);
    this.place(); clockPaint(); meterPaint();
    this.el.querySelectorAll("img").forEach(i => i.addEventListener("load", () => this.place(), { once: true }));   // a result that arrives makes its card taller
  }
  // every card where it was left; a new one goes to the first open spot, reading left to right
  place() {
    const page = this.el.querySelector(".paper"); if (!page) return;
    if (!this.el.isConnected || !page.clientWidth) { requestAnimationFrame(() => this.el.querySelector(".paper") === page && this.place()); return; }
    const F = this.properties.free = this.properties.free || {}, tiles = [...page.querySelectorAll(".tile")], rects = [];
    if (this.properties.grid) this.gridLay(tiles, F, Math.max(CARD + 2 * GAP, page.clientWidth));
    const put = (t, f) => { t.style.left = f.x + "px"; t.style.top = f.y + "px"; t.style.width = f.w + "px"; if (f.ph) t.style.setProperty("--ph", `${f.ph}px`); };
    for (const t of tiles) { const f = F[t.dataset.zone]; if (!f) continue; put(t, f); rects.push([f.x, f.y, f.w, t.offsetHeight]); }
    const room = Math.max(CARD + 2 * GAP, page.clientWidth);
    const corner = [room - 190, -GAP, 190, 34];   // Run and the gear live in the top right corner: new cards keep clear of it
    if (this.clipNew && tiles.some(t => t.dataset.zone === "prompt")) {   // the Text Clip just arrived: it takes the top of the page and the rest step down below it
      this.clipNew = false; const w = Math.min(Math.max(560, room - 2 * GAP - CARD - GAP), 760);
      F.prompt = { x: GAP, y: GAP, w }; (this.fresh = this.fresh || {}).prompt = Date.now() + 700; this.placedNew = true;
      rects.length = 0; for (const t of tiles) { const f = F[t.dataset.zone]; if (f) { put(t, f); rects.push([f.x, f.y, f.w, t.offsetHeight]); } }
    }
    for (const t of tiles) {
      const z = t.dataset.zone; if (F[z]) continue;
      const w = this.cardW(z); t.style.width = w + "px"; const h = t.offsetHeight;
      let spot = null;
      for (let y = GAP; !spot && y < 6000; y += 12) for (let x = GAP; x + w <= room - GAP || x === GAP; x += 12) {
        if (![...rects, corner].some(([a, b, c, d]) => x < a + c + GAP && a < x + w + GAP && y < b + d + GAP && b < y + h + GAP)) { spot = { x, y, w }; break; }
        if (x + w > room - GAP) break;
      }
      F[z] = spot; put(t, spot); rects.push([spot.x, spot.y, w, h]); this.placedNew = true;
      (this.fresh = this.fresh || {})[z] = Date.now() + 700;   // it lands as a card, then melts into the page
    }
    if (this.placedNew) { this.placedNew = false; changed(); }
    if (this.properties.style === "melt") for (const t of tiles) {   // just dropped: shown as a card (even through a redraw), then melted
      const until = this.fresh?.[t.dataset.zone] || 0; if (until <= Date.now()) continue;
      t.classList.add("fresh"); setTimeout(() => t.classList.remove("fresh"), Math.max(350, until - Date.now()));
    }
    // a card that grew never covers another: the lower one steps down below it
    const byTop = tiles.filter(t => F[t.dataset.zone]).sort((p, q) => { const first = t => t.dataset.zone === this.lead || this._pin?.includes(t.dataset.zone) || (this.lead && this.groupOf(this.lead)?.includes(t.dataset.zone)) ? 2 : t.dataset.zone === "prompt" && this.properties.helpers.textclip ? 1 : 0; return first(q) - first(p) || F[p.dataset.zone].y - F[q.dataset.zone].y; });   // the card you're moving, then the Text Clip, keep their place
    byTop.forEach((t, i) => {
      const f = F[t.dataset.zone];
      for (let again = true; again;) {
        again = false;
        for (const u of byTop.slice(0, i)) {
          const g = F[u.dataset.zone], h = u.offsetHeight;
          if (f.x < g.x + g.w && g.x < f.x + f.w && f.y < g.y + h + GAP && g.y < f.y + t.offsetHeight) { const up = v => this.properties.snap === false ? v : Math.ceil(v / GRID) * GRID; if (f.x > g.x + 40 && f.y < g.y + 40) f.x = up(g.x + g.w + GAP); else f.y = up(g.y + h + GAP); again = true; }   // beside it: step right; below it: step down
        }
      }
      t.style.top = f.y + "px"; t.style.left = f.x + "px";
    });
    this._pin = null;
    for (const k of Object.keys(F)) if (!tiles.some(t => t.dataset.zone === k) && !OWN.includes(k)) delete F[k];   // a group that's gone forgets its place (the timer and ring remember theirs)
    this.normGroups(); page.querySelectorAll(".grpbox").forEach(b => b.remove());
    for (const g of this.properties.groups) {
      let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
      for (const z of g) { const t = tiles.find(t => t.dataset.zone === z), f = F[z]; if (!t || !f) continue; x1 = Math.min(x1, f.x); y1 = Math.min(y1, f.y); x2 = Math.max(x2, f.x + f.w); y2 = Math.max(y2, f.y + t.offsetHeight); }
      if (x2 > x1) page.insertAdjacentHTML("afterbegin", `<div class="grpbox" style="left:${x1 - 8}px;top:${y1 - 8}px;width:${x2 - x1 + 16}px;height:${y2 - y1 + 16}px"></div>`);
    }
    if (this.lookZ) this.el.querySelectorAll(".tile").forEach(t => this.dressTile(t));   // the group's top section may have changed
    this.fit();
  }
  // the sheet is as big as you make it, and never smaller than its cards
  fit() {
    requestAnimationFrame(() => {
      const page = this.el.querySelector(".paper"); if (!page) return;
      let w = 360, h = 240;
      page.querySelectorAll(".tile").forEach(t => { w = Math.max(w, t.offsetLeft + t.offsetWidth + GAP); h = Math.max(h, t.offsetTop + t.offsetHeight + 64); });
      const top = LiteGraph.NODE_TITLE_HEIGHT + 8;
      if (this.size[0] < w || this.size[1] < h + top) this.setSize([Math.max(this.size[0], w), Math.max(this.size[1], h + top)]);
      this.el.style.height = `${this.size[1] - top}px`; graph()?.setDirtyCanvas(true, true);
    });
  }
  onResize() { this.fit(); }
  cols() { return 2; }
  // automatic colours from the paper and accent, then any you picked yourself
  lookApply() {
    super.lookApply();
    const L = this.properties.look || {}, C = L.c || {}, p = L.paper || "#e3cfa9", a = L.accent || "#8a5a2b", lt = light(p), s = this.el.style;
    if (C.ink) { s.setProperty("--ink", C.ink); s.setProperty("--ink2", mixHex(C.ink, p, .2)); s.setProperty("--mute", mixHex(C.ink, p, .38)); s.setProperty("--mute2", mixHex(C.ink, p, .58)); }
    const ink = C.ink || (lt ? "#231b2a" : "#f1ecf6"), run = C.run || a;
    const auto = { title: lt ? mixHex(a, "#000000", .22) : mixHex(a, "#ffffff", .1), lab: mixHex(ink, p, .45), field: lt ? mixHex(p, "#ffffff", .62) : mixHex(p, "#000000", .35), fieldInk: ink, lineC: a,
      clipEdge: lt ? mixHex(p, "#3a2208", .74) : mixHex(p, "#ffffff", .28), clipBg: lt ? mixHex(p, "#ffffff", .18) : mixHex(p, "#ffffff", .05), clipPane: lt ? mixHex(p, "#ffffff", .6) : mixHex(p, "#000000", .3), run, dot: mixHex(ink, p, .9) };
    auto.clipHead = C.title || auto.title;   // the Text Clip's box names match the section titles
    for (const [k, v] of Object.entries(auto)) s.setProperty(`--${k}`, C[k] || v);
    s.setProperty("--titleRGB", hexRgb(toHex(C.title || auto.title)).join(","));
    s.setProperty("--runInk", light(run) ? "#231b2a" : "#ffffff"); s.setProperty("--hr", `${L.hr ?? 8}px`);
    if (!C.headBg) s.setProperty("--headBg", mixHex(a, p, .45));
    this.el.classList.toggle("hasband", !!C.headBg); s.setProperty("--headInk", C.title || (light(C.headBg || p) ? "#231b2a" : "#ffffff"));
    if (L.img) {
      const f = L.fade ?? 35, wash = `color-mix(in srgb,var(--bgA) ${f}%,transparent)`;
      s.backgroundImage = `radial-gradient(var(--dot) 1px,transparent 1.2px),linear-gradient(${wash},${wash}),url("${picUrl(L.img)}")`;
      s.backgroundSize = "22px 22px,cover,cover"; s.backgroundPosition = "0 0,center,center"; s.backgroundRepeat = "repeat,no-repeat,no-repeat";
    } else ["background-image", "background-size", "background-position", "background-repeat"].forEach(k => s.removeProperty(k));
  }
  // ---- groups: sections that move as one; the top one's look is worn by the rest
  normGroups() {
    const fix = v => Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];
    const have = new Set(this.properties.order);
    this.properties.groups = fix(this.properties.groups).map(g => fix(g).map(String).filter(z => have.has(z) && (this.properties.free?.[z] || !this.properties.free))).filter(g => g.length > 1);
  }
  groupOf(z) { return (this.properties.groups || []).find(g => g.includes(z)) || null; }
  leaderOf(z) { const g = this.groupOf(z), F = this.properties.free || {}; return g ? [...g].sort((a, b) => (F[a]?.y ?? 0) - (F[b]?.y ?? 0) || (F[a]?.x ?? 0) - (F[b]?.x ?? 0))[0] : z; }
  styleOf(z) { return (this.properties.ts || {})[this.leaderOf(z)] || {}; }
  nameOf(z) { return z.startsWith("step:") ? byId(z.slice(5))?.title || "Step" : zoneInfo(z, this.properties.kind)[0]; }
  // a section's colours and picture (or its group's, from the top section)
  dressTile(t) {
    const S = this.styleOf(t.dataset.zone), th = t.querySelector(".th"); if (!th) return;
    t.style.removeProperty("background"); th.style.removeProperty("background"); th.style.removeProperty("color"); th.classList.remove("band");
    const bg = S.bg, wash = c => `color-mix(in srgb,${c} ${S.fade ?? 40}%,transparent)`;
    if (S.img) t.style.background = `linear-gradient(${wash(bg || "var(--bgA)")},${wash(bg || "var(--bgA)")}),url("${picUrl(S.img)}") center/cover no-repeat`;
    else if (bg) t.style.background = bg;
    t.classList.toggle("styled", !!(S.img || bg));
    th.style.removeProperty("border-radius"); if (S.hr != null) th.style.borderRadius = `${S.hr}px`;
    if (S.head) { th.classList.add("band"); th.style.background = S.head; th.style.color = S.headInk || (light(S.head) ? "#231b2a" : "#ffffff"); }
    else if (S.headInk) th.style.color = S.headInk;
  }
  tpop(z) {
    const lz = this.leaderOf(z), S = (this.properties.ts || {})[lz] || {}, cur = getComputedStyle(this.el), C = this.properties.look?.c || {};
    const row = (k, n, auto, note) => `<label><input type="color" data-ts="${k}" value="${S[k] || toHex(auto)}"><span>${n}</span><button class="eye2" data-eye="${k}" title="Pick from the screen">${svg("eye", 11)}</button>${S[k] ? `<button data-tsoff="${k}" title="Back to the sheet's">×</button>` : `<i>${note}</i>`}</label>`;
    return `<div class="tpop" data-tpopz="${lz}"><div class="tph"><span>${lz !== z ? `Grouped: it wears the look of <b>${esc(this.nameOf(lz))}</b>, the top section` : `<b>${esc(this.nameOf(z))}</b>: its own look`}</span><span class="sp"></span><button data-tlook="${z}" title="Close">${svg("x", 12)}</button></div>
      <div class="swtabs"><button data-swset="comfy" class="${SWSET === "comfy" ? "on" : ""}" title="The colours ComfyUI gives node title bars">ComfyUI</button><button data-swset="mine" class="${SWSET === "mine" ? "on" : ""}" title="Colours you picked, or gathered from this sheet">Mine${MYCOLS.length ? ` · ${MYCOLS.length}` : ""}</button>${SWSET === "mine" ? `<span class="sp"></span><button data-mcfill title="Gather the colours on this sheet: the paper, titles, bands, and the main colours of its pictures">＋ From the sheet</button>` : ""}</div>
      <div class="bandsw">${SWSET === "mine"
        ? (MYCOLS.map((c, i) => `<span class="mc"><button data-tsband="${c}" title="${c}" style="background:${c}" class="${S.head === c ? "on" : ""}"></button><i data-mcdel="${i}" title="Remove this colour">×</i></span>`).join("") || `<span class="none2">Pick colours with the dropper or the rainbow, or gather them from this sheet.</span>`)
        : Object.entries(LGraphCanvas.node_colors || {}).map(([n, c]) => `<button data-tsband="${c.color}" title="${n.replace("_", " ")}" style="background:${c.color}" class="${S.head === toHex(c.color) ? "on" : ""}"></button>`).join("")}<button class="eye" data-eye="head" title="Pick a colour from anywhere on your screen">${svg("eye", 13)}</button><label class="any" title="Any colour you like"><input type="color" data-ts="head" value="${S.head || "#7a5230"}"></label>${S.head ? `<button data-tsoff="head" class="none" title="No band">×</button>` : ""}</div>
      <div class="colors">${row("head", "Title band", cur.getPropertyValue("--headBg"), C.headBg ? "sheet's" : "none")}${row("headInk", "Title words", cur.getPropertyValue(C.headBg ? "--headInk" : "--title"), "sheet's")}${row("bg", "Background", cur.getPropertyValue("--t1"), "none")}</div>
      <div class="xrow"><button class="mini" data-tsimg>${S.img ? "Change picture" : "＋ Background picture"}</button>${S.img ? `<button class="mini" data-tsoff="img">Remove</button>` : ""}</div>
      ${S.img ? `<div class="xrow">Strength<input type="range" min="5" max="100" value="${100 - (S.fade ?? 40)}" data-ts="show"></div>` : ""}
      <div class="xrow">Band corners<input type="range" min="0" max="20" value="${S.hr ?? this.properties.look?.hr ?? 8}" data-ts="hr" title="Square to round"><b class="pct">${S.hr ?? this.properties.look?.hr ?? 8}px</b></div>
      <div class="lk2">Saved looks</div>
      <div class="looks">${LOOKS.map((l, i) => `<span class="chip" data-lookuse="${i}" title="Give ${esc(this.nameOf(lz))} this look"><i style="background:${l.s.head || "transparent"}"></i><i style="background:${l.s.img ? `url(&quot;${picUrl(l.s.img)}&quot;) center/cover` : l.s.bg || "transparent"}"></i>${esc(l.name)}<button data-lookdel="${i}" title="Forget this look">×</button></span>`).join("") || `<span class="none2">None yet. Make a look, then save it to use on any section.</span>`}</div>
      ${this.saving != null ? `<div class="xrow"><input data-lookname value="${esc(this.saving)}" placeholder="Name this look" style="flex:1"><button class="mini ok2" data-looksave>Save</button><button class="mini" data-lookstop>×</button></div>` : `<div class="xrow"><button class="mini" data-lookstart ${Object.keys(S).length ? "" : "disabled title=\"Give this section a look first\""}>☆ Save this look</button></div>`}
      <div class="done"><button class="mini" data-tsclear title="No look of its own: back to the sheet's">Clear</button><span style="flex:1"></span><button class="mini" data-tscancel title="Put back the look it had when you opened this">Cancel</button><button class="mini ok2" data-tlook="${z}">Done</button></div></div>`;
  }
  input(e, done) {
    const t = e.target;
    if (t.dataset.col) {
      const L = this.properties.look = this.properties.look || {}, k = t.dataset.col;
      if (k === "paper" || k === "accent") L[k] = t.value; else (L.c = L.c || {})[k] = t.value;
      this.lookApply(); if (done) { this.gearOpen = true; this.render(); changed(); } return;
    }
    if (t.dataset.ts) {
      const z = t.closest("[data-tpopz]").dataset.tpopz, T = this.properties.ts = this.properties.ts || {}, S = T[z] = T[z] || {}, k = t.dataset.ts;
      if (done && k !== "show" && k !== "hr") addMy(t.value);
      if (k === "show") S.fade = 100 - +t.value; else if (k === "hr") { S.hr = +t.value; t.nextElementSibling.textContent = `${t.value}px`; } else S[k] = t.value;
      this.el.querySelectorAll(".tile").forEach(x => this.dressTile(x)); if (done) { this.render(); changed(); } return;
    }
    if (t.matches("[data-bandr]")) { this.properties.look.hr = +t.value; t.nextElementSibling.textContent = `${t.value}px`; this.lookApply(); if (done) changed(); return; }
    if (t.matches("[data-bgshow]")) { this.properties.look.fade = 100 - +t.value; this.lookApply(); if (done) changed(); return; }
    return super.input(e, done);
  }
  click(e) {
    const q = s => e.target.closest(s);
    if (q("[data-sheetstyle]")) { this.properties.style = q("[data-sheetstyle]").dataset.sheetstyle; this.gearOpen = true; this.render(); changed(); return; }
    const L = this.properties.look = this.properties.look || {};
    if (q("[data-pal]")) { const [pp, a] = q("[data-pal]").dataset.pal.split(","); Object.assign(L, { paper: pp, accent: a, c: {} }); this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-colauto]")) { e.preventDefault(); delete (L.c || {})[q("[data-colauto]").dataset.colauto]; this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-colreset]")) { L.c = {}; this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-recadd]")) {
      const k = q("[data-recadd]").dataset.recadd; this.gearOpen = true;
      if (k === "clip") { const n = LiteGraph.createNode("DPDTextClip"); if (n) { graph().add(n); this.absorb(n); } return; }   // it brings a prompt, and takes the top of the page
      const n = LiteGraph.createNode(k === "syscheck" ? "DPD System Check" : "Comfy Blueprint"); if (!n) return;
      graph().add(n); this.absorb(n); return;   // a Run flow card you can move anywhere on the page
    }
    if (q("[data-recput]")) { const t = q("[data-recput]").dataset.recput === "syscheck" ? "DPD System Check" : "Comfy Blueprint", n = graph()._nodes.find(n => n.type === t && !sheetOf(n)); if (n) { this.gearOpen = true; this.absorb(n); } return; }
    const SP = this.properties;
    if (q("[data-own]")) { const k = q("[data-own]").dataset.own; SP[k] = !SP[k]; if (SP[k]) this.homeOwn(k); this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-ownhide]")) { SP[q("[data-ownhide]").dataset.ownhide] = false; this.render(); changed(); return; }
    if (q("[data-clockc]")) { SP.clockC = q("[data-clockc]").dataset.clockc; this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-clockdark]")) { SP.clockDark = q("[data-clockdark]").dataset.clockdark === "1"; this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-power]")) { const z = q("[data-power]").dataset.power, Z = SP.offZ = SP.offZ || {}; Z[z] = !Z[z]; this.modes(); allSheets().forEach(x => x.render()); changed(); return; }
    if (q("[data-boardoff]")) { const x = byId(q("[data-boardoff]").dataset.boardoff); if (x) { x.properties.off = !x.properties.off; allSheets().forEach(y => y.modes()); allSheets().forEach(y => y.render()); changed(); } return; }
    if (q("[data-boardz]")) { const [id, z] = q("[data-boardz]").dataset.boardz.split("|"), x = byId(id); if (x) { const Z = x.properties.offZ = x.properties.offZ || {}; Z[z] = !Z[z]; x.modes(); allSheets().forEach(y => y.render()); changed(); } return; }
    if (q("[data-startpick]")) { const v = q("[data-startpick]").dataset.startpick; if (this.el.querySelector("[data-startkeep]")?.checked) app.extensionManager?.setting?.set?.("DPD.Sheet.Start", v); this.startWith(v); return; }
    if (q("[data-gridmode]")) { SP.grid = q("[data-gridmode]").dataset.gridmode === "1"; this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-fixopen]")) { this.fixOpen = !this.fixOpen; this.render(); return; }
    if (q("[data-fixall]")) { this.fixOpen = true; this.fixAll(); return; }
    if (q("[data-getpacks]")) { app.extensionManager?.command?.execute?.("Comfy.Manager.ShowMissingPacks"); return; }
    if (q("[data-linkmenu]")) { this.linkOpen = !this.linkOpen; this.render(); return; }
    if (q("[data-linkto]")) { const x = byId(q("[data-linkto]").dataset.linkto); e.preventDefault(); this.linkOpen = true; if (x) this.link(x, !this.links().includes(x)); return; }
    if (q("[data-startas]")) { const v = q("[data-startas]").dataset.startas; (app.extensionManager?.setting?.set?.("DPD.Sheet.Start", v) ?? app.ui?.settings?.setSettingValue?.("DPD.Sheet.Start", v)); this.gearOpen = true; setTimeout(() => this.render(), 50); return; }
    if (q("[data-livepv]")) { this.properties.live = q("[data-livepv]").dataset.livepv === "1"; this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-steppics]")) { this.properties.stepPics = q("[data-steppics]").dataset.steppics === "1"; this.gearOpen = true; this.wire(); this.render(); changed(); return; }
    if (q("[data-snap]")) { this.properties.snap = q("[data-snap]").dataset.snap === "1"; this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-tidy]")) { const F = this.properties.free || {}; for (const f of Object.values(F)) { f.x = Math.round(f.x / GRID) * GRID; f.y = Math.max(GRID, Math.round(f.y / GRID) * GRID); f.w = Math.round(f.w / GRID) * GRID; } this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-clipown]")) { this.properties.clipOwn = q("[data-clipown]").dataset.clipown === "1"; this.gearOpen = true; this.render(); changed(); return; }
    if (q("[data-xray]")) this.gearOpen = true;
    const P = this.properties, T = P.ts = P.ts || {}, redo = () => { this.render(); changed(); };
    if (q("[data-tlook]")) { const z = q("[data-tlook]").dataset.tlook; this.lookZ = this.lookZ === z ? null : z; this.saving = null; if (this.lookZ) { const lz = this.leaderOf(z); this.tsSnap = [lz, JSON.stringify(T[lz] || null)]; } this.render(); return; }
    if (q("[data-tscancel]")) { const [lz, v] = this.tsSnap || []; if (lz) { const o = JSON.parse(v); if (o) T[lz] = o; else delete T[lz]; } this.lookZ = null; return redo(); }
    const pz = q("[data-tpopz]")?.dataset.tpopz;
    if (q("[data-tsoff]")) { e.preventDefault(); const k = q("[data-tsoff]").dataset.tsoff; if (T[pz]) delete T[pz][k]; return redo(); }
    if (q("[data-lookdel]")) { LOOKS.splice(+q("[data-lookdel]").dataset.lookdel, 1); saveLooks(); this.render(); return; }
    if (q("[data-lookuse]")) { T[pz] = JSON.parse(JSON.stringify(LOOKS[+q("[data-lookuse]").dataset.lookuse]?.s || {})); return redo(); }
    if (q("[data-lookstart]")) { if (q("[data-lookstart]").disabled) return; this.saving = `Look ${LOOKS.length + 1}`; this.render(); this.el.querySelector("[data-lookname]")?.select(); return; }
    if (q("[data-lookstop]")) { this.saving = null; this.render(); return; }
    if (q("[data-looksave]")) { const name = this.el.querySelector("[data-lookname]")?.value.trim() || `Look ${LOOKS.length + 1}`; LOOKS.push({ name, s: JSON.parse(JSON.stringify(T[pz] || {})) }); saveLooks(); this.saving = null; this.render(); return; }
    if (q("[data-eye]") || q("[data-eyecol]")) {
      e.preventDefault(); const b = q("[data-eye]") || q("[data-eyecol]"), k = b.dataset.eye || b.dataset.eyecol, sheet = !!b.dataset.eyecol;
      if (!window.EyeDropper) { b.title = "This browser can't pick from the screen: use Chrome or Edge"; return; }
      new window.EyeDropper().open().then(({ sRGBHex }) => {
        const v = toHex(sRGBHex); addMy(v);
        if (sheet) { if (k === "paper" || k === "accent") L[k] = v; else (L.c = L.c || {})[k] = v; this.gearOpen = true; }
        else (T[pz] = T[pz] || {})[k] = v;
        redo();
      }).catch(() => {});   // Esc: nothing picked
      return;
    }
    if (q("[data-swset]")) { SWSET = q("[data-swset]").dataset.swset; this.render(); return; }
    if (q("[data-mcdel]")) { MYCOLS.splice(+q("[data-mcdel]").dataset.mcdel, 1); saveCols(); this.render(); return; }
    if (q("[data-mcfill]")) {
      const cs = getComputedStyle(this.el), mine = ["--bgA", "--gold", "--title", "--ink", "--field", "--clipEdge", "--clipBg", "--run", ...(this.el.classList.contains("hasband") ? ["--headBg"] : [])].map(v => cs.getPropertyValue(v));
      Object.values(T).forEach(x => ["head", "headInk", "bg"].forEach(k => x?.[k] && mine.push(x[k])));
      addMy(...mine, ...picColors([...this.el.querySelectorAll(".pics img, .start img")]));
      this.render(); return;
    }
    if (q("[data-tsband]")) { (T[pz] = T[pz] || {}).head = toHex(q("[data-tsband]").dataset.tsband); return redo(); }
    if (q("[data-tsclear]")) { delete T[pz]; return redo(); }
    if (q("[data-tsimg]")) { pickPic().then(v => { if (v) { (T[pz] = T[pz] || {}).img = v; redo(); } }); return; }
    if (q("[data-bgimg]")) { this.gearOpen = true; pickPic().then(v => { if (v) { L.img = v; redo(); } }); return; }
    if (q("[data-bgoff]")) { delete L.img; this.gearOpen = true; return redo(); }
    if (q("[data-link]")) { const z = q("[data-link]").dataset.link, g = this.groupOf(z); if (g) { P.groups = P.groups.filter(x => x !== g); return redo(); } this.togglePick(z); return; }
    if (q("[data-group]")) { const pk = [...this.picked], keep = (P.groups || []).filter(g => !g.some(z => pk.includes(z))), merged = [...new Set([...pk, ...(P.groups || []).filter(g => g.some(z => pk.includes(z))).flat()])]; P.groups = [...keep, merged]; this.picked = null; return redo(); }
    if (q("[data-pickclear]")) { this.picked = null; this.render(); return; }
    if (q("[data-setcancel]")) { const o = JSON.parse(this.gearSnap || "null"); if (o) Object.assign(this.properties, o); if (o && !o.ts) delete this.properties.ts; this.gearOpen = false; this.render(); changed(); return; }
    if (q("[data-gear]")) { if (!this.gearOpen) { const P2 = this.properties; this.gearSnap = JSON.stringify({ look: P2.look || {}, style: P2.style, clipOwn: P2.clipOwn, snap: P2.snap, kind: P2.kind, level: P2.level, zoom: P2.zoom, font: P2.font, ts: P2.ts }); }
      this.gearOpen = !this.gearOpen; this.el.querySelector(".set").hidden = !this.gearOpen; this.el.querySelector(".tops .gear")?.classList.toggle("on", this.gearOpen); return; }
    if (q("[data-wide]")) { const z = q("[data-wide]").dataset.wide, f = this.properties.free[z]; if (f) { f.w = f.w > 420 ? CARD : Math.max(CARD * 2 + GAP, f.w); this.render(); changed(); } return; }
    if (q("[data-lookopen]") || q("[data-lookreset]") || q("[data-paper]") || q("[data-accent]") || q("[data-dense]") || q("[data-kind]") || q("[data-level]")) this.gearOpen = true;   // keep the settings open while you use them
    return super.click(e);
  }
  // sections dragged off the sheet: their nodes come back as ordinary ComfyUI nodes, unwired, where you let go
  takeOff(zones, ev) {
    const P = this.properties, ids = [];
    for (const z of zones) {
      if (z.startsWith("step:")) ids.push(z.slice(5));
      else if (z === "flow") { if (byId(P.helpers.blueprint)) ids.push(String(P.helpers.blueprint)); }
      else if (z.startsWith("face:")) ids.push(z.slice(5));
      else if (z === "system") { if (byId(P.helpers.syscheck)) ids.push(String(P.helpers.syscheck)); }
      else { if (z === "prompt" && byId(P.helpers.textclip)) ids.push(String(P.helpers.textclip)); ids.push(...this.in(z)); }
    }
    const c = app.canvas, b = c.canvas.getBoundingClientRect(), ds = c.ds;
    const x = (ev.clientX - b.left) / ds.scale - ds.offset[0]; let y = (ev.clientY - b.top) / ds.scale - ds.offset[1];
    for (const id of ids) { const n = byId(id); if (!n) continue; this.release(id, true); n.pos = [Math.round(x), Math.round(y)]; y += (n.size?.[1] || 80) + LiteGraph.NODE_TITLE_HEIGHT + 24; }
    for (const z of zones) { delete P.free?.[z]; if (P.ts) delete P.ts[z]; }
    P.groups = (P.groups || []).map(g => g.filter(z => !zones.includes(z)));
    this.norm(); this.wire(); this.render(); changed(); graph()?.setDirtyCanvas(true, true);
  }
  // what a section is made of (its real nodes), for copying
  nodesOf(z) { const P = this.properties; return z.startsWith("step:") ? [z.slice(5)] : z === "flow" ? [] : z === "prompt" ? [] : this.in(z); }
  copyDrag(e, tile, z) {
    const ids = this.nodesOf(z);
    if (!ids.length) { tile.classList.add("nocopy"); setTimeout(() => tile.classList.remove("nocopy"), 600); return; }
    tile.classList.add("copying"); this.el.classList.add("copymode");
    const hint = out => { this.el.querySelector(".leavehint")?.remove(); this.el.querySelector(".dpd-in").insertAdjacentHTML("beforeend", `<div class="leavehint copy">${out ? `Let go to drop a copy on the canvas` : `Let go to add a copy to the sheet`}</div>`); };
    const outside = m => { const b = this.el.getBoundingClientRect(); return m.clientX < b.left || m.clientX > b.right || m.clientY < b.top || m.clientY > b.bottom; };
    let was = null; const mv = m => { const o = outside(m); if (o !== was) { was = o; hint(o); } };
    const up = m => {
      removeEventListener("pointermove", mv, true); removeEventListener("pointerup", up, true);
      tile.classList.remove("copying"); this.el.classList.remove("copymode"); this.el.querySelector(".leavehint")?.remove();
      if (outside(m)) { const c = app.canvas, b = c.canvas.getBoundingClientRect(), ds = c.ds; this.copyOf(ids, [(m.clientX - b.left) / ds.scale - ds.offset[0], (m.clientY - b.top) / ds.scale - ds.offset[1]]); }
      else if (Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) > 6) this.copyOf(ids);
    };
    hint(false); addEventListener("pointermove", mv, true); addEventListener("pointerup", up, true);
  }
  togglePick(z) { const p = this.picked = this.picked || new Set(); p.has(z) ? p.delete(z) : p.add(z); this.render(); }
  // a card moves by its top bar (its whole group with it) and widens by its corner, anywhere on the page
  tileDrag() {
    this.el.addEventListener("pointerdown", e => {
      const bar = e.target.closest(".th"), rs = e.target.closest("[data-rs]"); if (!bar && !rs) return;
      if (bar && e.target.closest("button")) return;
      const tile = (bar || rs).closest(".tile"), z = tile?.dataset.zone, F = this.properties.free || {}, f = F[z]; if (!f) return;
      e.preventDefault(); e.stopPropagation();
      if (bar && e.shiftKey) return this.togglePick(z);   // Shift+click a title: pick it for a group
      if (bar && (e.ctrlKey || e.metaKey)) return this.copyDrag(e, tile, z);
      tile.classList.add("moving"); this.lead = z;
      const k = app.canvas.ds.scale || 1, sx = e.clientX, sy = e.clientY, f0 = { ...f };
      const all = (rs ? [z] : this.groupOf(z) || [z]).filter(m => F[m]).map(m => [m, { ...F[m] }, this.el.querySelector(`.tile[data-zone="${CSS.escape(m)}"]`)]);
      this.el.querySelectorAll(".grpbox").forEach(b => b.style.opacity = 0);
      const outside = m => { const b = this.el.getBoundingClientRect(); return !rs && (m.clientX < b.left || m.clientX > b.right || m.clientY < b.top || m.clientY > b.bottom); };
      const mv = m => {
        const dx = (m.clientX - sx) / k, dy = (m.clientY - sy) / k, out = outside(m);
        if (out !== this.el.classList.contains("leaving")) {   // past the edge: it will come off the sheet
          this.el.classList.toggle("leaving", out); all.forEach(([, , el]) => el?.classList.toggle("leaving", out));
          this.el.querySelector(".leavehint")?.remove();
          if (out) this.el.querySelector(".dpd-in").insertAdjacentHTML("beforeend", `<div class="leavehint">Let go to take ${all.length > 1 ? "these sections" : "it"} off the sheet</div>`);
        }
        const sn = v => this.properties.snap === false ? Math.round(v) : Math.round(v / GRID) * GRID;   // snap to the dots
        if (rs) {
          f.w = Math.max(200, sn(f0.x + f0.w + dx) - f0.x); tile.style.width = f.w + "px";
          if (z === "pictures" || z === "results") { f.ph = Math.max(80, Math.round((f0.ph ?? (z === "pictures" ? 260 : 600)) + dy)); tile.style.setProperty("--ph", `${f.ph}px`); }   // pictures grow taller too
          return;
        }
        const ddx = Math.max(dx, -Math.min(...all.map(([, s0]) => s0.x))), ddy = Math.max(dy, -Math.min(...all.map(([, s0]) => s0.y)));   // the group stops together at the page's edge
        for (const [m2, s0, el] of all) { const g = F[m2]; g.x = s0.x + sn(f0.x + ddx) - f0.x; g.y = s0.y + sn(f0.y + ddy) - f0.y; if (el) { el.style.left = g.x + "px"; el.style.top = g.y + "px"; } }
      };
      const up = m => {
        removeEventListener("pointermove", mv, true); removeEventListener("pointerup", up, true); tile.classList.remove("moving"); this.lead = null;
        this.el.classList.remove("leaving"); this.el.querySelector(".leavehint")?.remove();
        if (outside(m)) { all.forEach(([m2, s0]) => Object.assign(F[m2], s0)); const off = all.map(([m2]) => m2).filter(m2 => !OWN.includes(m2)); if (!off.length) return this.place(); return this.takeOff(off, m); }
        if (this.properties.grid && !rs) this.regrid();
        this.place(); changed();
      };
      addEventListener("pointermove", mv, true); addEventListener("pointerup", up, true);
    }, true);
  }
}
BlankSheet.title = "Blank Sheet";
BlankSheet.category = "DPD Studio";
// the one sheet in the menu: it asks how to start (or starts the way the settings say)
class DPDSheet extends BlankSheet { constructor() { super(); this.title = "DPD Sheet"; } }
DPDSheet.title = "DPD Sheet";
DPDSheet.category = "DPD Studio";
DropSheet.skip_list = true; BlankSheet.skip_list = true; DPDSheet.skip_list = false;   // the old ones stay out of the menu, and still open

// absorbed nodes are hidden under the paper (sheets.js does the same for the Image sheet)
const drawNode0 = LGraphCanvas.prototype.drawNode;
LGraphCanvas.prototype.drawNode = function (node) { if (node?.properties?.[KEY] != null && sheetOf(node) && !sheetOf(node).properties.xray) return; return drawNode0.apply(this, arguments); };

// ---- dragging nodes onto a Drop sheet: its zone lights; let go and it's in
function sheetUnder(n) {
  const cx = n.pos[0] + (n.size?.[0] || 100) / 2, cy = n.pos[1] + 15;
  return allSheets().find(s => cx > s.pos[0] && cx < s.pos[0] + s.size[0] && cy > s.pos[1] - 30 && cy < s.pos[1] + s.size[1]);
}
// the mouse wheel zooms the canvas over any node's own boxes too (sheets, timelines, anything drawn in HTML), unless
// what's under the pointer can really scroll that way or the node uses the wheel itself
function wheelZoom() {
  if (wheelZoom.on) return; wheelZoom.on = true;
  addEventListener("wheel", e => {
    const c = app.canvas?.canvas, t = e.target;
    if (e.defaultPrevented || e.__dpd || !c || !(t instanceof Element) || t === c || !t.closest(".dom-widget")) return;
    for (let el = t; el && !el.classList.contains("dom-widget"); el = el.parentElement) {
      if (e.ctrlKey) break;
      const s = getComputedStyle(el), y = /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1, x = /(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
      if (y && (e.deltaY > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : e.deltaY < 0 && el.scrollTop > 0)) return;
      if (x && e.shiftKey) return;
      if (el.tagName === "SELECT" && document.activeElement === el) return;
    }
    e.preventDefault();
    const f = new WheelEvent("wheel", e); f.__dpd = true; c.dispatchEvent(f);
  }, { passive: false });
}
// panning without leaving the node: drag the empty paper of a sheet, or hold the middle button, or hold Space and drag,
// anywhere over a node drawn in HTML. The canvas moves under your hand just as it does off the node.
function panAnywhere() {
  if (panAnywhere.on) return; panAnywhere.on = true;
  let space = false;
  const typing = () => { const a = document.activeElement; return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  addEventListener("keydown", e => { if (e.code === "Space" && !typing()) space = true; }, true);
  addEventListener("keyup", e => { if (e.code === "Space") space = false; }, true);
  addEventListener("blur", () => { space = false; });
  addEventListener("mousedown", e => { if (e.button === 1 && e.target instanceof Element && e.target.closest(".dom-widget")) e.preventDefault(); }, true);   // no auto-scroll arrows
  addEventListener("pointerdown", e => {
    const c = app.canvas, t = e.target; if (!c || !(t instanceof Element) || !t.closest(".dom-widget")) return;
    const paper = !!t.closest(".dpd-drop") && t.matches(".paper, .page, .dpd-in, .dpd-drop, .blank, .grpbox");
    if (!(e.button === 1 || (e.button === 0 && (space || paper)))) return;
    e.preventDefault(); e.stopPropagation();
    let x = e.clientX, y = e.clientY; const cur = document.body.style.cursor; document.body.style.cursor = "grabbing";
    const mv = m => { const k = c.ds.scale || 1; c.ds.offset[0] += (m.clientX - x) / k; c.ds.offset[1] += (m.clientY - y) / k; x = m.clientX; y = m.clientY; c.setDirty(true, true); };
    const up = () => { removeEventListener("pointermove", mv, true); removeEventListener("pointerup", up, true); document.body.style.cursor = cur; };
    addEventListener("pointermove", mv, true); addEventListener("pointerup", up, true);
  }, true);
}
const dragged = () => Object.values(app.canvas?.selected_nodes || {}).filter(n => !isSheet(n) && !n.properties?.[KEY]);
function watch() {
  const el = app.canvas?.canvas; if (!el || el.dataset.dpdDrop) return; el.dataset.dpdDrop = 1;
  el.addEventListener("pointermove", e => {
    if (!(e.buttons & 1)) return;
    allSheets().forEach(s => s.hot(null));
    for (const n of dragged()) { const s = sheetUnder(n), k = s && kindOf(n); if (s && k) s.hot(ZONE_OF[k] || "page"); }
  });
  addEventListener("pointerup", () => setTimeout(() => {
    allSheets().forEach(s => s.hot(null));
    for (const n of dragged()) { const s = sheetUnder(n); if (s && kindOf(n)) s.absorb(n); }
  }, 0), true);
}

let KIN_WIRING = false;
const chainPaint = () => { const s = sheetOf(byId(NOW)); document.querySelectorAll(".dpd-drop [data-chainsheet]").forEach(p => p.classList.toggle("now", !!s && p.dataset.chainsheet === String(s.id))); };
let NOW = null, META = false, PROG = null;   // ...and how far the step working now has got   // the node working now; whether previews say which node they're for
const register = () => { if (!LiteGraph.registered_node_types[TYPE]) LiteGraph.registerNodeType(TYPE, DropSheet); if (!LiteGraph.registered_node_types[FREE]) LiteGraph.registerNodeType(FREE, BlankSheet); if (!LiteGraph.registered_node_types[SHEET]) LiteGraph.registerNodeType(SHEET, DPDSheet); };
// the node library and search: the old sheets hidden, the DPD Sheet named and findable by the old names too
const OLD_SHEETS = [TYPE, FREE, "DPD Image Sheet"];
function tidyMenu() {
  try {
    const root = [...document.querySelectorAll("body > *")].find(e => e.__vue_app__), nd = root?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get("nodeDef"); if (!nd) return false;
    if (!tidyMenu.done) {
      nd.registerNodeDefFilter?.({ id: "dpd.old-sheets", name: "Older DPD sheets", description: "The Drop Sheet, Blank Sheet and Image Sheet: replaced by the DPD Sheet", predicate: d => !OLD_SHEETS.includes(d.name) });
      setInterval(tidyMenu, 2000); tidyMenu.done = true;   // the list is rebuilt now and then (start-up, a node pack loading): dress it again
    }
    const d = nd.nodeDefsByName?.[SHEET]; if (!d) return false; if (d.category === "DPD Studio") return true;
    const about = "A page that wires itself: drop nodes on it. It asks how to start: blank, laid out, an image or video starter, or a tidy grid.";
    const put = { category: "DPD Studio", description: about, backendDescription: about,
      search_aliases: ["sheet", "drop sheet", "blank sheet", "image sheet", "video sheet", "dpd", "page", "dashboard", "layout"] };
    for (const [k, v] of Object.entries(put)) try { d[k] = v; } catch {}   // some fields are read-only: set what can be
    return true;
  } catch { return false; }
}
const EXT = {
  name: "DPD.Studio.DropSheet",
  settings: [{ id: "DPD.Sheet.Start", name: "New DPD Sheets start as", type: "combo", options: ["Ask each time", "Blank page", "Laid out", "Image starter", "Video starter", "Tidy grid"], defaultValue: "Ask each time", category: ["DPD Studio", "Sheets", "Start"],
    tooltip: "Ask each time shows the choices on the new sheet. Laid out adds the timer, the memory ring, the Text Clip, the Comfy Blueprint and the System Check" }],
  registerCustomNodes() { register(); },
  // a workflow can come back looking at an empty part of the canvas (its saved view): if no node is in sight, show the
  // biggest sheet, whole
  afterConfigureGraph() {
    const c = app.canvas, seen = () => { const el = c?.canvas, k = c?.ds?.scale || 1, [ox, oy] = c?.ds?.offset || [0, 0]; if (!el?.clientWidth) return true; const x = -ox, y = -oy, w = el.clientWidth / k, h = el.clientHeight / k; return graph()._nodes.some(n => n.pos[0] < x + w && n.pos[0] + n.size[0] > x && n.pos[1] < y + h && n.pos[1] + n.size[1] > y); };
    let last = "", still = 0, tries = 0;   // the tab's saved view lands a moment after this: wait for the view to settle
    const look = () => {
      const now = JSON.stringify([c?.ds?.scale, ...(c?.ds?.offset || [])]); still = now === last ? still + 1 : 0; last = now;
      if ((still < 2 || tries < 6) && ++tries < 16) return setTimeout(look, 200);
      const S = allSheets(), el = c?.canvas; if (!S.length || !el?.clientWidth || seen()) return;
      const s = [...S].sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1])[0], cw = el.clientWidth, ch = el.clientHeight;
      const k = Math.min(1, (cw - 80) / s.size[0], (ch - 120) / (s.size[1] + 40)); c.ds.scale = k;
      c.ds.offset = [-s.pos[0] + (cw / k - s.size[0]) / 2, -s.pos[1] + (ch / k - s.size[1]) / 2 + 20 / k]; c.setDirty(true, true);
    };
    setTimeout(look, 200);
  },
  setup() {
    if (EXT.ready) return; EXT.ready = true;
    watch(); wheelZoom(); panAnywhere();
    (function again(n) { if (!tidyMenu() && n < 20) setTimeout(() => again(n + 1), 500); })(0);
    // the real wires between parts tucked inside sheets stay hidden (the cords stand for them); x-ray shows them
    const LC = app.canvas?.constructor?.prototype, rl = LC?.renderLink;
    if (rl && !rl._dpd) { LC.renderLink = function (ctx, a, b, l, ...rest) { const o = l && sheetOf(byId(l.origin_id)), t = o && sheetOf(byId(l.target_id)); if (o && t && !o.properties.xray && !t.properties.xray) return; return rl.call(this, ctx, a, b, l, ...rest); }; LC.renderLink._dpd = true; }
    api.addEventListener("executed", e => { const id = String(e.detail?.node), o = e.detail?.output || {}, imgs = o.images || o.gifs || o.videos; if (imgs) allSheets().forEach(s => s.shown(id, imgs)); });
    api.addEventListener("executing", e => { const id = e.detail?.node ?? e.detail; NOW = id; chainPaint(); allSheets().forEach(s => { s.live(id); if (id == null) s.liveDone(); }); });
    api.addEventListener("b_preview_with_metadata", e => { const d = e.detail || {}; META = true; if (d.blob) allSheets().forEach(s => s.preview(d.displayNodeId ?? d.nodeId ?? NOW, d.blob)); });
    api.addEventListener("b_preview", e => { if (!META && NOW != null) allSheets().forEach(s => s.preview(NOW, e.detail)); });
    api.addEventListener("execution_start", () => { Object.assign(RUN, { on: true, t0: Date.now(), err: false }); clockPaint(); });
    const stop = err => { if (!RUN.on) return; const t = Date.now() - RUN.t0; Object.assign(RUN, { on: false, err, last: t }); if (!err) RUN.best = Math.min(RUN.best ?? t, t); clockPaint(); };
    api.addEventListener("execution_success", () => stop(false)); api.addEventListener("execution_error", () => stop(true)); api.addEventListener("execution_interrupted", () => stop(true));
    api.addEventListener("status", e => { const n = e.detail?.exec_info?.queue_remaining; if (n != null) { RUN.q = Math.max(0, n - (RUN.on ? 1 : 0)); clockPaint(); } });
    api.addEventListener("crystools.monitor", e => { const d = e.detail || {}, g = d.gpus?.[0], ok = v => v == null || v < 0 ? null : v; Object.assign(HW, { vram: ok(g?.vram_used_percent), gpu: ok(g?.gpu_utilization), ram: ok(d.ram_used_percent), at: Date.now() }); meterPaint(); });
    api.addEventListener("execution_success", () => allSheets().forEach(s => s.liveDone()));
    api.addEventListener("execution_error", () => allSheets().forEach(s => s.liveDone()));
    api.addEventListener("execution_interrupted", () => allSheets().forEach(s => s.liveDone()));
    api.addEventListener("progress", e => { PROG = [e.detail?.value, e.detail?.max]; const id = String(e.detail?.node ?? NOW); allSheets().forEach(s => { if (s.of("sampler").some(n => String(n.id) === id)) s.progress(e.detail.value, e.detail.max); }); });
  },
};
app.registerExtension(EXT);
// an extension that loads late can miss ComfyUI's start-up calls (seen in a fresh browser profile): catch up once the
// canvas exists, so the sheet can always be added
setTimeout(function catchUp() { if (!app.canvas?.canvas) return setTimeout(catchUp, 500); register(); EXT.setup(); }, 2000);
window.dpdDrop = { kindOf, sheets: allSheets };
