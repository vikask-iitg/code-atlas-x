import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";

const PAD = 40;

function target(nodes: Node[]) {
  const el = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!el) throw new Error("Diagram is not visible. Switch to the Architecture view first.");
  const b = getNodesBounds(nodes);
  const width = Math.round(b.width + PAD * 2);
  const height = Math.round(b.height + PAD * 2);
  const vp = getViewportForBounds(b, width, height, 0.1, 2, 0);
  const bg = getComputedStyle(document.body).getPropertyValue("--background").trim() || "#ffffff";
  return {
    el,
    width,
    height,
    opts: {
      backgroundColor: bg,
      width,
      height,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x + 0}px, ${vp.y + 0}px) scale(${vp.zoom})` },
    },
  };
}

export function download(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function exportPng(nodes: Node[], name: string) {
  const t = target(nodes);
  const url = await toPng(t.el, { ...t.opts, pixelRatio: 2 });
  download(url, `${name}.png`);
}

export async function exportSvg(nodes: Node[], name: string) {
  const t = target(nodes);
  const url = await toSvg(t.el, t.opts);
  download(url, `${name}.svg`);
}

export async function exportPdf(nodes: Node[], name: string) {
  const t = target(nodes);
  const url = await toPng(t.el, { ...t.opts, pixelRatio: 2 });
  const { jsPDF } = await import("jspdf");
  const landscape = t.width >= t.height;
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "px", format: [t.width, t.height], hotfixes: ["px_scaling"] });
  pdf.addImage(url, "PNG", 0, 0, t.width, t.height);
  pdf.save(`${name}.pdf`);
}

export function exportText(text: string, filename: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  download(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
