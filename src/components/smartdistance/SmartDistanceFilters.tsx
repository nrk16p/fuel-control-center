"use client"

import React from "react"
import { Search, RotateCcw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

/* -----------------------------
   Thai Month / Year helpers
------------------------------ */
const THAI_MONTHS = [
  "",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
]

const toThaiYear = (year: number) => year + 543

/* -----------------------------
   Types
------------------------------ */
export type AllOrNumber = number | "all"

interface Props {
  search: string
  setSearch: (v: string) => void

  month: AllOrNumber
  setMonth: (v: AllOrNumber) => void

  year: AllOrNumber
  setYear: (v: AllOrNumber) => void

  yearOptions: number[]
  onReset: () => void
}

/* -----------------------------
   Component
------------------------------ */
export function SmartDistanceFilters({
  search,
  setSearch,
  month,
  setMonth,
  year,
  setYear,
  yearOptions,
  onReset,
}: Props) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-4 items-end">
      {/* 🔍 Search */}
      <div className="w-64">
        <label className="text-xs text-gray-500">ค้นหา</label>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ticket / ทะเบียนรถ"
            className="pl-8"
          />
        </div>
      </div>

      {/* Month */}
      <FilterSelect<AllOrNumber>
        label="เดือน"
        value={month}
        onChange={(v) =>
          setMonth(v === "all" ? "all" : Number(v))
        }
      >
        <option value="all">ทุกเดือน</option>
        {THAI_MONTHS.slice(1).map((name, idx) => {
          const m = idx + 1
          return (
            <option key={m} value={m}>
              {name}
            </option>
          )
        })}
      </FilterSelect>

      {/* Year */}
      <FilterSelect<AllOrNumber>
        label="ปี"
        value={year}
        onChange={(v) =>
          setYear(v === "all" ? "all" : Number(v))
        }
      >
        <option value="all">ทุกปี</option>
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {toThaiYear(y)}
          </option>
        ))}
      </FilterSelect>

      {/* Reset */}
      <Button
        variant="outline"
        onClick={onReset}
        className="ml-auto gap-2"
      >
        <RotateCcw size={16} />
        Reset
      </Button>
    </div>
  )
}

/* -----------------------------
   Reusable Select
------------------------------ */
interface FilterSelectProps<T extends string | number> {
  label: string
  value: T
  onChange: (v: T) => void
  children: React.ReactNode
}

function FilterSelect<T extends string | number>({
  label,
  value,
  onChange,
  children,
}: FilterSelectProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value as T)
        }
        className="border rounded px-3 py-2 bg-white"
      >
        {children}
      </select>
    </div>
  )
}
