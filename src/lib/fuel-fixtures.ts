import eventsJson from "./__fixtures__/fuel-events-sample.json"
import seriesJson from "./__fixtures__/gps-series-sample.json"
import summaryJson from "./__fixtures__/fuel-summary-sample.json"
import type { SeriesDoc } from "./fuel-series"
import type { DailySummary, FuelEvent } from "./fuel-types"

export const FIXTURE_EVENTS = eventsJson as unknown as FuelEvent[]
export const FIXTURE_SUMMARY = summaryJson as unknown as DailySummary
export const FIXTURE_SERIES = seriesJson as unknown as SeriesDoc[]
