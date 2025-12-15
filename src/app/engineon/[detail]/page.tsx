import { notFound } from "next/navigation";
import EngineonDetailClient from "@/components/engineon/EngineonDetailClient";

export const dynamic = "force-dynamic";
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
  params: { detail: string }; // 👈 match folder name [detail]
}) {
  console.log("🟢 [EngineonDetailPage] params:", params);

  const id = params.detail; // 👈 changed from params.id to params.detail
  if (!id) {
    console.error("❌ Missing detail param");
    return notFound();
  }

  const apiUrl = `/api/raw-engineon?id=${encodeURIComponent(id)}`;
  console.log("🌐 Fetching:", apiUrl);

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    console.log("🔵 Fetch status:", res.status);
    if (!res.ok) return notFound();

    const payload = await res.json();
    const events: RawEngineonData[] = Array.isArray(payload)
      ? payload
      : payload
      ? [payload]
      : [];

    console.log("✅ Events count:", events.length);

    if (!events.length) {
      console.warn("⚠️ No events found for", id);
      return notFound();
    }

    const sorted = [...events].sort((a, b) => {
      const getSuffix = (s: string) =>
        parseInt(s.split("_").pop() || "0", 10);
      return getSuffix(b._id) - getSuffix(a._id);
    });

    return <EngineonDetailClient events={sorted} />;
  } catch (err) {
    console.error("❌ Fetch failed:", err);
    return notFound();
  }
}
