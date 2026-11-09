# DPD Studio nodes for ComfyUI

Free tools for people who can't afford the paid ones. These come out of **DPD Studio** (Director Producer Designer), a studio for making films, pictures, sound and websites on one machine. We add a section here each time one is finished.

| Section | What it gives you |
| --- | --- |
| [Comfy Blueprint](#comfy-blueprint) | See where your render is, and learn what every node does and why it's wired there |
| [Comfy Conduit](#comfy-conduit) | Magnets, stacks and passthrough lanes: build a workflow by snapping nodes together, with no long wires |
| [DPD Sheet](#dpd-sheet) | One beautiful page instead of a tangle: drop ordinary nodes on it and it lays them out, wires them and shows the result |
| [System Check](#system-check) | Reads your machine, suggests the picture size, steps and more, and a test run finds the biggest size that's safe |

More sections are on the way.

## Install

Clone into `ComfyUI/custom_nodes` and restart ComfyUI:

```
cd ComfyUI/custom_nodes
git clone https://github.com/taero2010-cmyk/ComfyUI-DPD-Studio
```

There are no extra Python requirements yet. If a section ever needs some, they'll be listed under that section.

## Turning it on and off

**Nothing from DPD Studio runs until you ask for it.** After installing, your workflows look and behave exactly as before. A workflow gets DPD Studio's tools when it has a **Comfy Blueprint node**:

- Add one from the top menu, **DPD Studio → Add the Comfy Blueprint node**, or from **Add Node → utils → Comfy Blueprint**.
- With the node in the workflow, Conduit and the Blueprint tab come on. Each has its own switch on the node, under **On here**, and the switches are saved with that workflow.
- Take the node out and DPD Studio is off in that workflow again.
- **DPD Studio → All DPD Studio tools** in the top menu (also in Settings → DPD Studio) turns everything off in every workflow at once.

Turning a tool off never changes your workflow: Conduit's wires are ordinary ComfyUI links, and the Blueprint node only displays. The first time ComfyUI opens with DPD Studio installed, a short note explains all this.

---

## Comfy Blueprint

**ComfyUI shows you the wires. Comfy Blueprint tells you what they mean.**

<img src="docs/blueprint-tab.jpg" alt="The Blueprint tab during a render: finished nodes ticked, KSampler glowing green at step 32 of 60, each node with what it does and why it is here" width="300" align="right">

### The Blueprint tab
A new tab in ComfyUI's left sidebar (the sitemap icon). It lists every node of the open workflow **in the order ComfyUI runs them**, and for each one:

- **What it does**, in plain words: *"The artist. Starting from noise, it removes a little noise each step…"*
- **Why it's here**, meaning why it's wired where it is: *"Everything meets here: the MODEL from the loader, the positive and negative prompts, and the starting latent…"* Nodes without a hand-written note get a "why" read straight from their wires: what they take, from which node, and who they hand their result to.
- **Its wires**: `positive ← CLIP Text Encode · CONDITIONING`
- **Its settings**: seed, steps, cfg, sizes…
- **Skipped nodes**: nodes that won't run, because nothing they feed is saved or shown, are marked as such.

Click any node in the list to jump to it on the canvas.

### Live, while it runs
- **came from**, **now** and **next** stay pinned at the top of the tab
- the node working now **glows green**, with its step counter and a progress line
- finished nodes are ticked, and cached ones count as done
- long jobs that report two counts, such as chunks of a long video and the sampler's steps inside each chunk, show both: `chunk 3/40 · 12/30`

### The Comfy Blueprint node
Add it from **utils → Comfy Blueprint** or the top menu (**DPD Studio → Add the Comfy Blueprint node**). It turns DPD Studio on in that workflow, with a switch for Conduit and one for the Blueprint tab, and it's a small came from / now / next box for your canvas. Click a step to jump to that node; click anywhere else to open the full Blueprint. It only displays: it's never sent to the server and never changes a render.

### Add notes for more nodes
`web/blueprint/notes.json` holds the plain-words notes, keyed by node class name:

```json
"KSampler": { "what": "What it does.", "why": "Why it's wired where it is." }
```

Notes already cover ComfyUI's core nodes and the whole Stubelius Ultimate LTX 2.5 pack (the LTX Director CS, its Guide, Seeds, Finish and the rest). Pull requests with notes for more nodes are very welcome. That's how this gets better for everyone.

<br clear="right">

---

## Comfy Conduit

**Snap nodes together like magnets. Long wires ride lanes instead of crossing your canvas.**

<img src="docs/conduit.jpg" alt="A whole text-to-image workflow built as one stack: wires from Load Checkpoint run down a lane on the left to the nodes that need them" width="300" align="right">

### Magnets
Drag a node near another. If they can connect, the edge lights up green and a label shows exactly what will wire up (`CLIP → clip`, `VAE → vae (lane)`). Let go and the node snaps alongside and wires itself. If nothing fits, nothing snaps.

Snapping wires to the **whole stack**, not just the node you dropped next to. A VAE Decode dropped at the bottom gets its VAE from the Load Checkpoint at the top. Members are read top to bottom, so a prompt stacked above another lands on *positive* and the lower one on *negative*.

Alt-drag is still ComfyUI's own copy-and-drag; the copy starts outside any stack.

### Starting points slot themselves in
Some nodes start something rather than continue it: a LoRA, an upscale model, a ControlNet. Drop one onto a stack and it slots into the chain where it belongs, even when nothing in the stack takes it yet. The green line shows where it will go, and the label says what will happen.

- **Load LoRA** slots in after Load Checkpoint: it takes the model and CLIP, and the KSampler and prompts now get theirs from the LoRA.
- **Load Upscale Model** brings its partner, *Upscale Image (using Model)*: *"Adds Upscale Image (using Model) after VAE Decode, ahead of Preview Image"*. The picture now goes through the upscaler on its way to Preview.
- **Load ControlNet** brings *Apply ControlNet* and slots it between the prompts and the KSampler.

### An on/off switch for each one
A starting point that slotted itself in gets a small **switch** beside its ⇅ badge. It turns the starting point and its partner on and off together. Switched off, they're bypassed: the picture (or model, or prompts) passes straight through as if they weren't there, so you can keep an upscaler in your stack and skip it for a quick run. Switched-off units fade and their lane wires turn dashed. The setting is saved with the workflow.

### Columns: a stack that wraps
Like text wrapping onto a new line. When a stack's column reaches the height you set (**Settings → Comfy Blueprint → Conduit → Column height**, 1600 by default), dropping a node below it starts a **new column at the top**, to the right: *"Column full, new column · …"*. While you drag, a dashed **＋ next column** spot also sits at the stack's top right, so you can start a new column whenever you like. Columns line up side by side at the same top, each with its own width, and the lanes run in the gap between them. A new column steps past anything already on the canvas instead of landing on it.

When a node could be fed by more than one node in the stack, it takes the one at the end of the line: a Save Image dropped at the bottom takes the upscaled picture, not the one before the upscale.

### Either/or: two ways to make the same thing
Drop a node **beside** one that makes the same things (another sampler, another video engine) and it becomes its **alternative**: it takes the same inputs from the stack and waits, muted. Each one shows an **IN USE** / **USE** pill; click **USE** and everything that used the first now uses the second, and the first is muted, so only one ever runs. Right-click either one for **Use this one instead** or **Stop being alternatives**.

### Stacks
Snapped nodes become one stack and move together: drag any member and the whole stack follows. To take a node out, **right-click it → Take out of stack** (or use the button in its ⇅ picker). **Take out of stack and unplug its wires** does the same and unplugs every wire too. **Take the whole stack apart** is in the same menu.

### Line up
The thing everyone does by hand before showing a workflow, done for you. Every time a node snaps into a stack, the stack lines up: each column gets one width, the widest node's (never narrower than a node needs), and every gap becomes the same. Nodes beside the column line their tops up with the node they sit next to.

It works on any nodes, not only stacks: select a few, right-click one and choose **Line up the selected nodes**. A stack also has **Line up this stack** in its right-click menu. Turn off the automatic line-up under **Settings → Comfy Blueprint → Conduit → Line up**.

### Passthrough lanes
A wire between two members of a stack, with others in between, or one that climbs back up the stack, is drawn through the stack's lane channel instead of looping across the canvas. Each lane has its own track, so many can run side by side.

The wire itself is an ordinary ComfyUI link. Renders are exactly the same, and a workflow opened without this pack just shows normal wires.

### The lane picker
The **⇅** badge on a node's title opens a list of everything that node can take and every node on the canvas that can feed it, nearest first: *"vae needs a VAE: from Load Checkpoint · 5 boxes up, through the lanes"*. Pick one and it's wired.

Every node has the badge, including ones that only *give*, like Load Upscale Model. When nothing on the canvas can use what a node makes (or make what it needs), the picker names its **partner**, with a note on what that partner does: *"Nothing on the canvas can use an UPSCALE_MODEL yet. Its partner: ＋ Add Upscale Image (using Model)"*. One click adds the partner to the stack, wired, and it picks up anything else it needs from the stack.

Turn it all off under **Settings → Comfy Blueprint → Conduit**.

<br clear="right">

## DPD Sheet

**Design your workflow like a page, not a plate of spaghetti.**

Add it from **Add Node → DPD Studio → DPD Sheet** (searching for "sheet", "image sheet" or "video sheet" finds it too). Drag any ordinary ComfyUI node onto it: the node finds its section (**Loaders, Sampler, Prompt, Canvas, Pictures, Results**), tucks itself under the paper, and the sheet does the wiring. You never draw a wire inside it.

The sheet is a node you add yourself, so it works in any workflow, with or without a Comfy Blueprint node.

### How would you like to start?
A new sheet asks, right on the paper:
- **Blank page:** just the paper. Drop anything on it.
- **Laid out:** the timer, the memory ring, the Comfy Blueprint and the System Check, ready on the page.
- **Image starter / Video starter:** a sampler plus everything it needs (model, prompt, size or frames, a preview or a saved video), all wired.
- **Tidy grid:** sections arrange themselves in neat rows. Drag one to change the order.

Tick **Always start this way** to skip the question. Change it later in the sheet's gear or in **Settings → DPD Studio**.

### A page you lay out yourself
- Move any section by its title bar and widen it from its corner. **Snap to grid** keeps things neat, or switch to **Tidy grid**.
- **Group** sections (Shift+click their titles) so they move together. **Ctrl+drag** a title to copy a section. Drag a section off the sheet to take its nodes back out onto the canvas.
- **Wheel zoom** and **pan** work over the sheet the same as on the canvas.

### Make it yours
- **Cards or Melt:** each section in its own card, or melted into the paper with only the fields standing out.
- **Colours:** paper, accent, titles, words and fields, with palettes, any colour, an eyedropper that picks from the screen, and a row of your own colours. Title bands with adjustable corners, for the whole sheet or per section.
- **Background pictures** for the sheet or a single section, and **saved looks** you can put on any other section.
- **Simple / Standard / Everything:** from just what a first picture needs to every setting of every part.

### While it renders
- **Live preview** in Results as the sampler paints, with its step count, and **a picture after each step** (an upscale, a fix) in that step's own section.
- **Timer** (off until you turn it on in the gear): big digits for how long the render has run, the last and best times and what's waiting. Pick its colour; Alarm red on a dark face looks like a bedside clock.
- **Memory ring:** neon rings for VRAM, GPU load and RAM that go green, yellow, orange and red as they fill. GPU load comes from the Crystools monitor when it's on.

### Linked sheets and the Switchboard
- Drag the **plug** on a sheet's right edge onto another sheet, or use the **chain** button by the gear, to link them. A soft cord shows the link.
- Linked sheets share what they have: a Loaders sheet feeds a Text sheet and a Picture sheet, and **pictures flow from left to right**, so an upscale or fix on its own sheet takes the finished picture from the sheet before it.
- The **Switchboard** lists every sheet and every step with an on/off switch. A step that's off lets the picture straight through, which makes turning an upscale on and off one click. A sheet that's off doesn't save or show, and sheets it feeds turn off with it. A strip along its top shows the chain and lights up the sheet that's working.
- Sheets also have **picture in** and **picture out** sockets, for wiring sheets together the old way.

### Nothing missing
When the page needs something to run, an amber bar at the top says what, in plain words, with a ＋ button that adds the right node, already wired. **Fix it all** adds everything at once. A node from a pack you don't have gets a **Find it** button that opens the Manager's missing-packs list.

### Director and timeline nodes on the page
Nodes that draw their own view (director and timeline nodes from other packs) get a card on the sheet showing that view, live and usable. Many of them are dressed in the sheet's colours, without changing their code; a paint button on the card switches between the sheet's colours and their own.

### Under the hood
The nodes you drop stay real ComfyUI nodes, tucked under the sheet. The workflow runs exactly as if you had wired it by hand, and the sheet itself never goes to the server. **Show the real nodes and wiring** in the gear lays them out beside the sheet, wires and all.

### Older sheets
Workflows made with the earlier **Drop Sheet** or **Blank Sheet** still open and work. They've left the Add Node menu, and a Drop Sheet has a **Switch to the new DPD Sheet** button that moves everything across.

## System Check

Search for **System Check** in Add Node, or **Add** it from a sheet's gear (under Recommended). It reads your graphics card, memory, disk and attention, and suggests a picture size, steps, CFG and more for the model in your workflow, each with a reason. **Run test** renders a few quick previews at growing sizes (nothing is saved) and finds the biggest size that stays fast. **Use these settings** puts the advice into your workflow, with an Undo.

## License

MIT. Use these nodes, change them and share them, as long as the license stays with them.
