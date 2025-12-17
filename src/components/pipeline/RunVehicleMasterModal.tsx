"use client"

import { useState } from "react"
import BaseRunModal from "./BaseRunModal"
import { runVehicleMaster } from "@/lib/etlApi"

interface Props {
  open: boolean
  onClose: () => void
  onQueue: (run: () => Promise<{ job_id?: string }>) => void
}

export default function RunVehicleMasterModal({ open, onClose, onQueue }: Props) {
  const [phpsessid, setPhpsessid] = useState("nn0jiufk4njcd956rovb0isk8u")
  const [baseUrl, setBaseUrl] = useState(
    "https://www.mena-atms.com/veh/vehicle/index.export/?page=1&order_by=v.code%20asc&search-toggle-status=&order_by=v.code%20asc"
  )
  const [dbName, setDbName] = useState("atms")
  const [collectionName, setCollectionName] = useState("vehiclemaster")

  const handleQueue = () => {
    onQueue(() =>
      runVehicleMaster({
        phpsessid,
        base_url: baseUrl,
        db_name: dbName,
        collection_name: collectionName,
      })
    )
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
        <p className="text-sm text-gray-600">Sync vehicle master data from ATMS.</p>

        <div>
          <label className="text-sm font-medium">phpsessid</label>
          <input
            value={phpsessid}
            onChange={(e) => setPhpsessid(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium">base_url</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">db_name</label>
            <input
              value={dbName}
              onChange={(e) => setDbName(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">collection_name</label>
            <input
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    </BaseRunModal>
  )
}
