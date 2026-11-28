import type { PlotUnit } from "../types/design.types";

export function calculatePlotArea(length: string, width: string, unit: PlotUnit): number | null {
  const l = Number(length);
  const w = Number(width);
  if (!Number.isFinite(l) || !Number.isFinite(w) || l <= 0 || w <= 0) return null;
  const area = l * w;
  return unit === "m" ? area * 10.7639 : area;
}

export function formatArea(areaSqFt: number | null): string {
  if (areaSqFt === null) return "Enter valid dimensions";
  return `${areaSqFt.toLocaleString("en-IN", { maximumFractionDigits: 1 })} sq. ft.`;
}

