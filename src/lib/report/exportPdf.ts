export async function exportReportPdf(filenameHint: string): Promise<void> {
  const api = window.electronAPI;
  if (!api?.report?.printToPdf) {
    throw new Error("PDF export is only available in the desktop app.");
  }

  document.body.classList.add("report-print-mode");
  // Allow the print stylesheet to apply before capturing.
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  try {
    const buffer = await api.report.printToPdf();
    const blob = new Blob([buffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenameHint}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    document.body.classList.remove("report-print-mode");
  }
}
