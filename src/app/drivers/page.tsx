import DriversClient from "@/components/drivers/DriversProfile"

export default function DriversPage() {
  return (
    <div className="p-6 mx-auto max-w-7xl">
      <h1 className="text-2xl font-bold mb-4">🚚 Driver Management - กลุ่มเสี่ยง</h1>
      <DriversClient />
    </div>
  )
}
