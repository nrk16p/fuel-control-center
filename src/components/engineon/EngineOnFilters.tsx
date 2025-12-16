"use client"

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

interface Props {
  search: string
  setSearch: (v: string) => void
  version: string
  setVersion: (v: string) => void
  month: string | number
  setMonth: (v: string | number) => void
  year: string | number
  setYear: (v: string | number) => void
  versionOptions: string[]
  yearOptions: number[] // ค.ศ.
  onReset: () => void
}

export function EngineOnFilters({
  search,
  setSearch,
  version,
  setVersion,
  month,
  setMonth,
  year,
  setYear,
  versionOptions,
  yearOptions,
  onReset,
}: Props) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-4 items-end">
      
      {/* Search */}
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
            placeholder="ทะเบียน / คนขับ"
            className="pl-8"
          />
        </div>
      </div>

      {/* Version */}
      <FilterSelect label="Version" value={version} onChange={setVersion}>
        <option value="all">ทั้งหมด</option>
        {versionOptions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </FilterSelect>

      {/* Month (Thai) */}
      <FilterSelect
        label="เดือน"
        value={month}
        onChange={(v) => setMonth(v === "all" ? "all" : Number(v))}
      >
        <option value="all">ทุกเดือน</option>
        {THAI_MONTHS.slice(1).map((name, idx) => {
          const monthValue = idx + 1
          return (
            <option key={monthValue} value={monthValue}>
              {name}
            </option>
          )
        })}
      </FilterSelect>

      {/* Year (Thai Buddhist year display) */}
      <FilterSelect
        label="ปี"
        value={year}
        onChange={(v) => setYear(v === "all" ? "all" : Number(v))}
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
        <RotateCcw size={16} /> Reset
      </Button>
    </div>
  )
}

/* -----------------------------
   Reusable Select
------------------------------ */
function FilterSelect({
  label,
  value,
  onChange,
  children,
}: any) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-3 py-2 bg-white"
      >
        {children}
      </select>
    </div>
  )
}
