# Maps module

Owns authored React Flow canvases. Node X/Y positions are explicit durable
values and user placement is never auto-laid out. Flow state stays transient
while dragging and is atomically committed with the map history afterward.
Selection, clipboard operations, alignment, grouping, four-sided connections,
resizing, styling, hierarchy, presentation order, and export all operate on
that authored geometry. Explorer drops and clipboard pastes create portable,
resizable image, video, audio, PDF, or generic-file nodes at the pointer. Images
move directly from their surface, while title bars remain available around
interactive media controls. The Gym fixture is the acceptance scenario and its
exact node transform is checked after a browser restart.

Linked-note nodes subscribe to the live note record rather than copying its body.
Their scrollable preview renders the complete current rich-text document, including
portable image, video, audio, PDF, and file attachment blocks. Editing or renaming a
note therefore updates every open map reference without changing canvas geometry.

Canvas files use Obsidian's node/edge fields. Diorna extensions live in an
additive `diorna` object, including sub-map ancestry and cached link previews.
Native renames preserve stable IDs and remove the superseded file. PNG and SVG
export are presentation copies; the `.canvas` file remains authoritative.
