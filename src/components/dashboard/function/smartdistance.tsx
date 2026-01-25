import { useState, useEffect } from "react";
import { DashboardFilters } from '@/components/dashboard/filter'


export const SmartDistanceDashboard = () => {

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-start">
            {/* Header Section - Vertical */}
            <div className="flex items-center lg:items-start mt-10 justify-center h-full min-h-75 lg:min-h-full">
                <div className="whitespace-nowrap">
                    <h3 className="text-2xl font-bold tracking-wider text-gray-700 uppercase">Smart Distance</h3>
                </div>
            </div>

            {/* Content Section */}
            <div className="flex flex-col gap-10">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="h-64 flex items-center justify-center text-gray-400 gap-10 p-6 scale-90">
                        <p>Chart goes here</p>
                        <p>Chart goes here</p>
                        <p>Chart goes here</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="h-64 flex items-center justify-center text-gray-400 gap-10 p-6 scale-90">
                        <p>Chart goes here</p>
                        <p>Chart goes here</p>
                        <p>Chart goes here</p>
                    </div>
                </div>
            </div>
        </div>
    )

}