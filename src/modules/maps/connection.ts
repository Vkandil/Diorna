import type { CanvasEdge } from "@/shared/models";

type MapSide = NonNullable<CanvasEdge["fromSide"]>;

export function connectionSides(handleId: string | null | undefined): {
  fromSide?: MapSide;
  toSide?: MapSide;
} {
  const side = handleId?.replace("source-", "");
  if (side !== "top" && side !== "right" && side !== "bottom" && side !== "left") return {};
  return {
    fromSide: side,
    toSide: { top: "bottom", right: "left", bottom: "top", left: "right" }[side] as MapSide,
  };
}
