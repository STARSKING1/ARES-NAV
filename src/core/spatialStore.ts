export interface SpatialChunkData {
  readonly quadkey: string;
  readonly width: number;
  readonly height: number;
  readonly elevationM: Float32Array;
  readonly hazardClass: Uint8Array;
}

export interface StoredChunk extends SpatialChunkData {
  readonly digestHex: string;
}

export type LoadStatus = "VERIFIED" | "RECOVERED" | "UNRECOVERABLE" | "MISSING";

export interface LoadResult {
  readonly status: LoadStatus;
  readonly chunk: StoredChunk | null;
  readonly expectedDigestHex: string | null;
  readonly observedDigestHex: string | null;
}

export interface ChunkBackend {
  put(chunk: StoredChunk): Promise<void>;
  get(quadkey: string): Promise<StoredChunk | undefined>;
  quarantine(quadkey: string): Promise<void>;
  listChunkKeys(): Promise<string[]>;
  listQuarantinedKeys(): Promise<string[]>;
}

export type PristineSource = (quadkey: string) => Promise<SpatialChunkData | undefined>;

export type BackendKind = "INDEXEDDB" | "MEMORY";

export interface SpatialStoreOptions {
  readonly backend: ChunkBackend;
  readonly pristineSource?: PristineSource;
  readonly trustedManifest?: ReadonlyMap<string, string>;
}

const DATABASE_NAME = "ares_nav_spatial_db";
const DATABASE_VERSION = 1;
const CHUNK_STORE = "chunks";
const QUARANTINE_STORE = "quarantine";

const textEncoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));

export const tileToQuadkey = (tileX: number, tileY: number, zoom: number): string => {
  if (!Number.isInteger(zoom) || zoom < 1 || zoom > 30) {
    throw new RangeError("zoom must be an integer between 1 and 30");
  }
  const tilesPerAxis = 2 ** zoom;
  if (
    !Number.isInteger(tileX) ||
    !Number.isInteger(tileY) ||
    tileX < 0 ||
    tileY < 0 ||
    tileX >= tilesPerAxis ||
    tileY >= tilesPerAxis
  ) {
    throw new RangeError("tile coordinates are outside the zoom level grid");
  }
  let quadkey = "";
  for (let level = zoom; level > 0; level -= 1) {
    const mask = 1 << (level - 1);
    const digit = (tileX & mask ? 1 : 0) + (tileY & mask ? 2 : 0);
    quadkey += String(digit);
  }
  return quadkey;
};

const isQuadkey = (value: string): boolean => /^[0-3]+$/.test(value);

const validateChunk = (chunk: SpatialChunkData): void => {
  if (!isQuadkey(chunk.quadkey)) {
    throw new RangeError("quadkey must contain only digits 0 to 3");
  }
  if (!Number.isInteger(chunk.width) || !Number.isInteger(chunk.height) || chunk.width < 1 || chunk.height < 1) {
    throw new RangeError("width and height must be positive integers");
  }
  const cellCount = chunk.width * chunk.height;
  if (chunk.elevationM.length !== cellCount || chunk.hazardClass.length !== cellCount) {
    throw new RangeError("elevation and hazard grids must contain width x height cells");
  }
};

const canonicalBytes = (chunk: SpatialChunkData): Uint8Array => {
  const key = textEncoder.encode(chunk.quadkey);
  const header = new Uint8Array(key.length + 9);
  header.set(key, 0);
  const view = new DataView(header.buffer);
  view.setUint32(key.length + 1, chunk.width, true);
  view.setUint32(key.length + 5, chunk.height, true);
  const elevationBytes = new Uint8Array(
    chunk.elevationM.buffer,
    chunk.elevationM.byteOffset,
    chunk.elevationM.byteLength
  );
  const output = new Uint8Array(header.length + elevationBytes.length + chunk.hazardClass.length);
  output.set(header, 0);
  output.set(elevationBytes, header.length);
  output.set(chunk.hazardClass, header.length + elevationBytes.length);
  return output;
};

