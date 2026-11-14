import { WAL_CAPACITY_PACKETS } from "./constants";

export interface TelemetrySample {
  readonly timestampMs: number;
  readonly primaryOxygenMPa: number;
  readonly secondaryOxygenMPa: number;
  readonly co2ScrubberPercent: number;
  readonly lcvgWaterKg: number;
  readonly batteryWh: number;
  readonly metabolicWatts: number;
  readonly radiationMicroSvPerHr: number;
  readonly cumulativeDoseMSv: number;
  readonly eastM: number;
  readonly northM: number;
  readonly elevationM: number;
}

export interface TelemetryPacket extends TelemetrySample {
  readonly sequence: number;
}

export interface WalCursors {
  readonly nextSequence: number;
  readonly acknowledgedSequence: number;
}

export interface CursorStore {
  load(): WalCursors | null;
  save(cursors: WalCursors): void;
}

export type RelaySender = (batch: ReadonlyArray<TelemetryPacket>) => boolean;

export interface FlushResult {
  readonly sentPackets: number;
  readonly remainingPackets: number;
}

export interface TelemetryWalOptions {
  readonly capacity?: number;
  readonly cursorStore?: CursorStore;
}

const isValidCursors = (value: unknown): value is WalCursors => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const next = candidate["nextSequence"];
  const acknowledged = candidate["acknowledgedSequence"];
  return (
    typeof next === "number" &&
    typeof acknowledged === "number" &&
    Number.isInteger(next) &&
    Number.isInteger(acknowledged) &&
    acknowledged >= 0 &&
    next >= acknowledged
  );
};

export const createMemoryCursorStore = (initial: WalCursors | null = null): CursorStore => {
  let current = initial;
  return {
    load: () => current,
    save: (cursors) => {
      current = cursors;
    }
  };
};

export const createBrowserCursorStore = (storageKey: string): CursorStore => {
  const fallback = createMemoryCursorStore();
  return {
    load: () => {
      try {
        const raw = globalThis.localStorage.getItem(storageKey);
        if (raw === null) {
          return fallback.load();
        }
        const parsed: unknown = JSON.parse(raw);
        return isValidCursors(parsed) ? parsed : null;
      } catch {
        return fallback.load();
      }
    },
    save: (cursors) => {
      fallback.save(cursors);
      try {
        globalThis.localStorage.setItem(storageKey, JSON.stringify(cursors));
      } catch {
        return;
      }
    }
  };
};

export class TelemetryWAL {
  private readonly slots: Array<TelemetryPacket | undefined>;
  private readonly cursorStore: CursorStore;
  private readonly slotCount: number;
  private appended = 0;
  private head: number;
  private acknowledged: number;
  private evictedUnsent = 0;

  constructor(options: TelemetryWalOptions = {}) {
    const capacity = options.capacity ?? WAL_CAPACITY_PACKETS;
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.slotCount = capacity;
    this.slots = new Array<TelemetryPacket | undefined>(capacity).fill(undefined);
    this.cursorStore = options.cursorStore ?? createMemoryCursorStore();
    const restored = this.cursorStore.load();
    this.head = restored?.nextSequence ?? 0;
    this.acknowledged = restored?.acknowledgedSequence ?? 0;
  }

  get capacity(): number {
    return this.slotCount;
  }

  get nextSequence(): number {
    return this.head;
  }

  get acknowledgedSequence(): number {
    return this.acknowledged;
  }

  get retainedCount(): number {
    return Math.min(this.appended, this.slotCount);
  }

  get oldestRetainedSequence(): number {
    return this.head - this.retainedCount;
  }

  get lostPacketCount(): number {
    return Math.max(0, this.oldestRetainedSequence - this.acknowledged);
  }

  get totalEvictedUnsent(): number {
    return this.evictedUnsent + this.lostPacketCount;
  }

  get pendingCount(): number {
    return this.head - Math.max(this.acknowledged, this.oldestRetainedSequence);
  }

  append(sample: TelemetrySample): TelemetryPacket {
    const packet: TelemetryPacket = { ...sample, sequence: this.head };
    this.slots[this.head % this.slotCount] = packet;
    this.head += 1;
    this.appended += 1;
    this.persistCursors();
    return packet;
  }

  retained(): ReadonlyArray<TelemetryPacket> {
    return this.collect(this.oldestRetainedSequence, Number.POSITIVE_INFINITY);
  }

  pending(maxPackets: number = Number.POSITIVE_INFINITY): ReadonlyArray<TelemetryPacket> {
    return this.collect(Math.max(this.acknowledged, this.oldestRetainedSequence), maxPackets);
  }

  acknowledgeThrough(sequence: number): void {
    if (!Number.isInteger(sequence) || sequence < 0 || sequence >= this.head) {
      throw new RangeError("sequence must be an appended packet sequence");
    }
    const nextAcknowledged = sequence + 1;
    if (nextAcknowledged <= this.acknowledged) {
      return;
    }
    this.evictedUnsent += this.lostPacketCount;
    this.acknowledged = nextAcknowledged;
    this.persistCursors();
  }

  flushToRelay(send: RelaySender, batchSize: number): FlushResult {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new RangeError("batchSize must be a positive integer");
    }
    let sentPackets = 0;
    for (;;) {
      const batch = this.pending(batchSize);
      const last = batch[batch.length - 1];
      if (last === undefined || !send(batch)) {
        break;
      }
      this.acknowledgeThrough(last.sequence);
      sentPackets += batch.length;
    }
    return { sentPackets, remainingPackets: this.pendingCount };
  }

  private collect(startSequence: number, maxPackets: number): ReadonlyArray<TelemetryPacket> {
    const packets: TelemetryPacket[] = [];
    for (
      let sequence = startSequence;
      sequence < this.head && packets.length < maxPackets;
      sequence += 1
    ) {
      const packet = this.slots[sequence % this.slotCount];
      if (packet !== undefined && packet.sequence === sequence) {
        packets.push(packet);
      }
    }
    return packets;
  }

  private persistCursors(): void {
    this.cursorStore.save({
      nextSequence: this.head,
      acknowledgedSequence: this.acknowledged
    });
  }
}
