"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { motion, Variants, cubicBezier } from "framer-motion"
import {
  Droplet,
  Factory,
  FileText,
  Flame,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  Route,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react"
import { HeroStats } from "@/components/home/HeroStats"
import { PlantPot } from "@/components/home/PlantPot"

const easeOutExpo = cubicBezier(0.16, 1, 0.3, 1)

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
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

type Module = {
  title: string
  href: string
  desc: string
  value: string
  icon: LucideIcon
}

const MODULES: Module[] = [
  {
    title: "Engine-On Control",
    href: "/engineon",
    desc: "ควบคุมพฤติกรรมการติดเครื่องยนต์ ลดการสูญเสียน้ำมัน",
    value: "ลดต้นทุนเชื้อเพลิง",
    icon: Flame,
  },
  {
    title: "Fuel Detection",
    href: "/fueldetection",
    desc: "ตรวจจับน้ำมันลดผิดปกติ พร้อม workflow ตรวจสอบ",
    value: "ตรวจสอบย้อนหลังได้",
    icon: Droplet,
  },
  {
    title: "SmartDistance",
    href: "/smartdistance",
    desc: "ตัดสินระยะทางจากหลายแหล่งข้อมูลอย่างเป็นธรรม",
    value: "Decision Engine",
    icon: Route,
  },
  {
    title: "OverSpeed",
    href: "/overspeed",
    desc: "ระบบดึงข้อมูลตรวจจับความเร็วรถเกินกำหนด",
    value: "ตรวจจับความเร็วรถ",
    icon: Gauge,
  },
  {
    title: "Master Data",
    href: "/plants",
    desc: "ข้อมูลอ้างอิงกลางสำหรับ Plant และกลุ่มเสี่ยง",
    value: "Single Source of Truth",
    icon: Factory,
  },
  {
    title: "Data Pipeline",
    href: "/pipeline",
    desc: "ระบบประมวลผลข้อมูลอัตโนมัติ",
    value: "ฐานข้อมูล",
    icon: RefreshCw,
  },
  {
    title: "Dashboard",
    href: "/dashboard",
    desc: "ภาพรวมความเสี่ยงรถและเหตุน้ำมันผิดปกติในหน้าเดียว",
    value: "เห็นภาพรวมทั้งกอง",
    icon: LayoutDashboard,
  },
  {
    title: "Drivers",
    href: "/drivers",
    desc: "จัดการข้อมูลพนักงานขับรถกลุ่มเสี่ยง",
    value: "ติดตามรายบุคคล",
    icon: Users,
  },
  {
    title: "Docs",
    href: "/docs",
    desc: "อธิบายว่าระบบคำนวณและตัดสินแต่ละตัวเลขอย่างไร",
    value: "โปร่งใส ตรวจสอบได้",
    icon: FileText,
  },
]

// เวลาปัจจุบันแบบปัดเป็นนาที — ฝั่ง server คืน null เพื่อไม่ให้ hydration ไม่ตรง
const subscribeMinute = (cb: () => void) => {
  const id = setInterval(cb, 30_000)
  return () => clearInterval(id)
}
const getMinute = () => Math.floor(Date.now() / 60_000)
const getServerMinute = () => null

function greetingFor(hour: number) {
  if (hour < 12) return "สวัสดีตอนเช้า"
  if (hour < 17) return "สวัสดีตอนบ่าย"
  return "สวัสดีตอนเย็น"
}

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"

function HeaderSearch() {
  const router = useRouter()
  const [q, setQ] = useState("")

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        const plate = q.trim()
        if (plate) router.push(`/fueldetection?plate=${encodeURIComponent(plate)}`)
      }}
      className="relative w-full sm:w-[280px]"
    >
      <label htmlFor="global-search" className="sr-only">
        ค้นหาทะเบียนรถ
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-muted-ink"
        aria-hidden
      />
      <input
        id="global-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาทะเบียน คนขับ…"
        className="h-11 w-full rounded-[14px] border border-line-input bg-surface pr-4 pl-10 text-[15px] text-ink placeholder:text-muted-ink focus-visible:border-forest focus-visible:ring-2 focus-visible:ring-forest/30 focus-visible:outline-none"
      />
    </form>
  )
}

export default function HomePage() {
  const { data: session } = useSession()
  const minute = useSyncExternalStore(subscribeMinute, getMinute, getServerMinute)
  const now = minute === null ? null : new Date(minute * 60_000)

  const dateText = now?.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "gregory", // ค.ศ. ตามดีไซน์
  })
  const firstName = session?.user?.name?.trim().split(/\s+/)[0]

  return (
    <motion.div
      className="mx-auto flex max-w-[1200px] flex-col gap-[22px]"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.header variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="min-h-5 text-[14px] text-muted-ink">{dateText}</p>
          <h1 className="font-display text-[30px] leading-tight font-semibold text-ink">หน้าแรก</h1>
        </div>
        <HeaderSearch />
      </motion.header>

      {/* Hero */}
      <motion.section
        variants={fadeUp}
        aria-labelledby="hero-greeting"
        className="flex items-center gap-6 rounded-[26px] bg-moss px-5 py-6 sm:px-8 sm:py-7"
      >
        <div className="min-w-0 flex-1">
          <h2
            id="hero-greeting"
            className="min-h-[42px] font-display text-[28px] leading-tight font-semibold text-forest-dark sm:text-[34px]"
          >
            {now ? greetingFor(now.getHours()) : ""}
            {now && firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="mt-2 max-w-[480px] text-[16px] leading-relaxed text-body">
            ศูนย์กลางข้อมูลเพื่อควบคุมต้นทุน ตรวจสอบย้อนหลังได้ และตัดสินใจจากข้อมูลจริง
          </p>
          <div className="mt-5">
            <HeroStats />
          </div>
        </div>
        <PlantPot className="hidden shrink-0 lg:block" />
      </motion.section>

      {/* Modules */}
      <section aria-labelledby="modules-heading" className="flex flex-col gap-4">
        <motion.div variants={fadeUp} className="flex items-baseline justify-between">
          <h2 id="modules-heading" className="text-[20px] font-semibold text-ink">
            โมดูลทั้งหมด
          </h2>
          <span className="text-[13px] text-muted-ink">{MODULES.length} โมดูล</span>
        </motion.div>

        <motion.ul variants={container} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(({ title, href, desc, value, icon: Icon }) => (
            <motion.li key={title} variants={fadeUp}>
              <Link
                href={href}
                className={`flex h-full gap-3.5 rounded-[22px] border border-line bg-surface p-[18px] shadow-[0_2px_0_var(--line)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#D6CDB6] ${focusRing}`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-mint">
                  <Icon className="h-[22px] w-[22px] text-forest" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[17px] font-semibold text-ink">{title}</span>
                  <span className="mt-1 text-[14px] leading-normal text-muted-ink">{desc}</span>
                  <span className="mt-2 text-[13px] font-medium text-forest">
                    {value} <span aria-hidden>→</span>
                  </span>
                </span>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      </section>
    </motion.div>
  )
}
