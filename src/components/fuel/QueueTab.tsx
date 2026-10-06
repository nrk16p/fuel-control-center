"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { keyAction } from "@/lib/fuel-decision"
import { eventPath, eventsUrl, neighbourId, nextWaitingId, type StatusFilter } from "@/lib/fuel-events"
import type { DailySummary, Decision, EventClass, FuelEvent, Source } from "@/lib/fuel-types"
import { DecisionBar } from "./DecisionBar"
import { EventCard } from "./EventCard"
import { EventFilters, type QueueFilters } from "./EventFilters"
import { EventPanel } from "./EventPanel"
import { MorningCard } from "./MorningCard"
import { useJson } from "./useJson"

type SummaryResponse = { date: string; summary: DailySummary | null; checkFirst: FuelEvent[] }
type EventsResponse = { filter: { from: string; to: string }; total: number; truncated: boolean; events: FuelEvent[] }

/** null = บันทึกแล้ว; ไม่งั้นคืนรหัส HTTP + ข้อความ */
async function postDecision(id: string, decision: Decision, note: string): Promise<{ status: number; error: string } | null> {
  try {
    const res = await fetch(`${eventPath(id)}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    })
    if (res.ok) return null
    if (res.status === 401) return { status: 401, error: "ต้องเข้าสู่ระบบใหม่ก่อนบันทึก" }
    const body: unknown = await res.json().catch(() => null)
    const error =
      body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `บันทึกไม่สำเร็จ (${res.status})`
    return { status: res.status, error }
  } catch {
    return { status: 0, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองอีกครั้ง" }
  }
}

export function QueueTab() {
  const params = useSearchParams()
  const [filters, setFilters] = useState<QueueFilters>(() => ({
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    status: (params.get("status") as StatusFilter | null) ?? "waiting",
    cls: (params.get("class") as EventClass | null) ?? "",
    source: (params.get("source") as Source | null) ?? "",
    branch: "",
    fleet: "",
    plant: "",
  }))
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("event"))
  const [decided, setDecided] = useState<Record<string, Decision>>({})
  const [note, setNote] = useState("")
  const [pendingLoss, setPendingLoss] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const summary = useJson<SummaryResponse>(filters.to ? `/api/fuel/summary?date=${filters.to}` : "/api/fuel/summary")
  const list = useJson<EventsResponse>(
    eventsUrl({
      from: filters.from,
      to: filters.to,
      status: filters.status,
      class: filters.cls,
      source: filters.source,
      branch: filters.branch,
      fleet: filters.fleet,
      plant: filters.plant,
    }),
  )

  // ผลการตัดสินที่เพิ่งบันทึก ทับบนรายการ (ไม่ต้องรอโหลดใหม่)
  const events = (list.data?.events ?? []).map((e) =>
    decided[e._id] ? { ...e, status: "decided" as const, decision: decided[e._id] } : e,
  )
  const ids = events.map((e) => e._id)
  const selected = events.find((e) => e._id === selectedId) ?? null
  const shownFilters: QueueFilters = {
    ...filters,
    from: filters.from || list.data?.filter.from || "",
    to: filters.to || list.data?.filter.to || "",
  }

  function select(id: string | null) {
    setSelectedId(id)
    setNote("")
    setPendingLoss(false)
    setError(null)
  }

  async function save(decision: Decision) {
    if (!selected || saving) return
    setSaving(true)
    setError(null)
    const failed = await postDecision(selected._id, decision, note)
    setSaving(false)
    if (failed) {
      setError(failed.error)
      if (failed.status === 404) list.reload() // งานกลางคืนแทนที่เหตุการณ์แล้ว
      return
    }
    const updated = events.map((e) => (e._id === selected._id ? { ...e, status: "decided" as const, decision } : e))
    setDecided((prev) => ({ ...prev, [selected._id]: decision }))
    select(nextWaitingId(updated, selected._id))
  }

  function choose(decision: Decision) {
    if (decision === "real_loss") {
      setPendingLoss(true)
      noteRef.current?.focus()
      return
    }
    void save(decision)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const inText = !!target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      const action = keyAction(e.key, inText)
      if (!action) return
      e.preventDefault()
      if (action.type === "next" || action.type === "prev") select(neighbourId(ids, selectedId, action.type === "next" ? 1 : -1))
      else if (action.type === "close") select(null)
      else if (!selectedId) return
      else if (action.type === "note") noteRef.current?.focus()
      else choose(action.decision)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="space-y-4">
      <MorningCard
        date={summary.data?.date ?? null}
        summary={summary.data?.summary ?? null}
        checkFirst={summary.data?.checkFirst ?? []}
        loading={summary.loading}
        onOpen={select}
      />
      {summary.error && (
        <p role="alert" className="text-[14px] text-clay">
          {summary.error}
        </p>
      )}
      <EventFilters
        value={shownFilters}
        onChange={(next) => {
          setFilters(next)
          select(null)
        }}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
        <section aria-label="คิวเหตุการณ์" className="space-y-2">
          <p className="text-[13px] text-muted-ink">
            {list.loading
              ? "กำลังโหลด…"
              : `${events.length} เหตุการณ์ เรียงตามลิตรที่น่าจะหาย${list.data?.truncated ? " (แสดงบางส่วน — ลดช่วงวันที่)" : ""}`}
          </p>
          {list.error && (
            <p role="alert" className="text-[14px] text-clay">
              {list.error}
            </p>
          )}
          {!list.loading && !list.error && events.length === 0 && (
            <p className="rounded-[18px] border border-line bg-surface p-4 text-[14px] text-muted-ink">ไม่มีเหตุการณ์ตามตัวกรองนี้</p>
          )}
          {events.map((e) => (
            <EventCard key={e._id} event={e} selected={e._id === selectedId} onSelect={() => select(e._id)} />
          ))}
        </section>
        {selected ? (
          <div className="fixed inset-0 z-40 overflow-y-auto bg-cream p-4 lg:static lg:z-auto lg:overflow-visible lg:bg-transparent lg:p-0">
            <EventPanel key={selected._id} eventId={selected._id} onClose={() => select(null)}>
              <DecisionBar
                suggestion={selected.suggestion}
                current={selected.decision}
                pendingLoss={pendingLoss}
                note={note}
                saving={saving}
                error={error}
                noteRef={noteRef}
                onChoose={choose}
                onNoteChange={setNote}
                onSaveLoss={() => void save("real_loss")}
              />
            </EventPanel>
          </div>
        ) : (
          <p className="hidden rounded-[22px] border border-dashed border-line p-8 text-center text-[14px] text-muted-ink lg:block">
            เลือกเหตุการณ์ทางซ้าย หรือกด J เพื่อเริ่ม
          </p>
        )}
      </div>
    </div>
  )
}
