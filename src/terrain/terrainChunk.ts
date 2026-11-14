import { GALE_SITE } from "../core/constants";
import { tileToQuadkey, type SpatialChunkData } from "../core/spatialStore";
import { MINERAL_CLASS_COUNT, type TerrainGrid, type TerrainProvenance } from "./terrainTypes";

export const geographicQuadkey = (latitudeDeg: number, longitudeDeg: number, zoom: number): string => {
  if (latitudeDeg < -90 || latitudeDeg > 90 || longitudeDeg < -180 || longitudeDeg > 180) {
    throw new RangeError("latitude or longitude is outside the planetary range");
  }
  const tilesPerAxis = 2 ** zoom;
  const tileX = Math.min(tilesPerAxis - 1, Math.floor(((longitudeDeg + 180) / 360) * tilesPerAxis));
  const tileY = Math.min(tilesPerAxis - 1, Math.floor(((90 - latitudeDeg) / 180) * tilesPerAxis));
  return tileToQuadkey(tileX, tileY, zoom);
};

export const GALE_SECTOR_QUADKEY = geographicQuadkey(GALE_SITE.latitudeDeg, GALE_SITE.longitudeDeg, 12);

export const terrainToChunk = (quadkey: string, grid: TerrainGrid): SpatialChunkData => ({
  quadkey,
  width: grid.width,
  height: grid.height,
  elevationM: grid.elevationM,
  hazardClass: grid.mineralClass
});

export const chunkToTerrain = (
  chunk: SpatialChunkData,
  cellSizeM: number,
  provenance: TerrainProvenance
): TerrainGrid => {
  for (let index = 0; index < chunk.hazardClass.length; index += 1) {
    if ((chunk.hazardClass[index] ?? 0) >= MINERAL_CLASS_COUNT) {
      throw new RangeError(`Mineral class out of range at cell ${index}`);
    }
  }
  return {
    provenance,
    width: chunk.width,
    height: chunk.height,
    cellSizeM,
    elevationM: chunk.elevationM,
    mineralClass: chunk.hazardClass
  };
};
