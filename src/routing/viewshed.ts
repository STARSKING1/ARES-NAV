import type { GridCell, TerrainGrid } from "../terrain/terrainTypes";

export interface ViewshedOptions {
  readonly mastHeightM?: number;
  readonly receiverHeightM?: number;
}

export const computeRadioViewshed = (
  grid: TerrainGrid,
  antennaCell: GridCell,
  options: ViewshedOptions = {}
): Uint8Array => {
  const { width, height, elevationM } = grid;
  const mastHeightM = options.mastHeightM ?? 5.0;
  const receiverHeightM = options.receiverHeightM ?? 2.0;
  const viewshed = new Uint8Array(width * height);
  const antennaIndex = antennaCell.row * width + antennaCell.column;
  const antennaElevation = (elevationM[antennaIndex] ?? 0) + mastHeightM;

  viewshed[antennaIndex] = 1;

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (row === antennaCell.row && column === antennaCell.column) {
        continue;
      }
      const targetIndex = row * width + column;
      const targetElevation = (elevationM[targetIndex] ?? 0) + receiverHeightM;
      const deltaColumn = column - antennaCell.column;
      const deltaRow = row - antennaCell.row;
      const stepCount = Math.max(Math.abs(deltaColumn), Math.abs(deltaRow));
      let isVisible = 1;

      for (let step = 1; step < stepCount; step += 1) {
        const sampleColumn = Math.round(antennaCell.column + (deltaColumn * step) / stepCount);
        const sampleRow = Math.round(antennaCell.row + (deltaRow * step) / stepCount);
        const sampleIndex = sampleRow * width + sampleColumn;
        const fraction = step / stepCount;
        const lineOfSightElevation = antennaElevation + (targetElevation - antennaElevation) * fraction;
        const groundElevation = elevationM[sampleIndex] ?? 0;

        if (groundElevation > lineOfSightElevation) {
          isVisible = 0;
          break;
        }
      }
      viewshed[targetIndex] = isVisible;
    }
  }

  return viewshed;
};
