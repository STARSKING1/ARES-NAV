import { describe, expect, it } from "vitest";
import {
  EVA_DURATION_HOURS,
  GALE_SITE,
  MARS_GRAVITY_MS2,
  PNR_CRITICAL_FRACTION,
  SLOPE_ABORT_DEG,
  WAL_CAPACITY_PACKETS
} from "./constants";

describe("mission constants", () => {
  it("uses Martian surface gravity", () => {
    expect(MARS_GRAVITY_MS2).toBe(3.721);
  });

  it("sizes the telemetry log for a four hour EVA at 1 Hz", () => {
    expect(EVA_DURATION_HOURS).toBe(4);
    expect(WAL_CAPACITY_PACKETS).toBe(14400);
  });

  it("places the site in Gale Crater", () => {
    expect(GALE_SITE.latitudeDeg).toBeCloseTo(-4.618, 3);
    expect(GALE_SITE.longitudeDeg).toBeCloseTo(137.402, 3);
    expect(GALE_SITE.datumElevationM).toBe(-4482);
  });

  it("applies the 85 percent walk-back threshold and 20 degree caution threshold", () => {
    expect(PNR_CRITICAL_FRACTION).toBe(0.85);
    expect(SLOPE_ABORT_DEG).toBe(20);
  });
});
