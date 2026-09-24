"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import {
  Droplet,
  Factory,
  FileText,
  Flame,
  Gauge,
  House,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  RefreshCw,
  Route,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"

type NavItem = { label: string; href: string; icon: LucideIcon }

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "ภาพรวม",
    items: [
      { label: "หน้าแรก", href: "/", icon: House },
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { label: "Fuel Detection", href: "/fueldetection", icon: Droplet },
      { label: "Engine-On", href: "/engineon", icon: Flame },
      { label: "OverSpeed", href: "/overspeed", icon: Gauge },
      { label: "SmartDistance", href: "/smartdistance", icon: Route },
      { label: "Pipeline", href: "/pipeline", icon: RefreshCw },
    ],
  },
  {
    title: "MASTER DATA",
    items: [
      { label: "Plants", href: "/plants", icon: Factory },
      { label: "Drivers", href: "/drivers", icon: Users },
      { label: "Docs", href: "/docs", icon: FileText },
    ],
  },
]

// "/" ต้องตรงเป๊ะ — หน้าอื่นนับ sub-route ด้วย (เช่น /engineon/* = Engine-On)
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-forest"

function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className={`flex items-center gap-3 rounded-[12px] ${focusRing}`}>
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] bg-cream">
        <Leaf className="h-5 w-5 text-forest" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[17px] font-semibold text-cream">Fuel Control</span>
        <span className="block text-[13px] text-[#CFE0D4]">Center</span>
      </span>
    </Link>
  )
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user
  const initial = (user?.name ?? user?.email ?? "?").trim().charAt(0).toUpperCase()

  return (
    <div className="flex h-full flex-col gap-[22px] px-[14px] pt-6 pb-5">
      <div className="px-1">
        <Logo onNavigate={onNavigate} />
      </div>

      <nav aria-label="เมนูหลัก" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-3 text-[12px] tracking-[0.06em] text-[#C4D8CA]">{group.title}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(pathname, href)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-[12px] px-3 py-[9px] text-[15px] transition-colors ${focusRing} ${
                        active
                          ? "bg-cream font-semibold text-forest"
                          : "text-[#DDE8E0] hover:bg-[rgba(255,253,247,0.08)]"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {user?.email && (
        <div className="flex items-center gap-3 rounded-[14px] bg-[rgba(255,253,247,0.08)] px-3 py-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-butter text-sm font-semibold text-ink"
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-cream">{user.name ?? user.email}</p>
            <p className="truncate text-[12px] text-[#C4D8CA]" title={user.email}>
              {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#DDE8E0] hover:bg-[rgba(255,253,247,0.12)] ${focusRing}`}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Esc ปิด + ล็อก scroll + โฟกัสปุ่มปิด
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 bg-forest lg:block">
        <SidebarBody />
      </aside>

      {/* Mobile / tablet top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between bg-forest px-4 py-3 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          aria-expanded={open}
          aria-controls="mobile-sidebar"
          className={`flex h-11 w-11 items-center justify-center rounded-[14px] text-cream hover:bg-[rgba(255,253,247,0.08)] ${focusRing}`}
        >
          <Menu className="h-6 w-6" aria-hidden />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            id="mobile-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label="เมนูหลัก"
            className="relative h-full w-[264px] max-w-[85vw] bg-forest shadow-xl"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิดเมนู"
              className={`absolute top-5 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-[12px] text-cream hover:bg-[rgba(255,253,247,0.08)] ${focusRing}`}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {/* กดลิงก์แล้วปิด drawer */}
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
