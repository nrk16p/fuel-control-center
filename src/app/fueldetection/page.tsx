"use client"

import Link from "next/link"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { QueueTab } from "@/components/fuel/QueueTab"
import { ReportTab } from "@/components/fuel/ReportTab"
import { TruckTab } from "@/components/fuel/TruckTab"

const TABS = [
  { id: "queue", label: "คิวตรวจสอบ" },
  { id: "truck", label: "รายคัน" },
  { id: "report", label: "สรุป & สถานะข้อมูล" },
] as const
type TabId = (typeof TABS)[number]["id"]

function FuelDetectionTabs() {
  const params = useSearchParams()
  const router = useRouter()
  const requested = params.get("tab")
  // ?plate= จากช่องค้นหาหน้าแรก → เปิดแท็บรายคัน
  const tab: TabId = TABS.find((t) => t.id === requested)?.id ?? (params.get("plate") ? "truck" : "queue")

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">⛽ Fuel Detection</h1>
        <Link href="/fueldetection/legacy" className="text-[13px] text-muted-ink underline underline-offset-2">
          มุมมองเดิม (ชั่วคราว)
        </Link>
      </header>
      <nav role="tablist" aria-label="มุมมอง" className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => router.replace(`/fueldetection?tab=${t.id}`)}
            className={`h-10 shrink-0 rounded-[12px] px-4 text-[14px] font-medium ${
              tab === t.id ? "bg-forest text-cream" : "border border-line bg-surface text-ink hover:bg-cream"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "queue" && <QueueTab />}
      {tab === "truck" && <TruckTab />}
      {tab === "report" && <ReportTab />}
    </div>
  )
}

export default function FuelDetectionPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense
  return (
    <Suspense>
      <FuelDetectionTabs />
    </Suspense>
  )
}
