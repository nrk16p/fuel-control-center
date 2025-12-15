"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card"; // optional if you use shadcn
import { Loader2 } from "lucide-react";

interface EngineonSummary {
  _id: string;
  ทะเบียนพาหนะ: string;
  date: string;
  total_engine_on_hr: number;
  total_engine_on_min: number;
  count_records: number;
  nearest_plant?: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<EngineonSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/engineon");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("❌ Failed to fetch /api/engineon", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading)
    return (
      <div className="flex h-[80vh] items-center justify-center text-gray-500">
        <Loader2 className="animate-spin mr-2" /> Loading dashboard...
      </div>
    );

  if (!data || data.length === 0)
    return (
      <div className="flex h-[80vh] items-center justify-center text-gray-400">
        No data available
      </div>
    );

  // 🔹 Group by vehicle
  const grouped = Object.values(
    data.reduce((acc: any, cur) => {
      if (!acc[cur["ทะเบียนพาหนะ"]])
        acc[cur["ทะเบียนพาหนะ"]] = {
          ทะเบียนพาหนะ: cur["ทะเบียนพาหนะ"],
          total_hours: 0,
          total_events: 0,
        };
      acc[cur["ทะเบียนพาหนะ"]].total_hours += cur.total_engine_on_hr;
      acc[cur["ทะเบียนพาหนะ"]].total_events += 1;
      return acc;
    }, {})
  );

  return (
    <main className="space-y-8 p-6">
      <h1 className="text-3xl font-bold">🚛 Engine-On Dashboard</h1>
      <p className="text-gray-500 mb-6">
        Summary of engine-on durations grouped by vehicle
      </p>

      {/* 🔹 Chart 1 — Total Engine-On Hours per Vehicle */}
      <Card className="shadow-md">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            ⏱️ Total Engine-On Hours by Vehicle
          </h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={grouped}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ทะเบียนพาหนะ" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_hours" fill="#2563eb" name="Total Hours" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 🔹 Chart 2 — Engine-On Trend by Date */}
      <Card className="shadow-md">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            📈 Engine-On Duration Trend
          </h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="total_engine_on_hr"
                stroke="#3b82f6"
                name="Engine On (hr)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 🔹 Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border border-gray-200 rounded-lg">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">ทะเบียนพาหนะ</th>
              <th className="p-2 text-right">Total Hours</th>
              <th className="p-2 text-right">Total Minutes</th>
              <th className="p-2 text-right">Records</th>
              <th className="p-2 text-left">Nearest Plant</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 20).map((item) => (
              <tr
                key={item._id}
                className="border-t hover:bg-gray-50 transition"
              >
                <td className="p-2">{item["ทะเบียนพาหนะ"]}</td>
                <td className="p-2 text-right">
                  {item.total_engine_on_hr.toFixed(2)}
                </td>
                <td className="p-2 text-right">
                  {item.total_engine_on_min.toFixed(1)}
                </td>
                <td className="p-2 text-right">{item.count_records}</td>
                <td className="p-2 text-left">{item.nearest_plant ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
