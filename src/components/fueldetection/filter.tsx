'use client'

import { useEffect, useState } from "react"
import { DateRange } from "@/components/ui/daterange"

interface FuelDetectionFilterProps {
    query: (filters: { plateDriver: string; startDate: string; endDate: string }) => void;
    isLoading: boolean;
}

export const FuelDetectionFilter = ({ query, isLoading }: FuelDetectionFilterProps) => {

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    const startDate = new Date(yesterday);
    startDate.setDate(yesterday.getDate() - 8);

    const [dateRange, setDateRange] = useState({
        from: startDate,
        to: yesterday
    });
    
    const [selectedPlateDriver, setSelectedPlateDriver] = useState("");

    const handleReset = () => {
        setDateRange({
            from: startDate,
            to: yesterday
        });
        setSelectedPlateDriver("");
    };

    const handleApply = () => {
        if(!dateRange.from || !dateRange.to || selectedPlateDriver === "") return alert("โปรดใส่ข้อมูลให้ครบถ้วน");
        
        console.log("Applying filters:", {
            plateDriver: selectedPlateDriver,
            startDate: dateRange.from ? `${dateRange.from.getDate().toString().padStart(2, '0')}/${(dateRange.from.getMonth() + 1).toString().padStart(2, '0')}/${dateRange.from.getFullYear()}` : "",
            endDate: dateRange.to ? `${dateRange.to.getDate().toString().padStart(2, '0')}/${(dateRange.to.getMonth() + 1).toString().padStart(2, '0')}/${dateRange.to.getFullYear()}` : "",
        });
        
        query({
            plateDriver: selectedPlateDriver,
            startDate: dateRange.from ? `${dateRange.from.getDate().toString().padStart(2, '0')}/${(dateRange.from.getMonth() + 1).toString().padStart(2, '0')}/${dateRange.from.getFullYear()}` : "",
            endDate: dateRange.to ? `${dateRange.to.getDate().toString().padStart(2, '0')}/${(dateRange.to.getMonth() + 1).toString().padStart(2, '0')}/${dateRange.to.getFullYear()}` : "",
        });
    };
 

    return (
        <div className="bg-white rounded-xl border shadow-sm p-4 flex justify-between gap-4 items-center">
            <div className="flex gap-4 items-start">
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">
                        Date Range
                    </label>
                    <DateRange 
                        value={dateRange}
                        onChange={setDateRange}
                        placeholder="Select date range"
                        className="h-9 rounded-md border bg-white px-3 py-1 text-sm shadow-xs"
                    />
                </div>
                
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">
                        Plate/Driver
                    </label>
                    <div className="relative w-64">
                        <input
                            type="text"
                            className="h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                            placeholder="Search plate or driver..."
                            value={selectedPlateDriver}
                            onChange={(e) => setSelectedPlateDriver(e.target.value)}
                        />
                       
                    </div>
                </div>
            </div>
            
            <div className="flex gap-2 items-center">
                <button
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 gap-2"
                    onClick={handleApply}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Loading...
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6 9 17l-5-5"/>
                            </svg>
                            Apply
                        </>
                    )}
                </button>
                <button
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 gap-2"
                    onClick={handleReset}
                    disabled={isLoading}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        <path d="M3 3v5h5"/>
                    </svg>
                    Reset
                </button>
            </div>
        </div>
    )
}