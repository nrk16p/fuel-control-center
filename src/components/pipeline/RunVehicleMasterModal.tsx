"use client"

import BaseRunModal from "./BaseRunModal"
import { runVehicleMaster } from "@/lib/etlApi"

interface Props {
  open: boolean
  onClose: () => void
  // ✅ ส่ง function กลับไป
  onRun: (run: () => Promise<{ job_id?: string }>) => void
}

export default function RunVehicleMasterModal({
  open,
  onClose,
  onRun,
}: Props) {
  const handleConfirm = () => {
    // ✅ ส่ง function ให้ Page (ยังไม่ run)
    onRun(() =>
      runVehicleMaster({
        phpsessid: "nn0jiufk4njcd956rovb0isk8u",
        base_url:
          "https://www.mena-atms.com/veh/vehicle/index.export/?page=1&order_by=v.code%20asc&search-toggle-status=&order_by=v.code%20asc",
        db_name: "atms",
        collection_name: "vehiclemaster",
      })
    )

    onClose()
  }

  return (
    <BaseRunModal
      open={open}
      title="🚚 Vehicle Master ETL"
      onClose={onClose}
      onRun={handleConfirm}
    >
      <p className="text-sm text-gray-600">
        This ETL will sync all vehicle master data from ATMS.
      </p>
    </BaseRunModal>
  )
}
