"use client"

import BaseRunModal from "./BaseRunModal"
import { runVehicleMaster } from "@/lib/etlApi"

interface Props {
  open: boolean
  onClose: () => void
  onQueue: (run: () => Promise<{ job_id?: string }>) => void
}

export default function RunVehicleMasterModal({ open, onClose, onQueue }: Props) {
  const handleQueue = () => {
    onQueue(() => runVehicleMaster())
    onClose()
  }

  return (
    <BaseRunModal
      open={open}
      title="🚚 Vehicle Master ETL"
      loading={false}
      onClose={onClose}
      onRun={handleQueue}
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Sync vehicle master data from ATMS → <code>atms.vehiclemaster</code> (full replace).
        </p>
        <p className="text-xs text-gray-400">
          Backend logs in to ATMS automatically — no PHPSESSID needed.
        </p>
      </div>
    </BaseRunModal>
  )
}
