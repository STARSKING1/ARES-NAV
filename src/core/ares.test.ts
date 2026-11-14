import { describe, expect, it } from "vitest";
import {
  EARTH_GRAVITY_MS2,
  MARS_GRAVITY_MS2,
  PNR_CRITICAL_FRACTION,
  WAL_CAPACITY_PACKETS
} from "./constants";
import {
  DEFAULT_CREW_PROFILE,
  assessReturnPath,
  metabolicRateWatts,
  routeSegmentsFromPath,
  type CrewProfile,
  type RouteSegment,
  type SuitReserves
} from "./pnrCalculator";
import {
  SpatialStore,
  createMemoryBackend,
  digestChunk,
  merkleRoot,
  sha256Hex,
  tileToQuadkey,
  type SpatialChunkData
} from "./spatialStore";
import {
  TelemetryWAL,
  createMemoryCursorStore,
  type TelemetryPacket,
  type TelemetrySample
} from "./telemetryWAL";

const referenceCrew: CrewProfile = {
  bodyMassKg: 80,
  loadMassKg: 40,
  walkingSpeedMs: 1,
  terrainFactor: 1
};

const returnRoute: ReadonlyArray<RouteSegment> = [
  { distanceM: 400, gradePercent: 8 },
  { distanceM: 600, gradePercent: -4 },
  { distanceM: 300, gradePercent: 12 }
];

const abundantReserves: SuitReserves = {
  oxygenRemainingKg: 1_000_000,
  batteryRemainingWh: 1_000_000_000,
  batteryDrawWatts: 150
};

