import { NextResponse } from "next/server";
import pool from "@/lib/mysql";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const daysAgo = searchParams.get("daysAgo") || "1"; // default = 1 วันก่อน

    let query = `
      SELECT 
        *
      FROM rmcconcretetrip
      WHERE DATE(TicketCreateAt) = DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `;

    const params: any[] = [daysAgo];

    const [rows] = await pool.query(query, params);

    return NextResponse.json(rows);

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Database error" },
      { status: 500 }
    );
  }
}