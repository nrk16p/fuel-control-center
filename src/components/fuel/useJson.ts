"use client"

import { useCallback, useEffect, useState } from "react"

type State<T> = { key: string | null; data: T | null; error: string | null }

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
    return (body as { error: string }).error
  }
  return `โหลดข้อมูลไม่สำเร็จ (${status})`
}

/** GET JSON จาก /api — url เป็น null = ยังไม่โหลด; ระหว่างโหลดใหม่ยังเห็นข้อมูลชุดก่อน */
export function useJson<T>(url: string | null) {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<State<T>>({ key: null, data: null, error: null })
  const key = url ? `${url}#${tick}` : null

  useEffect(() => {
    if (!url || !key) return
    const controller = new AbortController()
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null)
        if (!res.ok) throw new Error(errorMessage(body, res.status))
        setState({ key, data: body as T, error: null })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState((prev) => ({ key, data: prev.data, error: err instanceof Error ? err.message : String(err) }))
      })
    return () => controller.abort()
  }, [url, key])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    loading: key !== null && state.key !== key,
    reload,
  }
}
