import clientPromise from "@/lib/mongodb"

/** analytics DB (การเชื่อมต่อเดียวกับทั้งแอป) */
export async function analytics() {
  return (await clientPromise).db("analytics")
}

/** โหมดตัวอย่าง: FUEL_FIXTURES=1 ตอน dev ทำให้ /api/fuel/* อ่าน JSON แทน fuel_events / fuel_daily_summary — ไม่เขียนอะไรเลย */
export const fixturesOn = () => process.env.NODE_ENV !== "production" && process.env.FUEL_FIXTURES === "1"
