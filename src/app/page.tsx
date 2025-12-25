"use client"

import { motion, Variants, cubicBezier } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const easeOutExpo = cubicBezier(0.16, 1, 0.3, 1)

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: easeOutExpo },
  },
}

export default function HomePage() {
  const modules = [
    {
      title: "🔥 Engine-On Control",
      nav: "engineon",
      primary: true,
      desc: "ควบคุมพฤติกรรมการติดเครื่องยนต์ ลดการสูญเสียน้ำมัน",
      value: "ลดต้นทุนเชื้อเพลิง",
    },
    {
      title: "⛽ Fuel Detection",
      nav: "fueldetection",
      desc: "ตรวจจับน้ำมันลดผิดปกติ พร้อม workflow ตรวจสอบ",
      value: "ตรวจสอบย้อนหลังได้",
    },
    {
      title: "📏 SmartDistance",
      nav: "smartdistance",
      desc: "ตัดสินระยะทางจากหลายแหล่งข้อมูลอย่างเป็นธรรม",
      value: "ลดค่าเที่ยวเกินจริง",
      badge: "Decision Engine",
    },
    {
      title: "🏭 Master Data",
      nav: "masterdata",
      desc: "ข้อมูลอ้างอิงกลางสำหรับ Plant และกลุ่มเสี่ยง",
      value: "Single Source of Truth",
    },
    {
      title: "⚙️ Data Pipeline",
      nav: "pipeline",
      desc: "ระบบประมวลผลข้อมูลอัตโนมัติ",
      value: "ข้อมูลทันเวลา",
    },
  ]

  return (
    <main className="flex min-h-[80vh] items-center justify-center bg-white px-6">
      <motion.div
        className="mx-auto max-w-5xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={fadeUp} className="mb-10 text-center">
          <h1 className="mb-3 text-4xl font-bold text-blue-600">
            Fuel Control Center
          </h1>
          <p className="mx-auto max-w-2xl text-gray-600">
            ศูนย์กลางข้อมูลเพื่อควบคุมต้นทุน
            ตรวจสอบย้อนหลังได้
            และตัดสินใจจากข้อมูลจริง
          </p>
        </motion.div>

        {/* Modules */}
        <motion.div
          variants={container}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {modules.map((m) => (
            <Link key={m.title} href={`/${m.nav}`}>
              <motion.div
                variants={fadeUp}
                whileHover={{
                  scale: 1.02,
                  boxShadow: "0 14px 36px rgba(0,0,0,0.08)",
                }}
                className={`rounded-xl border p-6 cursor-pointer
                  ${m.primary
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white"}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="text-base font-semibold">{m.title}</div>
                  {m.badge && <Badge variant="secondary">{m.badge}</Badge>}
                </div>

                <p className="mb-3 text-sm text-gray-600">{m.desc}</p>

                <div className="mb-4 text-xs text-gray-500">
                  🎯 {m.value}
                </div>

                <Button size="sm" variant={m.primary ? "default" : "outline"}>
                  เปิดใช้งาน
                </Button>
              </motion.div>
            </Link>
          ))}
        </motion.div>

        {/* Closing */}
        <motion.p
          variants={fadeUp}
          className="mt-12 text-center text-xs text-gray-400"
        >
          ข้อมูลที่เชื่อถือได้ คือรากฐานของการบริหารต้นทุนอย่างยั่งยืน
        </motion.p>
      </motion.div>
    </main>
  )
}
