const RIB_LAYER = "BAY_RIBS";
const NODE_LAYER = "BAY_NODES";

export interface BayPlanDxfNode {
  x: number;
  y: number;
  label?: string | null;
  id?: string | number | null;
  bossId?: string | number | null;
}

export interface BayPlanDxfEdge {
  a: number;
  b: number;
}

export interface BayPlanDxfInput {
  nodes: BayPlanDxfNode[];
  edges: BayPlanDxfEdge[];
}

interface SaveFileHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface WindowWithSavePicker extends Window {
  showSaveFilePicker?: (options: unknown) => Promise<SaveFileHandle>;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.abs(value) < 0.000000001 ? 0 : value;
  return rounded.toFixed(6).replace(/\.?0+$/, "");
}

function layerRecord(handle: number, name: string, colour: number): string[] {
  return [
    "0",
    "LAYER",
    "5",
    handle.toString(16).toUpperCase(),
    "2",
    name,
    "70",
    "0",
    "62",
    String(colour),
    "6",
    "CONTINUOUS",
  ];
}

function lineEntity(handle: number, x1: number, y1: number, x2: number, y2: number): string[] {
  return [
    "0",
    "LINE",
    "5",
    handle.toString(16).toUpperCase(),
    "8",
    RIB_LAYER,
    "10",
    formatNumber(x1),
    "20",
    formatNumber(y1),
    "30",
    "0",
    "11",
    formatNumber(x2),
    "21",
    formatNumber(y2),
    "31",
    "0",
  ];
}

function circleEntity(handle: number, x: number, y: number, radius: number): string[] {
  return [
    "0",
    "CIRCLE",
    "5",
    handle.toString(16).toUpperCase(),
    "8",
    NODE_LAYER,
    "10",
    formatNumber(x),
    "20",
    formatNumber(y),
    "30",
    "0",
    "40",
    formatNumber(radius),
  ];
}

export function buildBayPlanDxf(result: BayPlanDxfInput): { text: string; ribCount: number; nodeCount: number } {
  const entities: string[] = [];
  let handle = 0x50;
  let ribCount = 0;

  for (const edge of result.edges || []) {
    const start = result.nodes?.[edge.a];
    const end = result.nodes?.[edge.b];
    if (!start || !end) continue;
    entities.push(...lineEntity(handle, start.x, start.y, end.x, end.y));
    handle += 1;
    ribCount += 1;
  }

  if (ribCount === 0) {
    throw new Error("No valid bay-plan ribs found to export.");
  }

  let nodeCount = 0;
  const nodeRadius = 4;
  for (const node of result.nodes || []) {
    entities.push(...circleEntity(handle, node.x, node.y, nodeRadius));
    handle += 1;
    nodeCount += 1;
  }

  const text = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1009",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "TABLES",
    "0",
    "TABLE",
    "2",
    "LAYER",
    "70",
    "2",
    ...layerRecord(0xA, RIB_LAYER, 5),
    ...layerRecord(0xB, NODE_LAYER, 3),
    "0",
    "ENDTAB",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "BLOCKS",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ...entities,
    "0",
    "ENDSEC",
    "0",
    "EOF",
  ].join("\r\n") + "\r\n";

  return { text, ribCount, nodeCount };
}

export async function downloadBayPlanDxf(text: string, filename: string): Promise<boolean> {
  const blob = new Blob([text], { type: "application/dxf;charset=utf-8" });
  const savePicker = (window as WindowWithSavePicker).showSaveFilePicker;
  if (typeof savePicker === "function") {
    try {
      const handle = await savePicker({
        suggestedName: filename,
        types: [
          {
            description: "DXF file",
            accept: { "application/dxf": [".dxf"], "application/octet-stream": [".dxf"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
