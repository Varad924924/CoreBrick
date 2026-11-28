
export type PlotUnit = "ft" | "m";
export type PlotShape = "rectangle" | "square" | "irregular";
export type PlotFacing = "North" | "South" | "East" | "West" | "North-East" | "North-West" | "South-East" | "South-West";
export type HomeConfiguration = "1 BHK" | "2 BHK" | "3 BHK" | "4 BHK" | "5+ BHK";

export interface HomeDesignRequirements {
  plotShape: PlotShape;
  plotLength: string;
  plotWidth: string;
  unit: PlotUnit;
  facing: PlotFacing;
  budget: string;
  floors: string;
  configuration: HomeConfiguration;
  parking: boolean;
  vastuPreference: boolean;
  additionalRequirements: string;
}
