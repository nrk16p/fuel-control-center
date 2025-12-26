import { useEffect, useRef, useState } from "react"

interface PlateDropdownProps {
  plateList: string[]
  value: string
  onChange: (value: string) => void
}

const PlateDropdown = ({
  plateList,
  value,
  onChange,
}: PlateDropdownProps) => {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filteredPlates = plateList.filter((plate) =>
    plate.toLowerCase().includes(value.toLowerCase())
  )

  /* close when click outside */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className="relative w-56">
      <label className="mb-1 block text-xs text-gray-500">Plate (Dropdown สำหรับกลุ่มเสี่ยง)</label>

      <input
        className="h-9 w-full rounded-md border px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)   // ✅ ยิงค่ากลับ parent
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="71-8623"
      />

      {open && filteredPlates.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-white text-sm shadow-md">
          {filteredPlates.map((plate, index) => (
            <li
              key={index}
              className="cursor-pointer px-2 py-1 hover:bg-blue-50"
              onClick={() => {
                onChange(plate)     // ✅ เลือก → setPlateDriver
                setOpen(false)
              }}
            >
              {plate}
            </li>
          ))}
        </ul>
      )}

      {open && filteredPlates.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-white px-2 py-1 text-xs text-gray-400">
          ไม่พบทะเบียนกลุ่มเสี่ยง <a href="/drivers" className="text-blue-600">(คลิกเพื่อเพิ่ม)</a>
        </div>
      )}
    </div>
  )
}

export default PlateDropdown
