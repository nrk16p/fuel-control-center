"use client"

import Link from "next/link"
import { useState } from "react"

/* -------------------------------------------------
   Types
------------------------------------------------- */
export interface SmartDistanceRow {
  TicketNo: string
  TicketCreateAt?: string
  PlantCode: string
  SiteCode: string

  TruckPlateNo?: string
  TruckNo?: string

  rmc_distance_km_p2s?: number | null
  rmc_distance_km_s2p?: number | null

  gps_distance_km_p2s?: number | null
  gps_distance_km_s2p?: number | null

  osrm_distance_km_p2s?: number | null
  osrm_distance_km_s2p?: number | null

  is_split_trip?: boolean
}

/* -------------------------------------------------
   Helpers
------------------------------------------------- */
const fmt = (v?: number | null) =>
  v == null ? "—" : v.toFixed(2)

function getStatus(row: SmartDistanceRow) {
  const base = row.rmc_distance_km_p2s
  const gps = row.gps_distance_km_p2s
  const osrm = row.osrm_distance_km_p2s

  if (row.is_split_trip) return "🔁 Split trip"

  if (base && osrm) {
    const diffPct = ((osrm - base) / base) * 100
    if (diffPct > 20) return "❌ OSRM > RMC +20%"
    if (diffPct > 10) return "⚠️ OSRM > RMC +10%"
  }

  if (base && gps) {
    const diffPct = ((gps - base) / base) * 100
    if (Math.abs(diffPct) > 10) return "⚠️ GPS deviate"
  }

  return "✅ OK"
}

/* -------------------------------------------------
   Tooltip Component
------------------------------------------------- */
interface TooltipProps {
  text: string
}

function InfoTooltip({ text }: TooltipProps) {
  return (
    <span className="group relative inline-block ml-1">
      <span className="cursor-help text-blue-500 text-xs font-normal">ⓘ</span>
      <span className="invisible group-hover:visible absolute left-0 top-6 z-20 w-64 p-2 text-xs font-normal text-white bg-gray-900 rounded shadow-lg -translate-x-1/2 ml-2">
        {text}
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></span>
      </span>
    </span>
  )
}

/* -------------------------------------------------
   Styles (Tailwind classes)
------------------------------------------------- */
const styles = {
  th: "px-2 py-2 text-left font-semibold border-b",
  thCenter: "px-2 py-2 text-center font-semibold border-b",
  thSub: "px-2 py-1 text-center text-xs font-medium border-b",
  td: "px-2 py-2 text-center align-middle",
  tdCenter: "px-2 py-2 text-center",
}

/* -------------------------------------------------
   Component
------------------------------------------------- */
interface Props {
  data: SmartDistanceRow[]
}

export function SmartDistanceTable({ data }: Props) {
  return (
    <div className="overflow-x-auto border rounded">
      <table className="w-full text-sm">
        {/* ================= HEADER ================= */}
        <thead className="bg-gray-100 sticky top-0 z-10">
          <tr>
            <th rowSpan={2} className={styles.th}>Ticket</th>
            <th rowSpan={2} className={styles.th}>Truck</th>
            <th rowSpan={2} className={styles.th}>Route</th>

            <th colSpan={2} className={styles.thCenter}>
              RMC (Ticket)
              <InfoTooltip text="ข้อมูลระยะทางจากตั๋ว" />
            </th>
            <th colSpan={2} className={styles.thCenter}>
              GPS (SmartDistance)
              <InfoTooltip text="ข้อมูลระยะทางจากระบบช่วยคำนวณจาก driving_log" />
            </th>
            <th colSpan={2} className={styles.thCenter}>
              OSRM (Map)
              <InfoTooltip text="ข้อมูลระยะทางจากการคำนวณโดยใช้ Map-API" />
            </th>

            <th rowSpan={2} className={styles.thCenter}>Map</th>
          </tr>

          <tr>
            <th className={styles.thSub}>P → S</th>
            <th className={styles.thSub}>S → P</th>
            <th className={styles.thSub}>P → S</th>
            <th className={styles.thSub}>S → P</th>
            <th className={styles.thSub}>P → S</th>
            <th className={styles.thSub}>S → P</th>
          </tr>
        </thead>

        {/* ================= BODY ================= */}
        <tbody>
          {data.map(row => {
            const status = getStatus(row)

            return (
              <tr
                key={row.TicketNo}
                className="border-t hover:bg-gray-50"
              >
                {/* Ticket */}
                <td className={`${styles.td} font-medium`}>
                  <Link
                    href={`/smartdistance/${row.TicketNo}`}
                    className="text-blue-600 underline hover:text-blue-800"
                  >
                    {row.TicketNo}
                  </Link>
                  {row.TicketCreateAt && (
                    <div className="text-xs text-gray-400">
                      {new Date(row.TicketCreateAt).toLocaleString()}
                    </div>
                  )}
                </td>

                {/* Truck */}
                <td className={styles.td}>
                  <div>{row.TruckPlateNo}</div>
                  <div className="text-xs text-gray-400">
                    {row.TruckNo}
                  </div>
                </td>

                {/* Route */}
                <td className={`${styles.td} text-xs`}>
                  <div>{row.PlantCode}</div>
                  <div className="text-gray-400">→ {row.SiteCode}</div>
                </td>

                {/* RMC */}
                <td className={`${styles.td} text-right`}>
                  {fmt(row.rmc_distance_km_p2s)}
                </td>
                <td className={`${styles.td} text-right`}>
                  {fmt(row.rmc_distance_km_s2p)}
                </td>

                {/* GPS */}
                <td className={`${styles.td} text-right text-blue-600`}>
                  {fmt(row.gps_distance_km_p2s)}
                </td>
                <td className={`${styles.td} text-right text-blue-600`}>
                  {fmt(row.gps_distance_km_s2p)}
                </td>

                {/* OSRM */}
                <td className={`${styles.td} text-right text-green-600`}>
                  {fmt(row.osrm_distance_km_p2s)}
                </td>
                <td className={`${styles.td} text-right text-green-600`}>
                  {fmt(row.osrm_distance_km_s2p)}
                </td>

                {/* Map */}
                <td className={styles.tdCenter}>
                  <Link
                    href={`/smartdistance/${row.TicketNo}`}
                    className="text-lg"
                  >
                    🗺️
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}