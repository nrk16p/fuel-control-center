import PlantsClient from "@/components/plants/PlantsClient"

export default function PlantsPage() {
  return (
    <div className="p-6 mx-auto max-w-7xl">
      <h1 className="text-2xl font-bold mb-4">🏭 Plant Management</h1>
      <PlantsClient />
    </div>
  )
}
