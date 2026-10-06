"use client"

import { ReactNode } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  open: boolean
  title: string
  loading?: boolean
  onClose: () => void
  onRun: () => void
  /** run button text (default "Run ETL") */
  runLabel?: string
  children: ReactNode
}

export default function BaseRunModal({
  open,
  title,
  loading,
  onClose,
  onRun,
  runLabel = "Run ETL",
  children,
}: Props) {
  if (!open) return null

  return (
    // full-screen on phones, centred card from sm up
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center">
      <div className="bg-white w-full h-full overflow-y-auto sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl shadow-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>

        {children}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onRun} disabled={loading}>
            {loading ? "Running..." : runLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
