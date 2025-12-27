"use client"

import React from "react"
import { Search, RotateCcw, Factory, MapPin, Building2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

/* ----------------------------- Thai Month / Year helpers ------------------------------ */
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

/* ----------------------------- Types ------------------------------ */
export type AllOrNumber = number | "all"
export type Company = "all" | "Asia" | "SCCO"

interface Props {
  search: string
  setSearch: (v: string) => void
  plantCode: string
  setPlantCode: (v: string) => void
  siteCode: string
  setSiteCode: (v: string) => void
  company: Company
  setCompany: (v: Company) => void
  month: AllOrNumber
  setMonth: (v: AllOrNumber) => void
  year: AllOrNumber
  setYear: (v: AllOrNumber) => void
  yearOptions: number[]
  onReset: () => void
}

/* ----------------------------- Component ------------------------------ */
export function SmartDistanceFilters({
  search,
  setSearch,
  plantCode,
  setPlantCode,
  siteCode,
  setSiteCode,
  company,
  setCompany,
  month,
  setMonth,
  year,
  setYear,
  yearOptions,
  onReset,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header Section */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-700">ตัวกรอง / Filters</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          className="gap-2 h-8 text-xs hover:bg-gray-100"
        >
          <RotateCcw size={14} />
          Reset
        </Button>
      </div>

      {/* Filters Grid */}
      <div className="p-6 space-y-4">
        {/* บรรทัดแรก: เดือน + ปี */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Month */}
          <FilterSelect<AllOrNumber>
            label="เดือน"
            value={month}
            onChange={(v) => setMonth(v === "all" ? "all" : Number(v))}
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
            onChange={(v) => setYear(v === "all" ? "all" : Number(v))}
          >
            <option value="all">ทุกปี</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {toThaiYear(y)}
              </option>
            ))}
          </FilterSelect>
        </div>

        {/* บรรทัดสอง: Company + ค้นหา + Plant Code + Site Code */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 🏢 Company */}
          <FilterSelect<Company>
            label="Client"
            value={company}
            onChange={setCompany}
            icon={<Building2 size={14} />}
          >
            <option value="all">ทั้งหมด</option>
            <option value="Asia">Asia (SU / SX)</option>
            <option value="SCCO">SCCO (C)</option>
          </FilterSelect>

          {/* 🔍 Search */}
          <FilterInput
            label="ค้นหา"
            placeholder="Ticket / ทะเบียนรถ"
            icon={<Search size={16} />}
            value={search}
            onChange={setSearch}
          />

          {/* 🏭 Plant Code */}
          <FilterInput
            label="Plant Code"
            placeholder="C / SU / SX"
            icon={<Factory size={16} />}
            value={plantCode}
            onChange={(v) => setPlantCode(v.toUpperCase())}
          />

          {/* 📍 Site Code */}
          <FilterInput
            label="Site Code"
            placeholder="Site"
            icon={<MapPin size={16} />}
            value={siteCode}
            onChange={setSiteCode}
          />
        </div>
      </div>
    </div>
  )
}

/* ----------------------------- Reusable Input ------------------------------ */
interface FilterInputProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  icon?: React.ReactNode
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  icon,
}: FilterInputProps) {
  const inputId = React.useId()

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="block text-xs font-medium text-gray-600 mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </span>
        )}
        <Input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full h-10 ${
            icon ? "pl-9" : "pl-3"
          } transition-colors focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
        />
      </div>
    </div>
  )
}

/* ----------------------------- Reusable Select ------------------------------ */
interface FilterSelectProps<T extends string | number> {
  label: string
  value: T
  onChange: (v: T) => void
  children: React.ReactNode
  icon?: React.ReactNode
}

function FilterSelect<T extends string | number>({
  label,
  value,
  onChange,
  children,
  icon,
}: FilterSelectProps<T>) {
  const selectId = React.useId()

  return (
    <div className="w-full">
      <label
        htmlFor={selectId}
        className="block text-xs font-medium text-gray-600 mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
            {icon}
          </span>
        )}
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={`w-full h-10 border border-gray-300 rounded-md bg-white text-sm ${
            icon ? "pl-9" : "pl-3"
          } pr-10 appearance-none cursor-pointer transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
        >
          {children}
        </select>
        {/* Custom dropdown arrow */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
      </div>
    </div>
  )
}
