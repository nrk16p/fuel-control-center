"use client"

import { Construction, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function DashboardPage() {
  return (
    <main className="flex min-h-[80vh] items-center justify-center p-6">
      <Card className="max-w-md w-full text-center shadow-lg">
        <CardContent className="p-8 space-y-4">
          <div className="flex justify-center">
            <Construction className="h-12 w-12 text-yellow-500" />
          </div>

          <h1 className="text-2xl font-bold">
            🚧 Under Construction
          </h1>

          <p className="text-gray-500">
            This dashboard is currently being improved.
            <br />
            Please check back soon.
          </p>

          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Data pipeline & KPI logic in progress
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
