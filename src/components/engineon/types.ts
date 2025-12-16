// src/app/engineon/components/types.ts

export interface EngineTripSummary {
  _id: string
  Supervisor?: string
  TruckPlateNo: string
  Date: string
  TotalMinutes: number
  Duration_str: string
  "#trip": number
  จำนวนลิตร?: number
  version_type: string
  year: number
  month: number
}

export type SortKey =
  | "Supervisor"
  | "TruckPlateNo"
  | "Date"
  | "TotalMinutes"
  | "#trip"
  | "จำนวนลิตร"
