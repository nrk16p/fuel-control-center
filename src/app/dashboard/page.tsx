"use client"
import { useState } from "react"
import { ChartPie, Truck, UserRound } from "lucide-react"
import { OverviewDashboard } from "@/components/dashboard/overview"
import { DriverDashboard } from "@/components/dashboard/driver"
import { ClientDashboard } from "@/components/dashboard/client" 

export default function DashboardPage() {
  const [activeNav, setActiveNav] = useState("Overview")

  const navmenu = [
    { name: "Overview", icon: ChartPie, component: OverviewDashboard },
    // { name: "Drivers", icon: Truck, component: DriverDashboard },
    // { name: "Clients", icon: UserRound, component: ClientDashboard },
  ]

  const ActiveComponent = navmenu.find(item => item.name === activeNav)?.component

  return (
    <div className="min-h-screen scale-95 p-2 lg:p-3">
 
      <div className="mb-2">
        <div className="inline-flex rounded-lg bg-gray-200 p-1 shadow-sm">
          {navmenu.map((item) => {
            const Icon = item.icon
            const isActive = activeNav === item.name

            return (
              <button
                key={item.name}
                onClick={() => setActiveNav(item.name)}
                className={`hidden items-center gap-2 rounded-md py-2 px-6 text-sm font-medium transition-all duration-200
                  ${isActive
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                  }`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </button>
            )
          })}
        </div>
      </div>
          
      <div className="transition-all duration-300">
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  )
}