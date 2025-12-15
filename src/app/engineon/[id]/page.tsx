import { notFound } from "next/navigation"
import EngineonDetailClient from "@/components/engineon/EngineonDetailClient"

export const revalidate = 0

interface RawEngineonData {
  _id: string
  date: string
  count_records: number
  total_engine_on_hr: number
  total_engine_on_min: number
  version_type: string
  ทะเบียนพาหนะ: string
  สถานที่?: string
  start_time?: string
  end_time?: string
  lat?: number
  lng?: number
  event_id?: number
  nearest_plant?: string | null
}

export default async function EngineonDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const { id } = await Promise.resolve(params)

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")

  const res = await fetch(`${baseUrl}/api/raw-engineon?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  })

  if (!res.ok) return notFound()

  const payload = await res.json()
  const events: RawEngineonData[] = Array.isArray(payload)
    ? payload
    : payload
    ? [payload]
    : []

  if (!events.length) return notFound()

  // Sort newest first (_3 → _1)
  const sorted = [...events].sort((a, b) => {
    const getSuffix = (id: string) => parseInt(id.split("_").pop() || "0") || 0
    return getSuffix(b._id) - getSuffix(a._id)
  })

  return <EngineonDetailClient events={sorted} />
}
