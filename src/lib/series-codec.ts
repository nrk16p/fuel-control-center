// Decoder for analytics.gps_series packed columns (enc version 1, spec §3.1).
// Mirrors api-ncac scripts/fuel/series_codec.py — change both together.
// Written with erasable TypeScript only so `node --test` can run it without a build step.

export type FuelUnit = "dl" | "cpct"

export type SeriesColumns = {
  m: number[]
  fuel: number[]
  fuelLo: number[]
  fuelHi: number[]
  speed: number[]
  engine: number[]
  lat: number[]
  lng: number[]
}

/** A Mongo Binary (bson), raw bytes, or base64 text. */
export type BinaryLike = Uint8Array | string | { buffer: Uint8Array; position?: number }

export const ENC_VERSION = 1
export const FUEL_MISSING = -1

type Kind = "u1" | "u2" | "i2" | "i4"

const READERS: Record<Kind, { size: number; read: (view: DataView, offset: number) => number }> = {
  u1: { size: 1, read: (view, offset) => view.getUint8(offset) },
  u2: { size: 2, read: (view, offset) => view.getUint16(offset, true) },
  i2: { size: 2, read: (view, offset) => view.getInt16(offset, true) },
  i4: { size: 4, read: (view, offset) => view.getInt32(offset, true) },
}

const COLUMNS: ReadonlyArray<readonly [keyof SeriesColumns, string, Kind]> = [
  ["m", "m", "u2"],
  ["fuel", "fuel", "i2"],
  ["fuelLo", "fuel_lo", "i2"],
  ["fuelHi", "fuel_hi", "i2"],
  ["speed", "speed", "u1"],
  ["engine", "engine", "u1"],
  ["lat", "lat", "i4"],
  ["lng", "lng", "i4"],
]

function toBytes(value: BinaryLike): Uint8Array {
  if (typeof value === "string") {
    const text = atob(value)
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
    return bytes
  }
  if (value instanceof Uint8Array) return value
  return value.buffer.subarray(0, value.position ?? value.buffer.length)
}

/** Columns of a document with no readings (gps_series docs with n === 0 carry no `cols`). */
function emptyColumns(): SeriesColumns {
  return { m: [], fuel: [], fuelLo: [], fuelHi: [], speed: [], engine: [], lat: [], lng: [] }
}

export function decodeColumns(cols: Record<string, BinaryLike> | undefined, n: number): SeriesColumns {
  if (n === 0) return emptyColumns()
  if (!cols) throw new Error("gps_series columns are missing")
  const out = {} as SeriesColumns
  for (const [key, field, kind] of COLUMNS) {
    const raw = cols[field]
    if (raw === undefined) throw new Error(`gps_series column ${field} is missing`)
    const bytes = toBytes(raw)
    const { size, read } = READERS[kind]
    if (bytes.byteLength < n * size) {
      throw new Error(`gps_series column ${field} has ${bytes.byteLength} bytes, needs ${n * size}`)
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const values = new Array<number>(n)
    for (let i = 0; i < n; i++) values[i] = read(view, i * size)
    out[key] = values
  }
  return out
}

/** Fuel column → litres; null where the minute had no valid reading. */
export function fuelToLitres(values: number[], unit: FuelUnit, tankL: number): (number | null)[] {
  return values.map((v) => {
    if (v < 0) return null
    return unit === "dl" ? v / 10 : ((v / 100) * tankL) / 100
  })
}

/** lat/lng column (degrees × 1e5) → degrees; null where no position was recorded. */
export function toDegrees(values: number[]): (number | null)[] {
  return values.map((v) => (v === 0 ? null : v / 1e5))
}
