"use client"

import React, { useEffect, useState } from "react"
import { Search, RotateCcw, Factory, MapPin, Building2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { YearMultiSelect } from "@/components/ui/year-multi-select"
import { MonthMultiSelect } from "@/components/ui/month-multi-select"


/* ----------------------------- Types ------------------------------ */
export type AllOrNumber = number | "all"
export type Company = "all" | "Asia" | "SCCO"

interface Props {
  type: "driver" | "client" | "overview"
  filters: (filters: {
    years: number[]
    months?: number[]
    search?: string
  }) => void
}

/* ----------------------------- Component ------------------------------ */
export function DashboardFilters({
  type,
  filters,
}: Props) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const showMonth = [1,2,3,4,5,6,7,8,9,10,11,12]

  const [selectedYears, setSelectedYears] = useState<number[]>([currentYear])
  const [selectedMonths, setSelectedMonths] = useState<number[]>([...showMonth])
  const [search, setSearch] = useState<string>("")
  const [element, setElement] = useState<string[]>([])

  const switchType = (type: string) => {
    switch (type) {
      case "overview":
        return setElement(["YearSelect", "MonthSelect", "Search"])
    }
  }

  const handleApply = () => {
    filters({
      years: selectedYears,
      months: selectedMonths,
      search
    })
  }

  const handleClear = () => {
    setSelectedYears([currentYear])
    setSelectedMonths([...showMonth])
    setSearch("")
    filters({
      years: [currentYear],
      months: [...showMonth],
      search: ""
    })
  }

  useEffect(() => {
    switchType(type)
    handleApply();
  }, [type])


  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header Section */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-800">
        <h3 className="text-md font-md text-white">ตัวกรอง / Filters</h3>
      </div>

      {/* Filters Grid */}
      <div className="p-6 space-y-4">
        <div className="flex flex-row justify-start gap-6">
          {element.includes("YearSelect") && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">เลือกปี</label>
              <YearMultiSelect
                value={selectedYears}
                onChange={setSelectedYears}
                minYear={2025}
                maxYear={new Date().getFullYear()}
              />
            </div>
          )}

          {element.includes("MonthSelect") && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">เลือกเดือน</label>
              <MonthMultiSelect
                value={selectedMonths}
                onChange={setSelectedMonths}
              />
            </div>
          )}
          
          {element.includes("Search") && (
            <div className="hidden">
              <label className="block text-xs font-medium text-gray-600 mb-1">ค้นหาชื่อ, ทะเบียน</label>
              <Input
                type="text"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Driver name, Plate number..."
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Apply Button */}
        <div className="flex justify-start pt-2 gap-3">
          <Button
            onClick={handleApply}
            className="gap-2 h-9 px-6 bg-indigo-500 hover:bg-indigo-700 text-white cursor-pointer"
          >
            Apply
          </Button>
          <Button
            onClick={handleClear}
            className="bg-white border border-indigo-500 text-indigo-500 hover:bg-indigo-100 gap-2 h-9 px-6 cursor-pointer"
          >
            <RotateCcw size={14} />
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}
