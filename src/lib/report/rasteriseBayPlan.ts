const MAX_EDGE = 2048;

export async function rasteriseSvgElement(svgEl: SVGSVGElement): Promise<Blob> {
  const viewBox = svgEl.viewBox.baseVal;
  const sourceW = viewBox.width || svgEl.clientWidth || 1024;
  const sourceH = viewBox.height || svgEl.clientHeight || 1024;
  const exportScale = MAX_EDGE / Math.max(sourceW, sourceH);
  const exportW = Math.max(1, Math.round(sourceW * exportScale));
  const exportH = Math.max(1, Math.round(sourceH * exportScale));
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(exportW));
  clone.setAttribute("height", String(exportH));
  clone.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${sourceW} ${sourceH}`);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = exportW;
    canvas.height = exportH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to acquire 2D context");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportW, exportH);
    ctx.drawImage(img, 0, 0, exportW, exportH);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
