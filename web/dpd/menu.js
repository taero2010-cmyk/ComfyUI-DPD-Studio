// DPD Studio in ComfyUI's top menu. Nothing of DPD Studio runs in a workflow until it has a Comfy Blueprint node; the
// node's switches turn Conduit and the Blueprint tab on or off for that workflow (blueprint.js). Here: "Add the Comfy
// Blueprint node", and "All DPD Studio tools", the one switch that turns everything off everywhere (also under
// Settings → DPD Studio). The first time ComfyUI opens with this installed, a note says how it all works.
import { app } from "../../../scripts/app.js";

const ALL = "DPD.Studio.Enabled", NODE = "Comfy Blueprint", SEEN = "dpd.studio.welcomed";
const setting = () => app.extensionManager.setting;
const tell = () => { dispatchEvent(new Event("dpd-studio-switch")); app.canvas?.setDirty(true, true); };

function addNode() {
  const g = app.graph, had = (g?.nodes || []).find(n => n.type === NODE);
  const n = had || LiteGraph.createNode(NODE);
  if (!had) {
    const c = app.canvas, ds = c.ds, el = c.canvas;   // the middle of what you're looking at
    n.pos = [el.width / 2 / ds.scale - ds.offset[0] - n.size[0] / 2, el.height / 2 / ds.scale - ds.offset[1] - n.size[1] / 2];
    g.add(n);
  }
  app.canvas.selectNode(n, false); app.canvas.centerOnNode?.(n); app.canvas.setDirty(true, true);
  if (setting().get(ALL) === false) setting().set(ALL, true).then(tell);
}

app.registerExtension({
  name: "DPD.Studio.Menu",
  settings: [{ id: ALL, category: ["DPD Studio", "All", "On"], name: "All DPD Studio tools", type: "boolean", defaultValue: true, tooltip: "Off turns every DPD Studio tool off in every workflow. On, they work in any workflow that has a Comfy Blueprint node, as its switches say.", onChange: tell }],
  commands: [
    { id: "DPD.Studio.AddNode", label: "DPD Studio: add the Comfy Blueprint node", menubarLabel: "Add the Comfy Blueprint node", icon: "pi pi-sitemap", function: addNode },
    { id: "DPD.Studio.ToggleAll", label: "DPD Studio: turn all tools on or off", menubarLabel: "All DPD Studio tools", active: () => setting().get(ALL) !== false, function: async () => { await setting().set(ALL, setting().get(ALL) === false); tell(); } },
  ],
  menuCommands: [{ path: ["DPD Studio"], commands: ["DPD.Studio.AddNode", "DPD.Studio.ToggleAll"] }],
  setup() {
    let seen = false; try { seen = !!localStorage.getItem(SEEN); localStorage.setItem(SEEN, "1"); } catch {}
    if (!seen) setTimeout(() => app.extensionManager.toast?.add({
      severity: "info", summary: "DPD Studio is installed",
      detail: "Its tools stay off until you add a Comfy Blueprint node to a workflow (top menu: DPD Studio → Add the Comfy Blueprint node, or Add Node → utils). Then Conduit and the Blueprint tab come on, each with its own switch on that node.",
      life: 20000,
    }), 1500);
  },
});
