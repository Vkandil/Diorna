# Maps module

Owns authored React Flow canvases. Node X/Y positions are explicit durable
values and user placement is never auto-laid out. Flow state stays transient
until a committed drag/edit updates the workspace map and native Canvas file.
The Gym fixture is the acceptance scenario.

Canvas files use Obsidian's node/edge fields. Diorna extensions must live in a
namespaced additive object. PNG and SVG export are presentation copies; the
`.canvas` file remains authoritative.
