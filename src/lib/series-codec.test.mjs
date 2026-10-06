import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { decodeColumns, fuelToLitres, toDegrees } from "./series-codec.ts"

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/series-codec-sample.json", import.meta.url), "utf8"),
)

test("decodes columns written by the Python codec", () => {
  const cols = decodeColumns(fixture.cols, fixture.n)
  assert.deepEqual(cols.m, fixture.expected.m)
  assert.deepEqual(cols.fuel, fixture.expected.fuel)
  assert.deepEqual(cols.fuelLo, fixture.expected.fuel_lo)
  assert.deepEqual(cols.fuelHi, fixture.expected.fuel_hi)
  assert.deepEqual(cols.speed, fixture.expected.speed)
  assert.deepEqual(cols.engine, fixture.expected.engine)
  assert.deepEqual(cols.lat, fixture.expected.lat)
  assert.deepEqual(cols.lng, fixture.expected.lng)
})

test("reads Binary-like values with a byte offset", () => {
  const backing = Uint8Array.from([9, 9, 1, 0, 0, 1, 7])
  const cols = { ...fixture.cols, m: { buffer: backing.subarray(2), position: 4 } }
  assert.deepEqual(decodeColumns(cols, 2).m, [1, 256])
})

test("rejects short or missing columns", () => {
  assert.throws(() => decodeColumns({ ...fixture.cols, m: new Uint8Array(2) }, 3), /column m/)
  const { lng, ...rest } = fixture.cols
  assert.throws(() => decodeColumns(rest, 3), /lng is missing/)
})

test("converts fuel and degrees", () => {
  assert.deepEqual(fuelToLitres([5525, -1], "cpct", 200), [110.5, null])
  assert.deepEqual(fuelToLitres([1824], "dl", 0), [182.4])
  assert.deepEqual(toDegrees([1379576, 0]), [13.79576, null])
})
