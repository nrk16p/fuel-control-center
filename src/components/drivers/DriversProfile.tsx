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
import Swal from "sweetalert2"
/* ================= Types ================= */
export interface Driver {
  _id: string
  truckno: string
  plateh: string
  update: string
  status: string
  driver: string
  updated_at: any
}

/* ================= Config ================= */
const PAGE_SIZE = 20        // 🔒 FIXED 20 ROWS
const ROW_HEIGHT = "h-10"   // row height

export default function DriverProfile() {
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
  const thismonth = months[new Date().getMonth()]
  const years = [2025, 2026]
  const thisyear = years[new Date().getFullYear() - 2025]
  /* ================= State ================= */
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [activeYear, setActiveYear] = useState(thisyear)
  const [activeMonth, setActiveMonth] = useState(thismonth)
  const [useractive, setUseractive] = useState<string[]>([])

  // 🔍 filters
  const [search, setSearch] = useState("")
  const [clientFilter, setClientFilter] = useState("all")

  // 📄 pagination
  const [page, setPage] = useState(1)

  // 📝 form
  const [form, setForm] = useState({
    truckno: "",
    plateh: "",
    update: "",
    status: "",
    driver: "",
  })

  /* ================= Fetch ================= */
  const loadDrivers = async (month: string, year: number) => {
    const params = new URLSearchParams({
      month: String(months.indexOf(month) + 1),
      year: String(year),
    })

    console.log("Fetching drivers with params:", params.toString())

    const res = await fetch(`/api/drivers?${params.toString()}`)
    const json = await res.json()

    console.log("drivers:", json)
    setDrivers(json)
  }
 
  useEffect(() => {   
    if (!activeMonth || !activeYear) return  /* โหลดครั้งแรก + เมื่อเดือน/ปีเปลี่ยน */
    loadDrivers(activeMonth, activeYear)
  }, [activeMonth, activeYear])

  /* ================= Nav Change ================= */
  const handleNavChange = (type: string, value: string) => {
    console.log("Nav change:", type, value)

    if (type === "month") {
      setActiveMonth(value)
    } else if (type === "year") {
      setActiveYear(Number(value))
    }
  }


  /* ================= Filter ================= */
  const filteredDriver = useMemo(() => {
    setPage(1)
    return drivers.filter((p) => {

      const matchSearch =
        p.driver.toLowerCase().includes(search.toLowerCase()) ||
        p.plateh.toLowerCase().includes(search.toLowerCase())

      return matchSearch
    })
  }, [drivers, search, clientFilter])

  /* ================= Pagination ================= */
  const totalPages = Math.max(
    1,
    Math.ceil(filteredDriver.length / PAGE_SIZE)
  )

  const paginatedDrivers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredDriver.slice(start, start + PAGE_SIZE)
  }, [filteredDriver, page])

  const emptyRowCount = PAGE_SIZE - paginatedDrivers.length

  /* ================= Save ================= */
  const handleSave = async () => {

    console.log("payload : ", useractive, months.indexOf(activeMonth) + 1, activeYear)

   const res = await fetch("/api/drivers", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editing ? { _id: editing._id, ...form } : {driver: useractive ,month: months.indexOf(activeMonth) + 1, year: activeYear}
      ),
    })

    if (!res.ok) {
      alert("Failed to save driver")
      return
    }

    setOpen(false)
    setEditing(null)
    setForm({ truckno: "", plateh: "", update: "", status: "", driver: "" })
  }

  /* ================= Delete ================= */
  const handleDelete = async (id: string) => {
    if (!confirm("ต้องการลบรายการกลุ่มเสี่ยงนี้ หรือไม่?")) return
    await fetch(`/api/plants?id=${id}`, { method: "DELETE" })
    setDrivers(drivers.filter((p) => p._id !== id))
    Swal.fire({
      title: "ลบรายการสำเร็จ!",
      icon: "success",
      draggable: true
    });
  }

  /* ================= Edit ================= */
  // const openEdit = (p: Driver) => {
  //   setEditing(p)
  //   setForm({
  //     truckno: p.truckno,
  //     plateh: p.plateh,
  //     update: String(p.update),
  //     status: String(p.status),
  //     driver: p.driver,
  //   })
  //   setOpen(true)
  // }

  const handleProcess = (value: string) => {
  const entries = value.match(/[\u0E00-\u0E7F]+ [\u0E00-\u0E7F]+/g) || []

  console.log(entries)
  setUseractive(entries)
}

  const closeModal = () => {
    setOpen(false)
    setUseractive([])
  }



  return (
    <>
      <div className="relative flex flex-wrap rounded-lg bg-gray-200 p-1 lg:w-1/2 mb-5 text-sm shadow-sm">
        {years.map((year) => (
          <label className="flex-1 text-center cursor-pointer">
            <input
              type="radio"
              name="viewType"
              value={year}
              checked={activeYear === year}
              onChange={() => handleNavChange("year", String(year))}
              className="hidden"
            />
            <span className={`flex items-center justify-center gap-2 rounded-md border-none py-2 px-4 transition-all duration-150 ease-in-out ${activeYear === year
                ? 'bg-white font-semibold text-slate-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-700'
              }`}>
              {/* <Table size={16} /> */}
              <span>{year}</span>
            </span>
          </label>
        ))}
      </div>
      {/* MONTHS */}
      <div className="relative flex flex-wrap rounded-lg bg-gray-200 p-1 lg:w-full mb-5 text-sm shadow-sm">
        {months.map((month) => (
          <label className="flex-1 text-center cursor-pointer">
            <input
              type="radio"
              name="viewType"
              value={month}
              checked={activeMonth === month}
              onChange={() => handleNavChange("month", month)}
              className="hidden"
            />
            <span className={`flex items-center justify-center gap-2 rounded-md border-none py-2 px-4 transition-all duration-150 ease-in-out ${activeMonth === month
                ? 'bg-white font-semibold text-slate-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-700'
              }`}>
              {/* <Table size={16} /> */}
              <span>{month}</span>
            </span>
          </label>
        ))}
      </div>




      {/* 🔍 FILTER BAR */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Input
          placeholder="🔍 Search driver / plate-h"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />

        <div className="flex-1" />

        <Button onClick={() => setOpen(true)}>➕ Upload Drivers</Button>
      </div>

      {/* 📋 TABLE (fixed height) */}
      <div className="border rounded-lg overflow-hidden min-h-130">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Truck No.</th>
              <th className="p-2 text-left">Plate-H</th>
              <th className="p-2">Driver</th>
              <th className="p-2">Update</th>
              <th className="p-2 text-right">Actions</th>

            </tr>
          </thead>

          <tbody>
            { filteredDriver.map((p) => (
              <tr
                key={p._id}
                className={`border-t hover:bg-gray-50 ${ROW_HEIGHT}`}
              >
                <td className="p-2">{p.truckno}</td>
                <td className="p-2 font-medium">{p.plateh}</td>
                <td className="p-2 text-center">{p.driver}</td>
                <td className="p-2 text-center">{new Date(p.updated_at).toLocaleDateString()}</td>
                <td className="p-2 text-right space-x-2">
                  {/* <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(p)}
                  >
                    ✏️
                  </Button> */}
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
          {Math.min(page * PAGE_SIZE, filteredDriver.length)} of{" "}
          {filteredDriver.length}
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
      <Dialog open={open} onOpenChange={closeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "✏️ Edit Plant" : "➕ Add Drivers"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
              {useractive.length === 0 ? (
                <Input
                  onChange={(e) => handleProcess(e.target.value)}
                  placeholder="วางรายชื่อที่นี่"
                />
              ) : (
                <div className="h-100 overflow-y-auto space-y-3">
                  {useractive.map((user, index) => (
                    <Input
                      key={index}
                      value={user}
                      onChange={(e) => {
                        const updated = [...useractive]
                        updated[index] = e.target.value
                        setUseractive(updated)
                      }}
                    />
                  ))}
              </div>
              )}
            </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
