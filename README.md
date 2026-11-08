# DPD Studio nodes for ComfyUI

Free tools for people who can't afford the paid ones. These come out of **DPD Studio** (Director Producer Designer), a studio for making films, pictures, sound and websites on one machine. We add a section here each time one is finished.

| Section | What it gives you |
| --- | --- |
| [Comfy Blueprint](#comfy-blueprint) | See where your render is, and learn what every node does and why it's wired there |
| [Comfy Conduit](#comfy-conduit) | Magnets, stacks and passthrough lanes: build a workflow by snapping nodes together, with no long wires |
| [Drop Sheet](#drop-sheet) | One beautiful page instead of a tangle: drop ordinary nodes on it and it lays them out, wires them and shows the result |

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

## Drop Sheet

**Design your workflow like a page, not a plate of spaghetti.**

The Drop Sheet (**Add Node → DPD Studio → Drop Sheet**) starts as an empty page with zones: **Loaders, Sampler, Prompt, Canvas, Pictures and Results**. Drag any ordinary ComfyUI node onto it and the node finds its zone, tucks itself under the paper, and its zone lights up with just the settings that matter. The sheet does the wiring for you. You never draw a wire inside it.

The Drop Sheet is a node you add yourself, so it works in any workflow you put it in, with or without a Comfy Blueprint node.

### Zones that grow
- **Loaders**, top left, is one box: your model, its text encoder, the **VAE** (the model's own, or pick any VAE file), every **LoRA** (reorder them with ↑) and other models such as upscale or ControlNet models.
- Each LoRA rides **the model listed above it**. Wan 2.2's high-noise LoRA goes on the high-noise model, and the low-noise LoRA on the low-noise model.
- Any other node gets **a tile of its own**, built from its settings, and joins the chain where it belongs:
  - picture steps (an upscaler) come after the picture is made;
  - model steps come after the LoRAs;
  - prompt and latent steps come before the sampler.
- The sheet grows **down and sideways**: from 2 columns to 3 or 4 as it fills, or pick with **Columns**.

### Tiles you can arrange
Drag a tile by its **⠿** grip to move it, and make it wide or narrow with **↔**. Because the wiring is invisible, **the order of the tiles is the order things happen**: put the face fix before the upscale by dragging its tile in front.

### The plumbing stays out of sight
VAE Decode and Encode, an empty negative prompt and the start picture's loader are made and wired for you. A drawer at the bottom lists them for anyone curious.

### Red boxes that fix themselves
When something is missing, its tile turns red and says what it needs in plain words, with a button that adds the right node, already wired. For example: *"No sampler: nothing will be painted. ＋ KSampler"*, or *"Needs an UPSCALE_MODEL. ＋ Load Upscale Model"*.

### Image and video
- **Image:** Text → image, or Image → image, with a start picture, an upload button and a **Change** slider (the sampler's denoise).
- **Video:**
  - **Frames** (size and length, or **Wan Image to Video**) and a **Start frame**.
  - **Samplers that stack** in tile order. Wan 2.2 takes two: high noise, then low noise.
  - Steps that take both prompts (**LTX Conditioning**, **Wan Image to Video**) are wired into both.
  - **Save Video** gets its Create Video step made for it, at the right frame rate.
- Results show **in the sheet**, pictures and playing videos alike, and the sheet grows to fit them.

### Sheets wired together
Every sheet has a **picture in** and a **picture out** socket. Wire one sheet's out into another's in, to as many sheets as you like and in chains as long as you like. The next sheet starts from the first sheet's finished picture: a video's start frame, an image-to-image, or any step that wants a picture.

### Make it yours
- **Simple / Standard / Everything:** from just what a first picture needs to every setting of every part, the plumbing too.
- **Font and size** for the sheet's own words, including easy-to-read fonts for big screens.
- **Look:** paper colour (presets such as Forest, Midnight and Paper, or any colour), accent colour, corner roundness, and cozy or compact spacing. On light paper the words turn dark by themselves.
- While it renders, **the working tile glows** and the sampler shows its progress.

**Under the hood:** the nodes you drop stay real ComfyUI nodes, tucked under the sheet. The workflow runs exactly as if you had wired it by hand, and the sheet itself never goes to the server.

## License

MIT. Use these nodes, change them and share them, as long as the license stays with them.