describe("Pandolf-Santee metabolic rate", () => {
  it("reproduces the Pandolf level-walking value at Earth gravity", () => {
    expect(metabolicRateWatts(referenceCrew, 0, EARTH_GRAVITY_MS2)).toBeCloseTo(360, 6);
  });

  it("applies the Santee downhill correction at a ten percent descent", () => {
    expect(metabolicRateWatts(referenceCrew, -10, EARTH_GRAVITY_MS2)).toBeCloseTo(282.857, 2);
  });

  it("raises cost with ascent and lowers it on moderate descent", () => {
    const rate = (grade: number): number => metabolicRateWatts(referenceCrew, grade);
    expect(rate(20)).toBeGreaterThan(rate(10));
    expect(rate(10)).toBeGreaterThan(rate(0));
    expect(rate(0)).toBeGreaterThan(rate(-10));
  });

  it("holds the Santee correction at its validity limit for steeper descents", () => {
    expect(metabolicRateWatts(referenceCrew, -35, EARTH_GRAVITY_MS2)).toBeCloseTo(
      metabolicRateWatts(referenceCrew, -20, EARTH_GRAVITY_MS2),
      9
    );
  });

  it("scales locomotion cost by the Martian to Earth gravity ratio", () => {
    const standing = 1.5 * referenceCrew.bodyMassKg;
    const expected = standing + (MARS_GRAVITY_MS2 / EARTH_GRAVITY_MS2) * (360 - standing);
    expect(metabolicRateWatts(referenceCrew, 0)).toBeCloseTo(expected, 6);
  });

  it("never drops below the standing metabolic rate", () => {
    expect(metabolicRateWatts(referenceCrew, -20)).toBeGreaterThanOrEqual(120);
  });

  it("rejects non-physical crew parameters", () => {
    expect(() => metabolicRateWatts({ ...referenceCrew, bodyMassKg: 0 }, 0)).toThrow();
    expect(() => metabolicRateWatts({ ...referenceCrew, walkingSpeedMs: -1 }, 0)).toThrow();
    expect(() => metabolicRateWatts(referenceCrew, Number.NaN)).toThrow();
  });

  it("derives segment grades from three-dimensional path points", () => {
    const segments = routeSegmentsFromPath([
      { eastM: 0, northM: 0, elevationM: 0 },
      { eastM: 30, northM: 40, elevationM: 5 },
      { eastM: 30, northM: 40, elevationM: 9 }
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.distanceM).toBeCloseTo(50, 9);
    expect(segments[0]?.gradePercent).toBeCloseTo(10, 9);
  });
});

describe("Point-of-No-Return calculator", () => {
  const baseline = assessReturnPath(returnRoute, DEFAULT_CREW_PROFILE, abundantReserves);

  it("costs more oxygen to climb back than to walk the same distance level", () => {
    const level = assessReturnPath(
      [{ distanceM: 1300, gradePercent: 0 }],
      DEFAULT_CREW_PROFILE,
      abundantReserves
    );
    const climb = assessReturnPath(
      [{ distanceM: 1300, gradePercent: 10 }],
      DEFAULT_CREW_PROFILE,
      abundantReserves
    );
    expect(climb.returnOxygenKg).toBeGreaterThan(level.returnOxygenKg);
  });

  it("reports nominal status with generous reserves", () => {
    expect(baseline.status).toBe("NOMINAL");
  });

  it("triggers CRITICAL_WALKBACK when return oxygen exceeds 85 percent of reserves", () => {
    const critical = assessReturnPath(returnRoute, DEFAULT_CREW_PROFILE, {
      ...abundantReserves,
      oxygenRemainingKg: baseline.returnOxygenKg / 0.86
    });
    expect(critical.oxygenDemandFraction).toBeGreaterThan(PNR_CRITICAL_FRACTION);
    expect(critical.status).toBe("CRITICAL_WALKBACK");
  });

  it("stays below critical when return oxygen is under 85 percent of reserves", () => {
    const caution = assessReturnPath(returnRoute, DEFAULT_CREW_PROFILE, {
      ...abundantReserves,
      oxygenRemainingKg: baseline.returnOxygenKg / 0.84
    });
    expect(caution.status).toBe("CAUTION");
  });

  it("triggers CRITICAL_WALKBACK on battery demand alone", () => {
    const critical = assessReturnPath(returnRoute, DEFAULT_CREW_PROFILE, {
      ...abundantReserves,
      batteryRemainingWh: baseline.returnBatteryWh / 0.9
    });
    expect(critical.oxygenDemandFraction).toBeLessThan(0.01);
    expect(critical.status).toBe("CRITICAL_WALKBACK");
  });

  it("treats exhausted reserves as critical", () => {
    const exhausted = assessReturnPath(returnRoute, DEFAULT_CREW_PROFILE, {
      ...abundantReserves,
      oxygenRemainingKg: 0
    });
    expect(exhausted.status).toBe("CRITICAL_WALKBACK");
    expect(exhausted.oxygenDemandFraction).toBe(Number.POSITIVE_INFINITY);
  });

  it("rejects negative segment distances", () => {
    expect(() =>
      assessReturnPath([{ distanceM: -1, gradePercent: 0 }], DEFAULT_CREW_PROFILE, abundantReserves)
    ).toThrow();
  });
});

const buildSample = (index: number): TelemetrySample => ({
  timestampMs: index * 1000,
  primaryOxygenMPa: 20 - index * 0.0001,
  secondaryOxygenMPa: 6,
  co2ScrubberPercent: 100 - index * 0.001,
  lcvgWaterKg: 4.5,
  batteryWh: 500 - index * 0.01,
  metabolicWatts: 210,
  radiationMicroSvPerHr: 26.7,
  cumulativeDoseMSv: index * 0.0000074,
  eastM: index,
  northM: 0,
  elevationM: -4482
});

const fillWal = (wal: TelemetryWAL, packetCount: number): void => {
  for (let index = 0; index < packetCount; index += 1) {
    wal.append(buildSample(index));
  }
};

const sequences = (packets: ReadonlyArray<TelemetryPacket>): number[] =>
  packets.map((packet) => packet.sequence);

describe("Telemetry write-ahead log", () => {
  it("defaults to four hours of one hertz telemetry", () => {
    expect(new TelemetryWAL().capacity).toBe(WAL_CAPACITY_PACKETS);
    expect(WAL_CAPACITY_PACKETS).toBe(14400);
  });

  it("overwrites the oldest packet once the ring buffer is full", () => {
    const wal = new TelemetryWAL();
    fillWal(wal, WAL_CAPACITY_PACKETS + 1);
    const retained = wal.retained();
    expect(wal.retainedCount).toBe(WAL_CAPACITY_PACKETS);
    expect(retained).toHaveLength(WAL_CAPACITY_PACKETS);
    expect(retained[0]?.sequence).toBe(1);
    expect(retained[retained.length - 1]?.sequence).toBe(WAL_CAPACITY_PACKETS);
  });

  it("flushes every pending packet in order through the relay burst", () => {
    const wal = new TelemetryWAL({ capacity: 10 });
    fillWal(wal, 5);
    const batches: number[][] = [];
    const result = wal.flushToRelay((batch) => {
      batches.push(sequences(batch));
      return true;
    }, 2);
    expect(batches).toEqual([[0, 1], [2, 3], [4]]);
    expect(result).toEqual({ sentPackets: 5, remainingPackets: 0 });
    expect(wal.acknowledgedSequence).toBe(5);
  });

  it("keeps unsent packets queued when the relay link drops mid-burst", () => {
    const wal = new TelemetryWAL({ capacity: 10 });
    fillWal(wal, 5);
    let calls = 0;
    const result = wal.flushToRelay(() => {
      calls += 1;
      return calls === 1;
    }, 2);
    expect(result).toEqual({ sentPackets: 2, remainingPackets: 3 });
    expect(sequences(wal.pending())).toEqual([2, 3, 4]);
  });

  it("reports packets evicted before the relay acknowledged them", () => {
    const wal = new TelemetryWAL({ capacity: 4 });
    fillWal(wal, 10);
    expect(wal.lostPacketCount).toBe(6);
    expect(wal.pendingCount).toBe(4);
    expect(sequences(wal.pending())).toEqual([6, 7, 8, 9]);
    wal.flushToRelay(() => true, 4);
    expect(wal.lostPacketCount).toBe(0);
    expect(wal.totalEvictedUnsent).toBe(6);
  });

  it("restores sequence and acknowledgement cursors after a restart", () => {
    const cursorStore = createMemoryCursorStore();
    const first = new TelemetryWAL({ capacity: 20, cursorStore });
    fillWal(first, 10);
    first.acknowledgeThrough(3);
    const second = new TelemetryWAL({ capacity: 20, cursorStore });
    expect(second.nextSequence).toBe(10);
    expect(second.acknowledgedSequence).toBe(4);
    expect(second.lostPacketCount).toBe(6);
    const resumed = second.append(buildSample(10));
    expect(resumed.sequence).toBe(10);
  });

  it("rejects acknowledgement of a packet that was never appended", () => {
    const wal = new TelemetryWAL({ capacity: 4 });
    fillWal(wal, 2);
    expect(() => wal.acknowledgeThrough(2)).toThrow();
  });
});

const buildChunk = (quadkey: string, seed: number): SpatialChunkData => {
  const width = 8;
  const height = 8;
  return {
    quadkey,
    width,
    height,
    elevationM: new Float32Array(width * height).map((_, index) => -4482 + ((index * 7 + seed) % 31) * 0.25),
    hazardClass: new Uint8Array(width * height).map((_, index) => (index + seed) % 4)
  };
};

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("Spatial chunk store and Merkle manifest", () => {
  it("matches the published SHA-256 test vector", async () => {
    expect(await sha256Hex(encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("encodes tile coordinates as a Bing-style quadkey", () => {
    expect(tileToQuadkey(3, 5, 3)).toBe("213");
    expect(() => tileToQuadkey(8, 0, 3)).toThrow();
  });

  it("verifies an untouched chunk", async () => {
    const store = new SpatialStore({ backend: createMemoryBackend() });
    const stored = await store.ingest(buildChunk("1203", 1));
    const result = await store.load("1203");
    expect(result.status).toBe("VERIFIED");
    expect(result.chunk?.digestHex).toBe(stored.digestHex);
  });

  it("reports a missing chunk without throwing", async () => {
    const store = new SpatialStore({ backend: createMemoryBackend() });
    expect((await store.load("0000")).status).toBe("MISSING");
  });

  it("detects a single-bit upset and quarantines the corrupted chunk", async () => {
    const store = new SpatialStore({ backend: createMemoryBackend() });
    await store.ingest(buildChunk("1203", 1));
    expect(await store.injectSingleEventUpset("1203", 37)).toBe(true);
    const result = await store.load("1203");
    expect(result.status).toBe("UNRECOVERABLE");
    expect(result.chunk).toBeNull();
    expect(result.observedDigestHex).not.toBe(result.expectedDigestHex);
    expect(await store.quarantinedQuadkeys()).toEqual(["1203"]);
    expect((await store.load("1203")).status).toBe("MISSING");
  });

  it("recovers a corrupted chunk from the pristine offline pack", async () => {
    const pristine = buildChunk("1203", 1);
    const store = new SpatialStore({
      backend: createMemoryBackend(),
      pristineSource: async (quadkey) => (quadkey === "1203" ? pristine : undefined)
    });
    const original = await store.ingest(pristine);
    await store.injectSingleEventUpset("1203", 100);
    const recovered = await store.load("1203");
    expect(recovered.status).toBe("RECOVERED");
    expect(recovered.chunk?.digestHex).toBe(original.digestHex);
    expect(await digestChunk(recovered.chunk ?? pristine)).toBe(original.digestHex);
    expect((await store.load("1203")).status).toBe("VERIFIED");
    expect(await store.quarantinedQuadkeys()).toEqual(["1203"]);
  });

  it("refuses a fallback chunk whose digest does not match the manifest", async () => {
    const tampered = buildChunk("1203", 2);
    const store = new SpatialStore({
      backend: createMemoryBackend(),
      pristineSource: async () => tampered
    });
    await store.ingest(buildChunk("1203", 1));
    await store.injectSingleEventUpset("1203", 5);
    expect((await store.load("1203")).status).toBe("UNRECOVERABLE");
  });

  it("returns false when injecting an upset into a chunk that does not exist", async () => {
    const store = new SpatialStore({ backend: createMemoryBackend() });
    expect(await store.injectSingleEventUpset("3333")).toBe(false);
  });

  it("produces an insertion-order independent Merkle root that changes with any chunk", async () => {
    const forward = new SpatialStore({ backend: createMemoryBackend() });
    const reverse = new SpatialStore({ backend: createMemoryBackend() });
    const keys = ["0123", "1203", "2310"];
    for (const [index, key] of keys.entries()) {
      await forward.ingest(buildChunk(key, index));
    }
    for (const [index, key] of [...keys.entries()].reverse().map(([i, k]) => [i, k] as const)) {
      await reverse.ingest(buildChunk(key, index));
    }
    const rootForward = await forward.manifestRoot();
    expect(rootForward).toBe(await reverse.manifestRoot());
    await forward.ingest(buildChunk("1203", 99));
    expect(await forward.manifestRoot()).not.toBe(rootForward);
  });

  it("builds a deterministic Merkle root from leaf digests", async () => {
    const leaves = [await sha256Hex(encode("a")), await sha256Hex(encode("b")), await sha256Hex(encode("c"))];
    expect(await merkleRoot(leaves)).toBe(await merkleRoot([...leaves]));
    expect(await merkleRoot(leaves)).not.toBe(await merkleRoot([...leaves].reverse()));
  });
});
