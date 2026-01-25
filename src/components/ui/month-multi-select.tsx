"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface MonthMultiSelectProps {
    value: number[]
    onChange: (months: number[]) => void
    className?: string
}

export function MonthMultiSelect({
    value,
    onChange,
    className,
}: MonthMultiSelectProps) {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    
    const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

    const toggleMonth = (month: number) => {
        if (value.includes(month)) {
            if (value.length > 1) {
                onChange(value.filter(m => m !== month))
            }
        } else {
            onChange([...value, month].sort((a, b) => a - b))
        }
    }

    return (
        <div className={cn("flex items-center gap-1 p-1 bg-slate-100 rounded-lg flex-wrap", className)}>
            {months.map((month) => {
                const isSelected = value.includes(month)
                return (
                    <button
                        key={month}
                        type="button"
                        onClick={() => toggleMonth(month)}
                        className={cn(
                            "flex items-center justify-center gap-1.5 rounded-md border-none py-2 px-3 transition-all duration-150 ease-in-out text-sm whitespace-nowrap",
                            isSelected
                                ? "bg-white font-semibold text-slate-700 shadow-sm"
                                : "text-slate-600 hover:text-slate-700 hover:bg-slate-200/50"
                        )}
                    >
                        <span>{monthNames[month - 1]}</span>
                    </button>
                )
            })}
        </div>
    )
}
