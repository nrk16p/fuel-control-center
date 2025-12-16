// src/app/engineon/components/types.ts

export interface EngineTripSummary {
  _id: string

  // ───────── Basic ─────────
  Supervisor?: string
  TruckPlateNo: string
  Date: string

  // ───────── Engine-On ─────────
  TotalMinutes: number
  Duration_str: string

  // ───────── Trip / Fuel ─────────
  "#trip": number
  "จำนวนลิตร"?: number

  // ───────── Version / Time ─────────
  version_type: string
  year: number
  month: number

  // ───────── Extra (optional but used in UI) ─────────
  "สำรองเวลาโหลด"?: number        // นาที
  "ส่วนต่าง"?: number             // นาที (number)
  "ส่วนต่าง_hhmm"?: string        // HH:mm
}

/* ───────── Sorting keys ───────── */

export type SortKey =
  | "Supervisor"
  | "TruckPlateNo"
  | "Date"
  | "TotalMinutes"
  | "#trip"
  | "จำนวนลิตร"
