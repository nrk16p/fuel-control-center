import { notFound } from "next/navigation";
import EngineonDetailClient from "@/components/engineon/EngineonDetailClient";

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://fuel-control-center.vercel.app"; // ✅ your production domain
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
  const resolved = await Promise.resolve(params);
  const id = resolved.detail;

  console.log("🟢 [EngineonDetailPage] param:", id);

  if (!id) return notFound();

  const baseUrl = getBaseUrl();
  const apiUrl = `${baseUrl}/api/raw-engineon?id=${encodeURIComponent(id)}`;
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
    if (!events.length) return notFound();

    const sorted = [...events].sort((a, b) => {
      const getSuffix = (s: string) =>
        parseInt(s.split("_").pop() || "0", 10);
      return getSuffix(b._id) - getSuffix(a._id);
    });

    return <EngineonDetailClient events={sorted} />;
  } catch (err) {
    console.error("❌ Fetch failed:", err);
    return (
      <div className="p-8 text-center text-red-600">
        ❌ Failed to load data for {id}
      </div>
    );
  }
}
