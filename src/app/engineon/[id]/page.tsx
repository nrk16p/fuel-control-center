import { notFound } from "next/navigation";
import EngineonDetailClient from "@/components/engineon/EngineonDetailClient";

export const dynamic = "force-dynamic"; // ensure runtime render
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
  console.log("🟡 [EngineonDetailPage] params:", params);

  const id = params.id; // ✅ FIX — remove Promise wrapper
  console.log("🟢 ID received:", id);

  if (!id) {
    console.error("❌ Missing ID param");
    return notFound();
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const apiUrl =
    process.env.NODE_ENV === "production"
      ? `/api/raw-engineon?id=${encodeURIComponent(id)}`
      : `${baseUrl}/api/raw-engineon?id=${encodeURIComponent(id)}`;

  console.log("🌐 Fetching:", apiUrl);

  let payload: any;
  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    console.log("🔵 Fetch status:", res.status);

    if (!res.ok) {
      console.error("❌ API fetch failed:", res.status, await res.text());
      return notFound();
    }

    payload = await res.json();
    console.log("🧩 Payload type:", Array.isArray(payload) ? "array" : typeof payload);
  } catch (err) {
    console.error("❌ Fetch or parse error:", err);
    return notFound();
  }

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
    const getSuffix = (val: string) =>
      parseInt(val.split("_").pop() || "0", 10);
    return getSuffix(b._id) - getSuffix(a._id);
  });

  console.log("✅ Sorted events:", sorted.map((e) => e._id));

  return <EngineonDetailClient events={sorted} />;
}