export const digestChunk = (chunk: SpatialChunkData): Promise<string> => sha256Hex(canonicalBytes(chunk));

const cloneChunk = (chunk: StoredChunk): StoredChunk => ({
  quadkey: chunk.quadkey,
  width: chunk.width,
  height: chunk.height,
  elevationM: chunk.elevationM.slice(),
  hazardClass: chunk.hazardClass.slice(),
  digestHex: chunk.digestHex
});

export const merkleRoot = async (leafDigests: ReadonlyArray<string>): Promise<string> => {
  if (leafDigests.length === 0) {
    return sha256Hex(new Uint8Array(0));
  }
  let level: string[] = [...leafDigests];
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1];
      if (left === undefined) {
        continue;
      }
      nextLevel.push(right === undefined ? left : await sha256Hex(textEncoder.encode(left + right)));
    }
    level = nextLevel;
  }
  return level[0] ?? "";
};

export const createMemoryBackend = (): ChunkBackend => {
  const chunks = new Map<string, StoredChunk>();
  const quarantined = new Map<string, StoredChunk>();
  return {
    put: async (chunk) => {
      chunks.set(chunk.quadkey, cloneChunk(chunk));
    },
    get: async (quadkey) => {
      const record = chunks.get(quadkey);
      return record === undefined ? undefined : cloneChunk(record);
    },
    quarantine: async (quadkey) => {
      const record = chunks.get(quadkey);
      if (record !== undefined) {
        quarantined.set(quadkey, record);
        chunks.delete(quadkey);
      }
    },
    listChunkKeys: async () => [...chunks.keys()],
    listQuarantinedKeys: async () => [...quarantined.keys()]
  };
};

const awaitRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const awaitTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of [CHUNK_STORE, QUARANTINE_STORE]) {
        if (database.objectStoreNames.contains(storeName)) {
          database.deleteObjectStore(storeName);
        }
        database.createObjectStore(storeName, { keyPath: "quadkey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another connection"));
  });

const createIndexedDbBackend = (database: IDBDatabase): ChunkBackend => ({
  put: async (chunk) => {
    const transaction = database.transaction(CHUNK_STORE, "readwrite");
    transaction.objectStore(CHUNK_STORE).put(chunk);
    await awaitTransaction(transaction);
  },
  get: async (quadkey) => {
    const transaction = database.transaction(CHUNK_STORE, "readonly");
    const record: unknown = await awaitRequest(transaction.objectStore(CHUNK_STORE).get(quadkey));
    return record === undefined ? undefined : (record as StoredChunk);
  },
  quarantine: async (quadkey) => {
    const transaction = database.transaction([CHUNK_STORE, QUARANTINE_STORE], "readwrite");
    const chunks = transaction.objectStore(CHUNK_STORE);
    const record: unknown = await awaitRequest(chunks.get(quadkey));
    if (record !== undefined) {
      transaction.objectStore(QUARANTINE_STORE).put(record);
      chunks.delete(quadkey);
    }
    await awaitTransaction(transaction);
  },
  listChunkKeys: async () => {
    const transaction = database.transaction(CHUNK_STORE, "readonly");
    const keys = await awaitRequest(transaction.objectStore(CHUNK_STORE).getAllKeys());
    return keys.map(String);
  },
  listQuarantinedKeys: async () => {
    const transaction = database.transaction(QUARANTINE_STORE, "readonly");
    const keys = await awaitRequest(transaction.objectStore(QUARANTINE_STORE).getAllKeys());
    return keys.map(String);
  }
});

export const createSpatialBackend = async (): Promise<{
  readonly backend: ChunkBackend;
  readonly kind: BackendKind;
}> => {
  try {
    const database = await openDatabase();
    return { backend: createIndexedDbBackend(database), kind: "INDEXEDDB" };
  } catch {
    return { backend: createMemoryBackend(), kind: "MEMORY" };
  }
};

export class SpatialStore {
  private readonly backend: ChunkBackend;
  private readonly pristineSource: PristineSource | undefined;
  private readonly trustedManifest: ReadonlyMap<string, string>;
  private readonly knownDigests = new Map<string, string>();

