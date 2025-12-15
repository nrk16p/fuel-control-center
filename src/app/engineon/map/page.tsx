import EngineonMap from "@/components/engineon/EngineonMap"

export default async function EngineonMapPage() {
  // fetch all raw_engineon docs for a date (example)
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")

  const res = await fetch(`${baseUrl}/api/raw-engineon?date=01/12/2025`, {
    cache: "no-store",
  })
  const data = await res.json()

  return (
    <div className="h-[calc(100vh-80px)]">
      <EngineonMap data={data} />
    </div>
  )
}
