import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfAttachmentViewer } from "@/modules/notes/PdfAttachmentViewer";

const getPage = vi.fn(async (pageNumber: number) => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
  getTextContent: async () => ({
    items: [
      {
        str: pageNumber === 1 ? "A page-anchored lecture quote" : "Second page text",
        hasEOL: true,
      },
    ],
  }),
  render: () => ({ cancel: vi.fn(), promise: Promise.resolve() }),
}));
const documentProxy = {
  numPages: 2,
  getPage,
  destroy: vi.fn(async () => undefined),
};

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve(documentProxy),
    destroy: vi.fn(async () => undefined),
  }),
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/pdf.worker.test.mjs",
}));

describe("PDF attachment reader", () => {
  beforeEach(() => {
    getPage.mockClear();
    documentProxy.destroy.mockClear();
  });

  it("navigates pages, zooms, selects text, and inserts a page-linked quote", async () => {
    const insertContentAt = vi.fn();
    const editor = {
      commands: { insertContentAt },
    } as unknown as Editor;
    render(
      React.createElement(PdfAttachmentViewer, {
        src: "data:application/pdf;base64,test",
        relativePath: "attachments/lecture.pdf",
        title: "lecture.pdf",
        editor,
        getPos: () => 12,
        nodeSize: 2,
      }),
    );

    await expect(screen.findByText("A page-anchored lecture quote")).resolves.toBeVisible();
    expect(screen.getByRole("button", { name: "Open PDF page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Open PDF page 2" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Next PDF page" }));
    await expect(screen.findByText("Second page text")).resolves.toBeVisible();
    expect(screen.getByLabelText("PDF page number")).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "Previous PDF page" }));
    await expect(screen.findByText("A page-anchored lecture quote")).resolves.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Zoom PDF in" }));
    expect(screen.getByText("120%")).toBeVisible();

    const textLayer = screen.getByLabelText("Selectable text from page 1");
    const textNode = textLayer.firstChild;
    if (!textNode) throw new Error("PDF text layer is empty");
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseUp(textLayer);
    const quote = await screen.findByRole("button", { name: "Quote into note" });
    fireEvent.click(quote);

    await waitFor(() => expect(insertContentAt).toHaveBeenCalledOnce());
    expect(insertContentAt).toHaveBeenCalledWith(
      14,
      expect.arrayContaining([
        expect.objectContaining({ type: "blockquote" }),
        expect.objectContaining({
          content: [
            expect.objectContaining({
              marks: [
                expect.objectContaining({
                  attrs: expect.objectContaining({
                    href: "diorna-pdf:attachments%2Flecture.pdf#page=1",
                  }),
                }),
              ],
            }),
          ],
        }),
      ]),
    );
  });
});