  constructor(options: SpatialStoreOptions) {
    this.backend = options.backend;
    this.pristineSource = options.pristineSource;
    this.trustedManifest = options.trustedManifest ?? new Map<string, string>();
  }

  async ingest(chunk: SpatialChunkData): Promise<StoredChunk> {
    validateChunk(chunk);
    const digestHex = await digestChunk(chunk);
    const stored: StoredChunk = {
      quadkey: chunk.quadkey,
      width: chunk.width,
      height: chunk.height,
      elevationM: chunk.elevationM.slice(),
      hazardClass: chunk.hazardClass.slice(),
      digestHex
    };
    await this.backend.put(stored);
    this.knownDigests.set(chunk.quadkey, digestHex);
    return stored;
  }

  async load(quadkey: string): Promise<LoadResult> {
    const record = await this.backend.get(quadkey);
    if (record === undefined) {
      return {
        status: "MISSING",
        chunk: null,
        expectedDigestHex: this.expectedDigest(quadkey, null),
        observedDigestHex: null
      };
    }
    const observedDigestHex = await digestChunk(record);
    const expectedDigestHex = this.expectedDigest(quadkey, record.digestHex);
    if (observedDigestHex === expectedDigestHex && record.digestHex === expectedDigestHex) {
      return { status: "VERIFIED", chunk: record, expectedDigestHex, observedDigestHex };
    }
    await this.backend.quarantine(quadkey);
    const recovered = await this.recover(quadkey, expectedDigestHex);
    return {
      status: recovered === null ? "UNRECOVERABLE" : "RECOVERED",
      chunk: recovered,
      expectedDigestHex,
      observedDigestHex
    };
  }

  async injectSingleEventUpset(quadkey: string, bitIndex: number = 0): Promise<boolean> {
    const record = await this.backend.get(quadkey);
    if (record === undefined) {
      return false;
    }
    const bytes = new Uint8Array(
      record.elevationM.buffer,
      record.elevationM.byteOffset,
      record.elevationM.byteLength
    );
    const boundedBit = ((bitIndex % (bytes.length * 8)) + bytes.length * 8) % (bytes.length * 8);
    const byteIndex = boundedBit >> 3;
    const current = bytes[byteIndex];
    if (current === undefined) {
      return false;
    }
    bytes[byteIndex] = current ^ (1 << (boundedBit & 7));
    await this.backend.put(record);
    return true;
  }

  quarantinedQuadkeys(): Promise<string[]> {
    return this.backend.listQuarantinedKeys();
  }

  async manifestRoot(): Promise<string> {
    const keys = (await this.backend.listChunkKeys()).sort();
    const leaves: string[] = [];
    for (const key of keys) {
      const record = await this.backend.get(key);
      if (record !== undefined) {
        leaves.push(await sha256Hex(textEncoder.encode(`${key}:${record.digestHex}`)));
      }
    }
    return merkleRoot(leaves);
  }

  private expectedDigest(quadkey: string, storedDigest: string | null): string | null {
    return this.trustedManifest.get(quadkey) ?? this.knownDigests.get(quadkey) ?? storedDigest;
  }

  private async recover(quadkey: string, expectedDigestHex: string | null): Promise<StoredChunk | null> {
    if (this.pristineSource === undefined || expectedDigestHex === null) {
      return null;
    }
    const candidate = await this.pristineSource(quadkey);
    if (candidate === undefined) {
      return null;
    }
    validateChunk(candidate);
    const candidateDigest = await digestChunk(candidate);
    if (candidateDigest !== expectedDigestHex) {
      return null;
    }
    const restored: StoredChunk = {
      quadkey: candidate.quadkey,
      width: candidate.width,
      height: candidate.height,
      elevationM: candidate.elevationM.slice(),
      hazardClass: candidate.hazardClass.slice(),
      digestHex: candidateDigest
    };
    await this.backend.put(restored);
    return restored;
  }
}
