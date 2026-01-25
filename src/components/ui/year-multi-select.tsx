"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface YearMultiSelectProps {
    value: number[]
    onChange: (years: number[]) => void
    minYear?: number
    maxYear?: number
    className?: string
}

export function YearMultiSelect({
    value,
    onChange,
    minYear = 2025,
    maxYear = new Date().getFullYear(),
    className,
}: YearMultiSelectProps) {
    const years = React.useMemo(() => {
        const arr: number[] = []
        for (let y = minYear; y <= maxYear; y++) {
            arr.push(y)
        }
        return arr
    }, [minYear, maxYear])

    const toBuddhistYear = (year: number) => year + 543

    // Handle year toggle
    const toggleYear = (year: number) => {
        if (value.includes(year)) {
            if (value.length > 1) {
                onChange(value.filter(y => y !== year))
            }
        } else {
            onChange([...value, year].sort((a, b) => a - b))
        }
    }

    return (
        <div className={cn("flex items-center gap-1 p-1 bg-slate-100 rounded-lg", className)}>
            {years.map((year) => {
                const isSelected = value.includes(year) 
                return (
                    <button
                        key={year}
                        type="button"
                        onClick={() => toggleYear(year)}
                        className={cn(
                            "flex items-center justify-center gap-1.5 rounded-md border-none py-2 px-4 transition-all duration-150 ease-in-out text-sm",
                            isSelected
                                ? "bg-white font-semibold text-slate-700 shadow-sm"
                                : "text-slate-600 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                    >
            
                        <span>{toBuddhistYear(year)}</span>
                    </button>
                )
            })}
        </div>
    )
}
