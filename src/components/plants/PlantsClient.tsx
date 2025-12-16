"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/* ================= Types ================= */
export interface Plant {
  _id: string
  client: string
  plant_code: string
  Latitude: number
  Longitude: number
}

/* ================= Config ================= */
const PAGE_SIZE = 20        // 🔒 FIXED 20 ROWS
const ROW_HEIGHT = "h-10"   // row height

export default function PlantsClient() {
  const [plants, setPlants] = useState<Plant[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Plant | null>(null)

  // 🔍 filters
  const [search, setSearch] = useState("")
  const [clientFilter, setClientFilter] = useState("all")

  // 📄 pagination
  const [page, setPage] = useState(1)

  // 📝 form
  const [form, setForm] = useState({
    client: "",
    plant_code: "",
    Latitude: "",
    Longitude: "",
  })

  /* ================= Fetch ================= */
  const loadPlants = async () => {
    const res = await fetch("/api/plants")
    const json = await res.json()
    setPlants(json)
  }

  useEffect(() => {
    loadPlants()
  }, [])

  /* ================= Client list ================= */
  const clients = useMemo(
    () => Array.from(new Set(plants.map((p) => p.client))).sort(),
    [plants]
  )

  /* ================= Summary ================= */
  const summaryByClient = useMemo(() => {
    const map: Record<string, number> = {}
    plants.forEach((p) => {
      map[p.client] = (map[p.client] || 0) + 1
    })
    return map
  }, [plants])

  /* ================= Filter ================= */
  const filteredPlants = useMemo(() => {
    setPage(1)
    return plants.filter((p) => {
      const matchClient =
        clientFilter === "all" || p.client === clientFilter

      const matchSearch =
        p.client.toLowerCase().includes(search.toLowerCase()) ||
        p.plant_code.toLowerCase().includes(search.toLowerCase())

      return matchClient && matchSearch
    })
  }, [plants, search, clientFilter])

  /* ================= Pagination ================= */
  const totalPages = Math.max(
    1,
    Math.ceil(filteredPlants.length / PAGE_SIZE)
  )

  const paginatedPlants = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredPlants.slice(start, start + PAGE_SIZE)
  }, [filteredPlants, page])

  const emptyRowCount = PAGE_SIZE - paginatedPlants.length

  /* ================= Save ================= */
  const handleSave = async () => {
    const payload = {
      client: form.client,
      plant_code: form.plant_code,
      Latitude: Number(form.Latitude),
      Longitude: Number(form.Longitude),
    }

    await fetch("/api/plants", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editing ? { _id: editing._id, ...payload } : payload
      ),
    })

    setOpen(false)
    setEditing(null)
    setForm({ client: "", plant_code: "", Latitude: "", Longitude: "" })
    loadPlants()
  }

  /* ================= Delete ================= */
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this plant?")) return
    await fetch(`/api/plants?id=${id}`, { method: "DELETE" })
    loadPlants()
  }

  /* ================= Edit ================= */
  const openEdit = (p: Plant) => {
    setEditing(p)
    setForm({
      client: p.client,
      plant_code: p.plant_code,
      Latitude: String(p.Latitude),
      Longitude: String(p.Longitude),
    })
    setOpen(true)
  }

  return (
    <>
      {/* 📊 SUMMARY */}
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(summaryByClient).map(([client, count]) => (
          <div
            key={client}
            className="px-4 py-2 bg-gray-100 rounded-lg text-sm"
          >
            🏭 <b>{client}</b> : {count} plants
          </div>
        ))}
      </div>

      {/* 🔍 FILTER BAR */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Input
          placeholder="🔍 Search plant / client"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[260px]"
        />

        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Button onClick={() => setOpen(true)}>➕ Add Plant</Button>
      </div>

      {/* 📋 TABLE (fixed height) */}
      <div className="border rounded-lg overflow-hidden min-h-[820px]">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Client</th>
              <th className="p-2 text-left">Plant</th>
              <th className="p-2">Latitude</th>
              <th className="p-2">Longitude</th>
              <th className="p-2 text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            {paginatedPlants.map((p) => (
              <tr
                key={p._id}
                className={`border-t hover:bg-gray-50 ${ROW_HEIGHT}`}
              >
                <td className="p-2">{p.client}</td>
                <td className="p-2 font-medium">{p.plant_code}</td>
                <td className="p-2 text-center">{p.Latitude}</td>
                <td className="p-2 text-center">{p.Longitude}</td>
                <td className="p-2 text-right space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(p)}
                  >
                    ✏️
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(p._id)}
                  >
                    🗑️
                  </Button>
                </td>
              </tr>
            ))}

            {/* 🧱 EMPTY ROWS TO FIX 20 ROWS */}
            {Array.from({ length: emptyRowCount }).map((_, i) => (
              <tr key={`empty-${i}`} className={`border-t ${ROW_HEIGHT}`}>
                <td className="p-2">&nbsp;</td>
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2" />
                <td className="p-2" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 🔢 PAGINATION */}
      <div className="flex justify-between items-center mt-4 text-sm">
        <div>
          Showing {(page - 1) * PAGE_SIZE + 1}–
          {Math.min(page * PAGE_SIZE, filteredPlants.length)} of{" "}
          {filteredPlants.length}
        </div>

        <div className="flex gap-2 items-center">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            ◀ Prev
          </Button>

          <span>
            Page {page} / {totalPages}
          </span>

          <Button
            size="sm"
            variant="outline"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next ▶
          </Button>
        </div>
      </div>

      {/* 🧾 MODAL */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "✏️ Edit Plant" : "➕ Add Plant"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Client"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
            />
            <Input
              placeholder="Plant Code"
              value={form.plant_code}
              onChange={(e) =>
                setForm({ ...form, plant_code: e.target.value })
              }
            />
            <Input
              placeholder="Latitude"
              value={form.Latitude}
              onChange={(e) =>
                setForm({ ...form, Latitude: e.target.value })
              }
            />
            <Input
              placeholder="Longitude"
              value={form.Longitude}
              onChange={(e) =>
                setForm({ ...form, Longitude: e.target.value })
              }
            />
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
