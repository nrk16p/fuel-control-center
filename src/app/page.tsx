// src/app/page.tsx

"use client"

import { motion } from "framer-motion"

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
}

export default function HomePage() {
  return (
    <main className="flex min-h-[80vh] items-center justify-center px-6">
      <motion.div
        className="mx-auto max-w-3xl text-center"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Title */}
        <motion.h1
          variants={item}
          className="mb-4 text-4xl font-bold text-blue-600"
        >
          ⛽ Fuel Control Center
        </motion.h1>

        {/* Executive Intro */}
        <motion.p
          variants={item}
          className="mx-auto mb-10 text-base leading-relaxed text-gray-600"
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
          className="grid gap-4 text-left sm:grid-cols-2"
        >
          <motion.div variants={item} className="rounded-lg border p-4">
            <div className="mb-1 font-medium">🔥 Engine-On</div>
            <p className="text-sm text-gray-500">
              วิเคราะห์การติดเครื่องเป็นเวลานาน
              แยกพฤติกรรมการใช้งานที่ก่อให้เกิดต้นทุนแฝง
            </p>
          </motion.div>

          <motion.div variants={item} className="rounded-lg border p-4">
            <div className="mb-1 font-medium">⛽ Fuel Detection</div>
            <p className="text-sm text-gray-500">
              ตรวจจับเหตุการณ์น้ำมันลดผิดปกติ
              พร้อมระบบบันทึกผลการตรวจสอบอย่างเป็นธรรม
            </p>
          </motion.div>

          <motion.div variants={item} className="rounded-lg border p-4">
            <div className="mb-1 font-medium">⚙️ Pipeline</div>
            <p className="text-sm text-gray-500">
              ระบบประมวลผลข้อมูลอัตโนมัติ
              เพื่อให้ข้อมูลมีความถูกต้องและทันเวลา
            </p>
          </motion.div>

          <motion.div variants={item} className="rounded-lg border p-4">
            <div className="mb-1 font-medium">🏭 Master Data (Plant)</div>
            <p className="text-sm text-gray-500">
              จัดการข้อมูลสถานที่ปฏิบัติงาน
              เพื่อเพิ่มความแม่นยำในการวิเคราะห์ทั้งระบบ
            </p>
          </motion.div>
        </motion.div>

        {/* Executive Note */}
        <motion.p
          variants={item}
          className="mt-10 text-xs text-gray-400"
        >
          💡 Fuel Control Center ไม่ใช่แค่ระบบดูข้อมูล
          แต่เป็นเครื่องมือช่วยผู้บริหาร
          ควบคุมต้นทุนและยกระดับมาตรฐานการทำงานด้วยข้อมูลจริง
        </motion.p>
      </motion.div>
    </main>
  )
}
