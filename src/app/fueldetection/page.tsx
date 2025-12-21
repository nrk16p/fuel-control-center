'use client'
import { useState } from "react"
import { FuelDetectionFilter } from "@/components/fueldetection/filter"
import { FuelDetectionGraph } from "@/components/fueldetection/graph"
import type { FuelDetectionData } from "@/lib/types"

export default function FuelDetectionPage() {
    const [data, setData] = useState<FuelDetectionData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    const handleQueryApply = async (newFilters: { plateDriver: string; startDate: string; endDate: string }) => {
        setLoading(true);
        try {
            if (!newFilters.plateDriver || !newFilters.startDate || !newFilters.endDate) {
                setData([]);
                setLoading(false);
                return;
            }
            const params = new URLSearchParams();
            if (newFilters.plateDriver) params.append("plateDriver", newFilters.plateDriver);
            if (newFilters.startDate) params.append("startDate", newFilters.startDate);
            if (newFilters.endDate) params.append("endDate", newFilters.endDate);
            const res = await fetch(`/api/fuel-detection?${params.toString()}`, { headers: { "Cache-Control": "no-cache" }, cache: "no-store" });
            if (!res.ok) return alert("Failed to fetch data res.ok=false");
            const json = await res.json();
            console.log("Fetched Data:", json);
            setData(json);
        } catch (error) {
            console.error("Error fetching data:", error);
            alert("error fetching data : " + error);
        }
        setLoading(false);

    };

    return (
        <div className="p-6 space-y-4">
            <h1 className="text-2xl font-bold">⛽ Fuel Detection</h1>
            {/* Filter Component */}
            <FuelDetectionFilter query={handleQueryApply} isLoading={loading} />

            {/* Data Graph */}
            {loading ? (
                <div className="animate-pulse">
                    {/* Chart skeleton */}
                    <div className="rounded-xl border bg-white p-6 shadow-sm">
                        <div className="h-5 w-48 rounded bg-gray-200 mb-4" />
                        <div className="flex items-end gap-3 h-64">
                            {[...Array(12)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-full rounded bg-gray-200"
                                    style={{ height: `${30 + (i % 5) * 15}%` }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <FuelDetectionGraph data={data} />
            )}
        </div>
    );
}