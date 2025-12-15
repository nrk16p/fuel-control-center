import { notFound } from "next/navigation";
import EngineonDetailClient from "@/components/engineon/EngineonDetailClient";

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

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

export default async function EngineonDetailPage(props: {
  params: Promise<{ detail: string }> | { detail: string };
}) {
  const { params } = props;
  const resolved = await Promise.resolve(params); // ✅ fix for Promise param
  console.log("🟢 [EngineonDetailPage] params:", resolved);

  const id = resolved.detail;
  if (!id) {
    console.error("❌ Missing detail param");
    return notFound();
  }

  const baseUrl = getBaseUrl();
  const apiUrl = `${baseUrl}/api/raw-engineon?id=${encodeURIComponent(id)}`;
  console.log("🌐 Fetching from:", apiUrl);

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
    if (!events.length) return notFound();

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
