"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import EngineonDetailClient, { type RawEngineonData } from "@/components/engineon/EngineonDetailClient"

type LivePayload = { events: RawEngineonData[]; points: number; limit_per_min: number }
type State =
  | { kind: "loading" }
  | { kind: "ready"; data: LivePayload }
  | { kind: "limited"; reason: "ours" | "besttech"; until: number; limit: number }
  | { kind: "failed" }

const cacheKey = (id: string) => `besttech-engineon:${id}`

function readCache(id: string): LivePayload | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(id))
    return raw ? (JSON.parse(raw) as LivePayload) : null
  } catch {
    return null
  }
}

function writeCache(id: string, data: LivePayload) {
  try {
    sessionStorage.setItem(cacheKey(id), JSON.stringify(data))
  } catch {
    // storage blocked — the page still works, a refresh just calls Besttech again
  }
}

export default function BesttechLiveDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" })
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (useCache = false) => {
    const cached = useCache ? readCache(id) : null
    if (cached) {
      setState({ kind: "ready", data: cached })
      return
    }
    setState({ kind: "loading" })
    try {
      const res = await fetch(`/api/engineon/besttech?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      const body = await res.json()
      if (res.status === 429) {
        setState({
          kind: "limited", reason: body.reason === "besttech" ? "besttech" : "ours",
          until: Date.now() + (Number(body.retry_after_s) || 60) * 1000, limit: Number(body.limit_per_min) || 5,
        })
        return
      }
      if (!res.ok) {
        setState({ kind: "failed" })
        return
      }
      writeCache(id, body)
      setState({ kind: "ready", data: body })
    } catch {
      setState({ kind: "failed" })
    }
  }, [id])

  useEffect(() => {
    // deferred one tick: React dev mode mounts twice, and the cleanup stops the first call
    // from spending one of the 5 shared Besttech calls
    const t = setTimeout(() => load(true), 0)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    if (state.kind !== "limited") return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [state.kind])

  const notice = (
    <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
      รถคันนี้ใช้ GPS Besttech ข้อมูลดึงสดทุกครั้งที่เปิด ทั้งระบบดึงได้ไม่เกิน 5 ครั้งต่อนาที
    </p>
  )

  if (state.kind === "ready") {
    if (!state.data.events.length) {
      return (
        <Centered>
          {notice}
          <p className="mt-4 text-gray-600">
            วันนี้รถคันนี้ไม่มีช่วงจอดติดเครื่อง (Besttech ส่งจุดมา {state.data.points.toLocaleString()} จุด)
          </p>
          <BackLink />
        </Centered>
      )
    }
    return <EngineonDetailClient events={state.data.events} sourceLabel="Besttech · สด" notice={notice} />
  }

  if (state.kind === "limited") {
    const left = Math.max(0, Math.ceil((state.until - now) / 1000))
    return (
      <Centered>
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.reason === "ours"
            ? `นาทีนี้ดึงข้อมูล Besttech ครบ ${state.limit} ครั้งแล้ว (นับรวมทุกคนที่เปิดหน้านี้)`
            : "Besttech ยังไม่ให้ดึงข้อมูลตอนนี้ เพราะมีงานอื่นดึงอยู่"}
          <br />
          {left > 0 ? `รออีก ${left} วินาทีแล้วกดลองใหม่` : "กดลองใหม่ได้เลย"}
        </div>
        <button
          onClick={() => load()}
          disabled={left > 0}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          ลองใหม่
        </button>
        <BackLink />
      </Centered>
    )
  }

  if (state.kind === "failed") {
    return (
      <Centered>
        <p className="text-red-600">ดึงข้อมูลจาก Besttech ไม่สำเร็จ ลองใหม่อีกครั้ง</p>
        <button onClick={() => load()} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white">ลองใหม่</button>
        <BackLink />
      </Centered>
    )
  }

  return (
    <Centered>
      {notice}
      <p className="mt-4 text-gray-500">กำลังดึงข้อมูลจาก Besttech…</p>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">{children}</div>
}

function BackLink() {
  return <Link href="/engineon" className="mt-6 text-sm text-blue-600 hover:underline">← กลับไปหน้าตาราง</Link>
}
