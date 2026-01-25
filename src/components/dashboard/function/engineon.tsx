import { useState, useEffect } from "react";
import { DashboardFilters } from '@/components/dashboard/filter'
import { TrendingUp, AlertCircle, Droplets } from "lucide-react";


export const EngineOnDashboard = () => {

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-start">
            {/* Header Section - Vertical */}
            <div className="flex items-center lg:items-start mt-10 justify-center h-full min-h-75 lg:min-h-full">
                <div className="whitespace-nowrap">
                    <h3 className="text-2xl font-bold tracking-wider text-gray-700 uppercase">Engine-On</h3>
                </div>
            </div>

            {/* Content Section */}
            <div className="flex flex-col gap-10">
                {/* Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className={`relative overflow-hidden rounded-xl p-6 bg-white shadow-lg transition-all duration-500 hover:shadow-xl hover:-translate-y-1 `}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-4xl font-bold bg-linear-to-br from-emerald-600 to-sky-600 bg-clip-text text-transparent">
                                คัน
                            </span>
                            <TrendingUp className="w-8 h-8 text-emerald-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-600">Total Vehicles</span>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-emerald-100 to-sky-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    </div>

                    <div className={`relative overflow-hidden rounded-xl p-6 bg-white shadow-lg transition-all duration-500 hover:shadow-xl hover:-translate-y-1 `} style={{ transitionDelay: '100ms' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-4xl font-bold bg-linear-to-br from-orange-600 to-red-600 bg-clip-text text-transparent">
                                นาที
                            </span>
                            <AlertCircle className="w-8 h-8 text-orange-500" />
                        </div>
                        {/* <div className="h-2 bg-gray-200 rounded-full mb-3"></div> */}
                        <span className="text-sm font-medium text-gray-600">Average Engine On</span>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-orange-100 to-red-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    </div>

                    <div className={`relative overflow-hidden rounded-xl p-6 bg-white shadow-lg transition-all duration-500 hover:shadow-xl hover:-translate-y-1 `} style={{ transitionDelay: '200ms' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-4xl font-bold bg-linear-to-br from-red-600 to-pink-600 bg-clip-text text-transparent">
                                ลิตร
                            </span>
                            <Droplets className="w-8 h-8 text-red-500" />
                        </div>
                        {/* <div className="h-2 bg-gray-200 rounded-full mb-3"></div> */}
                        <span className="text-sm font-medium text-gray-600">Fuel Difference Total</span>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-red-100 to-pink-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
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
                </div>
            </div>
        </div>
    )

}