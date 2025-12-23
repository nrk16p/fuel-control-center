"use client"

import { motion, Variants, cubicBezier } from "framer-motion"
import Link from "next/link"

/* --------------------------------
   Enterprise Easing (Type-safe)
-------------------------------- */

const easeOutExpo = cubicBezier(0.16, 1, 0.3, 1)

/* --------------------------------
   Motion Presets
-------------------------------- */

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
    },
  },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: easeOutExpo,
    },
  },
}

// Hover target ONLY (no transition here)
const cardHover = {
  scale: 1.02,
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
}

// Hover transition (type-safe)
const hoverTransition = {
  duration: 0.25,
  ease: easeOutExpo,
}

/* --------------------------------
   Page
-------------------------------- */

export default function HomePage() {
  const modules = [
    {
      title: "🔥 Engine-On",
      nav: "engineon",
      desc: "วิเคราะห์การติดเครื่องเป็นเวลานาน เพื่อควบคุมพฤติกรรมการใช้งานรถ และลดต้นทุนที่ไม่จำเป็น",
    },
    {
      title: "⛽ Fuel Detection",
      nav: "fueldetection",
      desc: "ตรวจจับเหตุการณ์น้ำมันลดผิดปกติ พร้อมระบบบันทึกผลการตรวจสอบที่ตรวจสอบย้อนหลังได้",
    },
    {
      title: "⚙️ Pipeline",
      nav: "pipeline",
      desc: "ระบบประมวลผลข้อมูลอัตโนมัติ เพื่อให้ข้อมูลถูกต้อง ทันเวลา และลดภาระงาน manual",
    },
    {
      title: "🏭 Master Data (Plant)",
      nav: "plants",
      desc: "จัดการข้อมูลสถานที่ปฏิบัติงาน เพื่อเพิ่มความแม่นยำในการวิเคราะห์ และลดความคลาดเคลื่อนของระบบ",
    },
  ]

  return (
    <main className="flex min-h-[80vh] items-center justify-center bg-white px-6">
      <motion.div
        className="mx-auto max-w-3xl text-center"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Title */}
        <motion.h1
          variants={fadeUp}
          className="mb-4 text-4xl font-bold tracking-tight text-blue-600"
        >
          ⛽ Fuel Control Center
        </motion.h1>

        {/* Executive Intro */}
        <motion.p
          variants={fadeUp}
          className="mx-auto mb-12 max-w-2xl text-base leading-relaxed text-gray-600"
        >
          ระบบศูนย์กลางสำหรับ{" "}
          <span className="font-medium">ตรวจสอบ ควบคุม และวิเคราะห์</span>{" "}
          การใช้น้ำมันและพฤติกรรมการใช้งานรถ
          เพื่อช่วยให้องค์กรลดต้นทุน เพิ่มประสิทธิภาพ
          และตัดสินใจได้จากข้อมูลจริงอย่างโปร่งใส
        </motion.p>

        {/* Modules */}
        <motion.div
          variants={container}
          className="grid gap-5 text-left sm:grid-cols-2"
        >
          {modules.map((m) => (
            <Link key={m.title} href={`/${m.nav}`}>
              <motion.div
                variants={fadeUp}
                whileHover={cardHover}
                transition={hoverTransition}
                className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="mb-2 text-base font-semibold">{m.title}</div>
                <p className="text-sm leading-relaxed text-gray-500">{m.desc}</p>
              </motion.div>
            </Link>
          ))}
        </motion.div>

        {/* Executive Closing */}
        <motion.p
          variants={fadeUp}
          className="mt-12 text-xs leading-relaxed text-gray-400"
        >
          Fuel Control Center คือเครื่องมือ
          สร้างมาตรฐานการทำงาน
          และขับเคลื่อนองค์กรด้วยข้อมูลจริง
        </motion.p>
      </motion.div>
    </main>
  )
}
