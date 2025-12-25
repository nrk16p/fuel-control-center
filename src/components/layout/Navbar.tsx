"use client"

import * as React from "react"
import Link from "next/link"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { Button } from "@/components/ui/button"

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-white border-b px-6 py-3 shadow-sm">
      {/* Logo */}
      <Link
        href="/"
        className="font-bold text-lg text-blue-600 flex items-center gap-4"
      >
        <img src="./mena.png" alt="Oil Industry" className="w-12 h-8" /> <span>Fuel Control Center</span>
      </Link>

      {/* Navigation */}
      <NavigationMenu>
        <NavigationMenuList className="gap-2">

          {/* Dashboard */}
          <NavigationMenuItem>
            <Link href="/dashboard" legacyBehavior passHref>
              <NavigationMenuLink className="nav-link">
                📊 Dashboard
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>

          {/* Operations */}
          <NavigationMenuItem>
            <NavigationMenuTrigger>🧭 Operations</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-55 gap-1 p-2">
                <li>
                  <Link href="/fueldetection" legacyBehavior passHref>
                    <NavigationMenuLink className="nav-sub">
                      ⛽ Fuel-Detection
                    </NavigationMenuLink>
                  </Link>
                </li>
                <li>
                  <Link href="/engineon" legacyBehavior passHref>
                    <NavigationMenuLink className="nav-sub">
                      🚛 Engine-On
                    </NavigationMenuLink>
                  </Link>
                </li>
                <li>
                  <Link href="/smartdistance" legacyBehavior passHref>
                    <NavigationMenuLink className="nav-sub">
                      🗺️ Smart-Distance
                    </NavigationMenuLink>
                  </Link>
                </li>
                <li>
                  <Link href="/pipeline" legacyBehavior passHref>
                    <NavigationMenuLink className="nav-sub">
                      🔄 Pipeline
                    </NavigationMenuLink>
                  </Link>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>

          {/* Master Data */}
          <NavigationMenuItem>
            <NavigationMenuTrigger> 🗂️ Master Data</NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-55 gap-1 p-2">
                <li>
                  <Link href="/plants" legacyBehavior passHref>
                    <NavigationMenuLink className="nav-sub">
                      🏭 Plants
                    </NavigationMenuLink>
                  </Link>
                </li>
                <li>
                  <Link href="/drivers" legacyBehavior passHref>
                    <NavigationMenuLink className="nav-sub">
                      🚚 Drivers
                    </NavigationMenuLink>
                  </Link>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>



        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  )
}
