import { notFound } from "next/navigation";
import EngineonDetailClient from "@/components/engineon/EngineonDetailClient";

export const dynamic = "force-dynamic"; // ✅ prevent static generation
export const revalidate = 0;

interface RawEngineonData {
  _id: string;
  date: string;
  count_records: number;
  total_engine_on_hr: number;
  total_engine_on_min: number;
  version_type: string;
  ทะเบียนพาหนะ: string;
  สถานที่?: string;
  start_time?: string;
  end_time?: string;
  lat?: number;
  lng?: number;
  event_id?: number;
  nearest_plant?: string | null;
}

export default async function EngineonDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  let payload: any[] = [];

  try {
    const res = await fetch(
      `${baseUrl}/api/raw-engineon?id=${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      console.error("❌ API error:", res.status, await res.text());
      return notFound();
    }

    const data = await res.json();
    // ✅ Ensure array type regardless of API shape
    payload = Array.isArray(data)
      ? data
      : typeof data === "object" && data
      ? Object.values(data)
      : [];

  } catch (err) {
    console.error("❌ Fetch error:", err);
    return notFound();
  }

  if (!payload || payload.length === 0) {
    console.warn("⚠️ No events found for", id);
    return notFound();
  }

  // ✅ Sort newest first (_3 → _1)
  const sorted = [...payload].sort((a, b) => {
    const getSuffix = (v: string) => parseInt(v.split("_").pop() || "0", 10);
    return getSuffix(b._id) - getSuffix(a._id);
  });

  return <EngineonDetailClient events={sorted} />;
}
