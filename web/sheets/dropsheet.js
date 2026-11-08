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

const TYPE = "DPD Drop Sheet", KEY = "DPD sheet", W = 660;
const STREAM = ["MODEL", "CLIP", "VAE", "CONDITIONING", "LATENT", "IMAGE"];
const ZONES = {   // id: [name, icon, empty hint, required, wide]
  loaders: ["Loaders", "box", "drop model, CLIP, VAE, LoRA, upscale or ControlNet loaders here", true, false],
  sampler: ["Sampler", "dial", "drop a KSampler here", true, false],
  prompt: ["Prompt", "quote", "drop a CLIP Text Encode here (a second becomes what to avoid)", true, true],
  canvas: ["Canvas", "aspect", "drop an Empty Latent Image here", true, false],
  pictures: ["Pictures", "photo", "drop Load Image nodes here", false, false],
  results: ["Results", "spark", "drop a Save Image or Preview Image here", true, true],
};
const START_ORDER = ["loaders", "sampler", "prompt", "canvas", "pictures", "results"];
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
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>', layers: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>',
  quote: '<path d="M9 7H5v6h4l-2 4"/><path d="M19 7h-4v6h4l-2 4"/>', aspect: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4h3M17 14v-4h-3"/>',
  dial: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 18l6-5 4 3 3-2 5 4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>', check: '<path d="M5 12l4 4 10-10"/>', spark: '<path d="M12 3l1.8 5.6L19.5 10l-5.7 1.5L12 17l-1.8-5.5L4.5 10l5.7-1.4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', drop: '<path d="M12 3c3.5 4.5 6 7.7 6 10.5a6 6 0 0 1-12 0C6 10.7 8.5 7.5 12 3z"/>', grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  wide: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>', film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>', pipe: '<path d="M4 8h6a4 4 0 0 1 4 4v0a4 4 0 0 0 4 4h2"/><circle cx="4" cy="8" r="1.5"/><circle cx="20" cy="16" r="1.5"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
};
const svg = (k, s = 14) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- where a node belongs, from what it gives and takes
const isPair = n => ["positive", "negative"].every(nm => n.inputs?.some(i => i.name === nm) && n.outputs?.some(o => o.name === nm));   // takes and gives both prompts
const outs = n => (n.outputs || []).map(o => o.type), ins = n => (n.inputs || []).filter(i => !i.widget).map(i => i.type);
function kindOf(n) {
  const t = n.comfyClass || n.type || "", o = outs(n), i = ins(n);
  if (n.type === TYPE || n.isVirtualNode || n.type === "DPD Image Sheet") return null;
  if (/^(SaveImage|PreviewImage|SaveVideo|PreviewVideo|SaveAnimatedWEBP|SaveAnimatedPNG|SaveWEBM)$/.test(t) || /VideoCombine/i.test(t) || ((i.includes("IMAGE") || i.includes("VIDEO")) && !o.length)) return "out";
  if (t === "CreateVideo") return "makevideo";
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
const ZONE_OF = { model: "loaders", loader: "loaders", lora: "loaders", vae: "loaders", sampler: "sampler", prompt: "prompt", size: "canvas", frames: "canvas", picture: "pictures", out: "results" };
// a zone's name, icon and hint for this sheet's kind
const VIDEO_ZONES = { sampler: ["Samplers", "dial", "drop a sampler (Wan 2.2 takes two: high noise, then low noise)"], canvas: ["Frames", "aspect", "drop an empty video latent, or Wan Image to Video"],
  pictures: ["Start frame", "photo", "drop a Load Image for the first frame"], results: ["Results", "spark", "drop a Save Video or Video Combine here"] };
const zoneInfo = (z, kind) => kind === "video" && VIDEO_ZONES[z] ? [...VIDEO_ZONES[z], ...ZONES[z].slice(3)] : ZONES[z];
const graph = () => app.graph;
const byId = id => id == null ? null : graph()?.getNodeById(id);
const changed = () => { try { graph()?.change?.(); app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch {} };
const sheetOf = n => { const id = n?.properties?.[KEY]; const s = id != null && byId(id); return s && s.type === TYPE ? s : null; };
const allSheets = () => (graph()?._nodes || []).filter(n => n.type === TYPE);
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
fetch("/object_info/VAELoader").then(r => r.json()).then(j => { VAE_FILES = j?.VAELoader?.input?.required?.vae_name?.[0] || []; allSheets().forEach(s => s.render()); }).catch(() => {});

// ---- the look
let dressed = false;
function dress() {
  if (dressed) return; dressed = true;
  const l = document.createElement("link"); l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Karla:wght@400;500;700&family=JetBrains+Mono:wght@400;500&family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;600&family=Inter:wght@400;600&family=Lora:wght@400;600&family=Nunito:wght@400;700&display=swap";
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
.dpd-drop .th{display:flex;align-items:center;gap:6px;font:700 ${z(10)} var(--fl,Karla);letter-spacing:.14em;color:var(--gold);text-transform:uppercase}
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
.dpd-drop .go{margin-top:12px;width:100%;display:flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:999px;padding:10px;background:linear-gradient(180deg,var(--gold2),var(--gold));color:#201400;font:700 ${z(13)} var(--fl,Karla);cursor:pointer;box-shadow:0 6px 16px color-mix(in srgb,var(--gold) 25%,transparent)}
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
.dpd-drop .typ .lk.on{background:var(--gold);color:#201400}`;
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
    this.tileDrag();
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
  release(id, quiet) {
    id = String(id); const n = byId(id); if (!n) return; const P = this.properties;
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
  tuck() { this.parts().forEach((id, i) => { const n = byId(id); if (n) { n.pos = [this.pos[0] + 20 + (i % 5) * 8, this.pos[1] + 40 + i * 5]; n.flags.collapsed = true; } }); }
  helper(k, type, setup) {
    let n = byId(this.properties.helpers[k]);
    if (!n) { n = LiteGraph.createNode(type); if (!n) return null; graph().add(n); setup?.(n); this.properties.helpers[k] = String(n.id); n.properties = n.properties || {}; n.properties[KEY] = this.id; n.flags.collapsed = true; }
    return n;
  }
  // the sheet wired into "picture in", and the real node that gives its finished picture
  upstream() { const l = this.inputs?.[0]?.link; if (l == null) return null; const L = graph().links, k = L?.get ? L.get(l) : L?.[l], s = byId(k?.origin_id); return s?.type === TYPE ? s : null; }
  finalImage() { if (!this._final || !byId(this._final.id)) { if (this.wiring) return null; this.wire(); } return this._final && byId(this._final.id) ? this._final : null; }
  onConnectionsChange() { setTimeout(() => { this.wire(); this.render(); this.downstream().forEach(s => { s.wire(); s.render(); }); changed(); }, 0); }
  downstream() { return allSheets().filter(s => s !== this && s.upstream() === this); }
  // ---- the wiring: by what each part gives and takes, and for steps, by the order of their tiles on the page
  wire() {
    if (this.wiring) return; this.wiring = true;
    try { this.wire0(); } finally { this.wiring = false; }
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
    const loaders = this.in("loaders").map(byId), src = T => { const L = loaders.filter(m => kindOf(m) !== "lora" && out(m, T) >= 0); return L.find(m => m.outputs.length === 1) || L[0]; };
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
    const prompts = this.of("prompt"), pos = prompts[0], samplers = this.of("sampler"), samp = samplers[0], size = this.of("size")[0];
    const models = loaders.filter(m => kindOf(m) === "model" && out(m, "MODEL") >= 0);
    const ix = (n, name, io) => (io === "o" ? n?.outputs : n?.inputs)?.findIndex(x => x.name === name) ?? -1;
    const plug = (from, oi, to, ii) => { if (!from || !to || oi < 0 || ii < 0) return; const cur = to.inputs[ii].link; if (cur != null && String(origin(cur)) === String(from.id)) return; from.connect(oi, to, ii); };
    let neg = prompts[1];
    if (!neg && samp && C) neg = this.helper("negative", "CLIPTextEncode", n => setW(n, "text", ""));
    else if (prompts[1] && this.properties.helpers.negative) { const h = byId(this.properties.helpers.negative); delete this.properties.helpers.negative; if (h) graph().remove(h); }
    link(C, "CLIP", pos, "clip"); link(C, "CLIP", neg, "clip");
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
    const item = (n, body, extra = "", keep = []) => `<div class="item"><div class="nm">${esc(n.title)}<span class="sp"></span>${extra}${give(n)}</div>${L3 ? keep.map(k => k === "text" ? field(n, "text", "", "text") : "").join("") + (keep.includes("pics") ? body : "") + allFields(n, keep) : body}</div>`;
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
      prompt: () => this.of("prompt").map((n, i) => (i ? `<div class="lab2">avoid</div>` : "") + item(n, field(n, "text", "", "text").replace("<textarea", i ? '<textarea class="neg"' : "<textarea"), "", ["text"])).join("")
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
      results: () => this.of("out").map(n => item(n, `<div class="pics">${(P.last?.[n.id] || []).map(u => /\.(mp4|webm|mov|mkv)(&|$)/i.test(u.split("?")[1] || u) || /filename=[^&]*\.(mp4|webm|mov)/i.test(u) ? `<video src="${u}" autoplay loop muted playsinline controls></video>` : `<img src="${u}">`).join("") || `<div class="none">your picture appears here</div>`}</div>` + (wOf(n, "filename_prefix") && !L1 ? field(n, "filename_prefix", "save as") : "") + (byId(P.helpers.video) && !L1 && inTn(n, "VIDEO") ? field(byId(P.helpers.video), "fps", "fps") : ""), "", ["pics"])).join(""),
    };
    const tile = z => {
      const step = z.startsWith("step:"), n = step && byId(z.slice(5));
      if (step && !n) return "";
      const [name, icon, hint] = step ? [n.title, "plus", ""] : zoneInfo(z, P.kind);
      const body = step ? (L3 ? allFields(n) : (n.widgets || []).filter(w => w.name && !/^(control_after_generate|upload)$/.test(w.name) && !w.hidden).slice(0, L1 ? 2 : 99).map(w => field(n, w.name, w.name.replace(/_/g, " "), w.options?.multiline ? "text" : "auto")).join("")) : tiles[z]();
      const filled = step || (z === "canvas" ? true : z === "pictures" && this.upstream() ? true : this.in(z).length > 0), bad = this.needs(z).length > 0;
      const wide = P.wide[z] ?? (step ? true : ZONES[z][4]);
      const where = step && ({ IMAGE: "works on the picture after it's made", MODEL: "changes the model, after the LoRAs", CONDITIONING: "shapes the prompt before the sampler", LATENT: "works on the latent before the sampler" }[["IMAGE", "MODEL", "CONDITIONING", "LATENT"].find(T => n.inputs?.some(i => i.type === T && !i.widget) && n.outputs?.some(o => o.type === T))] || "wired to what it needs");
      return `<div class="tile ${filled ? "" : "empty"} ${bad ? "bad" : ""} ${wide ? "wide" : ""}" data-zone="${z}" draggable="false">
        <div class="th"><span class="grip" data-grip title="Drag to move this tile">${svg("grip", 13)}</span>${svg(icon, 13)}${esc(name)}<span class="sp"></span><button data-wide="${z}" title="${wide ? "Make it narrow" : "Make it wide"}">${svg("wide", 13)}</button>${step ? give(n) : ""}</div>
        ${step ? `<div class="sub">${where}</div>` : ""}${filled ? body : `<em>${hint}</em>`}${needs(z)}</div>`;
    };
    const pipes = Object.entries(P.helpers).map(([k, id]) => byId(id) && `<li>${esc(byId(id).title)} <span style="opacity:.7">(${{ video: "turns the frames into a video", decode: "turns the result into a picture", encode: "turns the start picture into a latent", negative: "an empty prompt to avoid", load: "loads the start picture" }[k] || k})</span>${L3 ? allFields(byId(id)) : ""}</li>`).filter(Boolean);
    this.el.innerHTML = `<div class="dpd-in">
      <div class="hd"><div class="badge">${svg("layers", 17)}</div><div class="t"><b>Drop sheet</b><small>DPD Studio · ${P.kind === "video" ? "video" : "image"}</small></div>
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
      ${pipes.length ? `<details class="pipes" ${L3 ? "open" : ""}><summary>${svg("pipe", 13)}Plumbing: ${pipes.length} part${pipes.length > 1 ? "s" : ""} wired for you, out of sight</summary><ul>${pipes.join("")}</ul></details>` : ""}</div>`;
    this.typeApply(); this.fit();
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
    s.setProperty("--gold", a); s.setProperty("--gold2", mixHex(a, "#ffffff", .35));
    s.setProperty("--r", `${L.r ?? 12}px`); s.setProperty("--dn", L.dense ? .7 : 1);
    this.bgcolor = v.bgB; this.color = v.t1; graph()?.setDirtyCanvas(true, true);
  }
  typeApply() { this.lookApply(); const z = this.properties.zoom || 1, f = this.properties.font; this.el.style.setProperty("--z", z); ["--fh", "--fl", "--fm"].forEach(v => f ? this.el.style.setProperty(v, `"${f}"`) : this.el.style.removeProperty(v)); }
  // ---- the sheet's own controls
  input(e, done) {
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
    if (q("[data-add]")) return this.add(q("[data-add]").dataset.add);
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
    if (q(".go")) app.queuePrompt(0, 1);
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
  hot(z) { this.el.querySelectorAll(".hot").forEach(x => x.classList.remove("hot")); if (!z) return; const t = this.el.querySelector(`.tile[data-zone="${z}"]`); (t || this.el.querySelector(".page"))?.classList.add("hot"); }
  live(id) { this.el.querySelectorAll(".live").forEach(x => x.classList.remove("live")); if (id == null) return; id = String(id); const z = this.properties.order.find(z => z === `step:${id}` || (this.properties.zones[z] || []).includes(id)); if (z) this.el.querySelector(`.tile[data-zone="${z}"]`)?.classList.add("live"); }
  shown(id, images) {
    if (!this.of("out").some(n => String(n.id) === id)) return;
    (this.properties.last = this.properties.last || {})[id] = images.map(im => api.apiURL(`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder || "")}&type=${im.type}&t=${Date.now()}`));
    this.render(); changed();
  }
  progress(v, max) { const b = this.el.querySelector(".bar"); if (!b) return; b.classList.toggle("on", v < max); b.querySelector("i").style.width = `${Math.round(v / max * 100)}%`; }
  onConfigure() { setTimeout(() => { this.norm(); this.tuck(); this.render(); }, 0); }
  onRemoved() { this.parts().forEach(id => { const n = byId(id); if (n) { delete n.properties[KEY]; n.flags.collapsed = false; } }); }
  onDrawBackground() { if (!this.flags.collapsed && this.parts().some(id => { const n = byId(id); return n && (n.pos[0] < this.pos[0] || n.pos[0] > this.pos[0] + 60); })) this.tuck(); }
}
DropSheet.title = "Drop Sheet";
DropSheet.category = "DPD Studio";

// absorbed nodes are hidden under the paper (sheets.js does the same for the Image sheet)
const drawNode0 = LGraphCanvas.prototype.drawNode;
LGraphCanvas.prototype.drawNode = function (node) { if (node?.properties?.[KEY] != null && sheetOf(node)) return; return drawNode0.apply(this, arguments); };

// ---- dragging nodes onto a Drop sheet: its zone lights; let go and it's in
function sheetUnder(n) {
  const cx = n.pos[0] + (n.size?.[0] || 100) / 2, cy = n.pos[1] + 15;
  return allSheets().find(s => cx > s.pos[0] && cx < s.pos[0] + s.size[0] && cy > s.pos[1] - 30 && cy < s.pos[1] + s.size[1]);
}
const dragged = () => Object.values(app.canvas?.selected_nodes || {}).filter(n => n.type !== TYPE && !n.properties?.[KEY]);
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

app.registerExtension({
  name: "DPD.Studio.DropSheet",
  registerCustomNodes() { LiteGraph.registerNodeType(TYPE, DropSheet); },
  setup() {
    watch();
    api.addEventListener("executed", e => { const id = String(e.detail?.node), o = e.detail?.output || {}, imgs = o.images || o.gifs || o.videos; if (imgs) allSheets().forEach(s => s.shown(id, imgs)); });
    api.addEventListener("executing", e => { const id = e.detail?.node ?? e.detail; allSheets().forEach(s => s.live(id)); });
    api.addEventListener("progress", e => { const id = String(e.detail?.node); allSheets().forEach(s => { if (s.of("sampler").some(n => String(n.id) === id)) s.progress(e.detail.value, e.detail.max); }); });
  },
});
window.dpdDrop = { kindOf, sheets: allSheets };
