import { describe, expect, it } from "vitest";
import { connectionSides } from "@/modules/maps/connection";

describe("map connector sides", () => {
  it.each([
    ["source-top", { fromSide: "top", toSide: "bottom" }],
    ["source-right", { fromSide: "right", toSide: "left" }],
    ["source-bottom", { fromSide: "bottom", toSide: "top" }],
    ["source-left", { fromSide: "left", toSide: "right" }],
  ])("keeps the source handle when creating a node from %s", (handle, expected) => {
    expect(connectionSides(handle)).toEqual(expected);
  });

  it("does not invent an anchor for an unknown handle", () => {
    expect(connectionSides("source-center")).toEqual({});
  });
});
