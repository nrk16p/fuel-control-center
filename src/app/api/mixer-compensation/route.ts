import { NextResponse } from "next/server";
import pool from "@/lib/mysql";
export async function GET(req: Request) {
  try {

    const { searchParams } = new URL(req.url);

    const year = searchParams.get("year");
    const month = searchParams.get("month");

    let query = `
      SELECT 
        TicketNo,
        TruckNo,
        TruckPlateNo,
        TruckPlateNo_clean,
        PlantName,
        DATE_FORMAT(SiteMoveInAt, '%Y-%m-%dT%H:%i:%s') AS SiteMoveInAt,
        DATE_FORMAT(SiteMoveOutAt, '%Y-%m-%dT%H:%i:%s') AS SiteMoveOutAt,
        minutes_diff,
        tier,
        truck_type,
        compensate,
        DATE_FORMAT(TicketCreateAt, '%Y-%m-%dT%H:%i:%s') AS TicketCreateAt,
        DATE_FORMAT(date_ticket, '%Y-%m-%d') AS date_ticket,
        is_complete_trip
      FROM mixer_compensation_v2
      WHERE 1=1
    `;

    const params: any[] = [];

    if (year) {
      query += " AND YEAR(date_ticket) = ?";
      params.push(year);
    }

    if (month) {
      query += " AND MONTH(date_ticket) = ?";
      params.push(month);
    }

    query += " ORDER BY date_ticket DESC";

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