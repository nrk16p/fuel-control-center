import EngineonMap from "@/components/engineon/EngineonMap"

export default async function EngineonMapPage() {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")

  const res = await fetch(`${baseUrl}/api/raw-engineon?date=01/12/2025`, {
    cache: "no-store",
  })

  if (!res.ok) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        ❌ Failed to load data ({res.status})
      </div>
    )
  }

  const data = await res.json()

  return (
    <div className="h-[calc(100vh-80px)]">
      <EngineonMap
        events={data}
        activeId={null}
        hoverId={null}  
      />
    </div>
  )
}
