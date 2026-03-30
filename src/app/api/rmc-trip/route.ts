import { NextResponse } from "next/server";
import pool from "@/lib/mysql";
import dayjs from "dayjs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const daysAgo = searchParams.get("daysAgo") || "1";

    // ================================
    // 🧠 QUERY
    // ================================
    const query = `
      SELECT *
      FROM rmcconcretetrip
      WHERE DATE(TicketCreateAt) = DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `;

    const [rows]: any = await pool.query(query, [daysAgo]);

    // ================================
    // 🧠 PROCESS DATA (แทน pandas)
    // ================================
    let data = rows
      .filter((r: any) => r.ReasonCode === "") // filter
      .map((r: any) => {
        const date = r.TicketCreateAt;

        const loadAt = r.LoadAt || date;

        return {
          LDT: r.TicketNo,
          แพล้นท์: r.PlantCode,
          วันที่: formatDateTime(date),
          ทะเบียนหัว: r.TruckPlateNo,

          "Ship To": r.PlantCode + (r.SiteName || "").substring(0, 8),

          "เลขที่ตั๋วเพิ่ม 2": "2100050",
          "เลขที่ตั๋วเพิ่ม 4": "",
          "สาขา": "LB",
          "ผลิตภัณฑ์": "คอนกรีตผสมเสร็จ",

          "นน ต้นทาง": r.Quantity,
          "นน ปลายทาง": r.Quantity < 4 ? 4 : r.Quantity,

          "วันที่ครบกำหนด": formatDateTime(date),

          "วันเวลาอ้างอิง 1": formatDateTime(loadAt),
          "วันเวลาอ้างอิง 2": formatDateTime(loadAt),
          "วันเวลาอ้างอิง 3": formatDateTime(loadAt),
          "วันเวลาอ้างอิง 4": formatDateTime(loadAt),

          "เวลาออกเดินทาง": formatDateTime(loadAt),

          Type: "single drop",
          "ประเภทการวิ่ง": "legacy",
          "ประเภทการขนส่งขากลับ": "",
          "ประเภทการขนส่ง": "heavy",
          "Service Parameter A": "",
          "Service Parameter B": "",
          dropoffs: "",

          "วันเวลาลงสินค้า": formatDateTime(
            r.PlantMoveOutAt || date
          ),

          "วันเวลาปิด LDT": formatDateTime(
            r.ArriveToPlantAt || date
          ),
        };
      })
      .filter((r: any) =>
        r["แพล้นท์"]?.startsWith("SU") ||
        r["แพล้นท์"]?.startsWith("SX")
      );

    return NextResponse.json({
      total: data.length,
      data,
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Database error" },
      { status: 500 }
    );
  }
}

// ================================
// 🧠 FORMAT FUNCTION (แทน pandas)
// ================================
function formatDateTime(val: any) {
  if (!val) return "";

  const d = dayjs(val);

  if (!d.isValid()) return val;

  if (d.hour() === 0 && d.minute() === 0) {
    return d.format("DD/MM/YYYY");
  }

  return d.format("DD/MM/YYYY HH:mm");
}