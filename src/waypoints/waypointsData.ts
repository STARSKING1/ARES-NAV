import type { GridCell } from "../terrain/terrainTypes";

export interface Waypoint {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly cell: GridCell;
  readonly eastM: number;
  readonly northM: number;
  readonly priority: "CRITICAL" | "HIGH" | "MEDIUM" | "EMERGENCY";
  readonly targetType: "HABITAT" | "SCIENCE_SULFATE" | "SCIENCE_CLAY" | "GEOLOGY_CONTACT" | "SHELTER";
  readonly crismSignature: string;
  readonly scientificObjective: string;
  readonly surfaceHazards: ReadonlyArray<string>;
  readonly mastcamPovTitle: string;
  readonly mastcamSol: number;
  readonly mastcamInstrument: "MASTCAM-100" | "MASTCAM-34" | "NAVCAM";
  readonly povDescription: string;
}

export const GALE_WAYPOINTS: ReadonlyArray<Waypoint> = [
  {
    id: "wp-hab",
    code: "HAB-00",
    name: "ARES Base Habitat & UHF Relay",
    cell: { column: 15, row: 15 },
    eastM: 150,
    northM: 850,
    priority: "CRITICAL",
    targetType: "HABITAT",
    crismSignature: "Basaltic regolith / dust veneer",
    scientificObjective: "Primary EVA staging airlock, UHF 437 MHz antenna mast (+5m), rover charging dock.",
    surfaceHazards: ["Airlock umbilical perimeter", "Regolith kick-up dust zone"],
    mastcamPovTitle: "Curiosity Navcam Lookback - Habitat Landing Pad",
    mastcamSol: 3942,
    mastcamInstrument: "NAVCAM",
    povDescription: "Flat planar bedrock pad with distant scarp horizon, clear 360-degree antenna line-of-sight."
  },
  {
    id: "wp-boxwork-alpha",
    code: "SCI-01",
    name: "Boxwork Ridge Alpha (Fracture Veins)",
    cell: { column: 48, row: 42 },
    eastM: 480,
    northM: 580,
    priority: "HIGH",
    targetType: "SCIENCE_SULFATE",
    crismSignature: "Polyhydrated magnesium/calcium sulfates (2.4 μm absorption band)",
    scientificObjective: "Sample prominent 1.2m vertical boxwork fracture blades formed by late-stage groundwater cementation.",
    surfaceHazards: ["Narrow knife-edge ridge traverse", "18-20 deg flank slopes", "Boot-snag fracture gaps"],
    mastcamPovTitle: "Curiosity Mastcam-100 Boxwork Blade Mosaic",
    mastcamSol: 4120,
    mastcamInstrument: "MASTCAM-100",
    povDescription: "Reticulated grid of resistant mineral veins standing 1.5 meters above deflated bedrock surface."
  },
  {
    id: "wp-gediz-margin",
    code: "SCI-02",
    name: "Gediz Vallis Debris Flow Margin",
    cell: { column: 72, row: 65 },
    eastM: 720,
    northM: 350,
    priority: "HIGH",
    targetType: "GEOLOGY_CONTACT",
    crismSignature: "Mixed pyroxene, olivine, perched hydrated sulfates",
    scientificObjective: "Investigate unsorted boulder levee deposited by catastrophic wet debris flow down Mount Sharp flank.",
    surfaceHazards: ["Meter-scale boulder fields", "Loose slope talus", "Shadowed footing traps"],
    mastcamPovTitle: "Curiosity Mastcam-34 Gediz Vallis Boulder Ridge",
    mastcamSol: 4235,
    mastcamInstrument: "MASTCAM-34",
    povDescription: "Steep channel bank littered with dark angular boulders transported from upper Mount Sharp stratigraphy."
  },
  {
    id: "wp-clay-delta",
    code: "SCI-03",
    name: "Clay Flats Delta (Glen Torridon Trough)",
    cell: { column: 28, row: 70 },
    eastM: 280,
    northM: 300,
    priority: "MEDIUM",
    targetType: "SCIENCE_CLAY",
    crismSignature: "Fe/Mg-smectite phyllosilicates (1.9 μm and 2.3 μm doublet)",
    scientificObjective: "Extract core sample of ancient lacustrine mudstones deposited during Gale Crater lake highstand.",
    surfaceHazards: ["Localized soft aeolian dust mantling", "Low thermal inertia (100 TIU)"],
    mastcamPovTitle: "Curiosity Mastcam-100 Laminated Mudstone Slabs",
    mastcamSol: 3780,
    mastcamInstrument: "MASTCAM-100",
    povDescription: "Finely laminated reddish-gray mudstone plates exhibiting gentle ripples and desiccation polygon casts."
  },
  {
    id: "wp-canyon-shelter",
    code: "EMRG-S1",
    name: "Gediz Scarp Overhang (SEP Shelter)",
    cell: { column: 71, row: 32 },
    eastM: 710,
    northM: 680,
    priority: "EMERGENCY",
    targetType: "SHELTER",
    crismSignature: "Massive cemented sandstone caprock",
    scientificObjective: "Primary emergency radiation redoubt providing >60% sky-view blockage during Solar Energetic Particle events.",
    surfaceHazards: ["Overhanging cliff face", "Rockfall debris skirt"],
    mastcamPovTitle: "Curiosity Navcam Cliff Face & Alcove Shelter",
    mastcamSol: 4188,
    mastcamInstrument: "NAVCAM",
    povDescription: "Deep recess at base of 20-meter vertical scarp with overhanging sandstone ledge, solid basalt footing."
  }
];
