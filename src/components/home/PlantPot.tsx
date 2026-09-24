// กระถางต้นไม้ประดับ hero (170×152) — ตกแต่งอย่างเดียว ซ่อนจาก screen reader
export function PlantPot({ className = "" }: { className?: string }) {
  return (
    <svg
      width="170"
      height="152"
      viewBox="0 0 170 152"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* เงาพื้น */}
      <ellipse cx="85" cy="146" rx="50" ry="5" fill="#2F5D46" opacity="0.12" />

      {/* ก้าน */}
      <path d="M85 98 C85 78 84 62 86 40" stroke="#2F5D46" strokeWidth="3" strokeLinecap="round" />
      <path d="M85 88 C76 76 66 70 56 68" stroke="#2F5D46" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M86 80 C96 68 106 62 118 60" stroke="#2F5D46" strokeWidth="2.5" strokeLinecap="round" />

      {/* ใบ */}
      <path d="M86 40 C74 30 72 14 84 6 C96 14 98 30 86 40 Z" fill="#2F5D46" />
      <path d="M85 12 L85 36" stroke="#DDE8D5" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M56 68 C40 70 28 60 26 46 C42 42 54 52 56 68 Z" fill="#4E7D5F" />
      <path d="M118 60 C130 48 146 48 154 58 C144 70 128 70 118 60 Z" fill="#4E7D5F" />
      <path d="M84 60 C70 58 62 46 64 34 C78 36 86 46 84 60 Z" fill="#7FA88A" />
      <path d="M88 56 C100 50 112 52 118 62 C108 70 94 66 88 56 Z" fill="#7FA88A" />

      {/* ขอบกระถาง */}
      <rect x="44" y="96" width="82" height="14" rx="5" fill="#B35A36" />
      {/* ตัวกระถาง */}
      <path d="M50 110 H120 L112 140 C111.2 143 108.6 145 105.5 145 H64.5 C61.4 145 58.8 143 58 140 Z" fill="#C8704A" />
      {/* แถบลาย */}
      <path d="M53.5 122 H116.5" stroke="#E8C467" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      {/* ไฮไลต์ */}
      <path d="M62 114 L67 138" stroke="#FFFDF7" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  )
}
