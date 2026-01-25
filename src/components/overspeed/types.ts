
export interface Overspeed {

    _id: string,
    segment_id: number,
    vehicle: string,
    start_datetime: string,
    end_datetime: string,
    duration_minutes: number,
    sum_distance_km: number,
    avg_speed: number,
    max_speed: number,
    w_speed: number,
    speed_group: string
    year: number,
    month: number

}

export type SortKey =
    | "vehicle"
    | "start_datetime"
    | "end_datetime"
    | "duration_minutes"
    | "sum_distance_km"
    | "avg_speed"
    | "max_speed"
    | "w_speed"
    | "speed_group"