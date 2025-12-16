// src/app/engineon/components/types.ts

export interface EngineTripSummary {
  _id: string

  // ───────── Basic info ─────────
  Supervisor?: string
  TruckPlateNo: string
  Date: string

  // ───────── Engine-on ─────────
  TotalMinutes: number
  Duration_str: string

  // ───────── Trip / Fuel ─────────
  "#trip": number
  "จำนวนลิตร"?: number

  // ───────── Version / Time ─────────
  version_type: string
  year: number
  month: number

  // ───────── Extra (used in table) ─────────
  "สำรองเวลาโหลด"?: number        // นาที
  "ส่วนต่าง"?: number             // นาที (number)
  "ส่วนต่าง_hhmm"?: string        // HH:mm
}

/* ================= Sorting keys ================= */

export type SortKey =
  | "Supervisor"
  | "TruckPlateNo"
  | "Date"
  | "TotalMinutes"
  | "#trip"
  | "จำนวนลิตร"
