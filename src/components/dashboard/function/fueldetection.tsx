import { useState, useEffect } from "react";
import { AlertCircle, Droplets,Clock, ClipboardCheck } from "lucide-react";
import {  Bar, Doughnut } from 'react-chartjs-2'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js'


ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
)

const ChartSkeleton = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-4 animate-pulse">
        <div className="w-full max-w-md space-y-3">
            <div className="h-40 bg-gray-200 rounded-lg"></div>
            <div className="flex justify-center space-x-2">
                <div className="h-3 w-20 bg-gray-200 rounded"></div>
                <div className="h-3 w-20 bg-gray-200 rounded"></div>
                <div className="h-3 w-20 bg-gray-200 rounded"></div>
            </div>
        </div>
        <p className="text-sm text-gray-400 mt-2">ไม่มีข้อมูล . . .</p>
    </div>
)

const CalendarHeatmap = ({ data, selectedMonths }: { data: any[]; selectedMonths?: number[] }) => {
    const activityByDate: { [key: string]: { count: number; items: any[] } } = {};

    data.forEach((item: any) => {
        if (item.created_at) {
            const date = new Date(item.created_at).toISOString().split('T')[0];
            if (!activityByDate[date]) {
                activityByDate[date] = { count: 0, items: [] };
            }
            activityByDate[date].count++;
            activityByDate[date].items.push(item);
        }
    });

    const getDateRange = () => {
        const datesWithData = data
            .filter((item: any) => item.created_at)
            .map((item: any) => new Date(item.created_at));

        const sortedDates = datesWithData.sort((a: Date, b: Date) => a.getTime() - b.getTime());

        const latestDate = new Date(sortedDates[sortedDates.length - 1]);
        const latestYear = latestDate.getFullYear();

        const startDate = new Date(latestYear, 0, 1);
        const endDate = new Date(latestYear, 11, 31);

        return { startDate, endDate };
    };

    const { startDate: dataStartDate, endDate: dataEndDate } = getDateRange();

    const dates: Date[] = [];
    const currentDate = new Date(dataStartDate);
    while (currentDate <= dataEndDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const monthsData: { month: number; year: number; weeks: Date[][] }[] = [];
    let currentMonth = -1;
    let currentYear = -1;
    let currentWeek: Date[] = [];

    dates.forEach((date, index) => {
        const month = date.getMonth();
        const year = date.getFullYear();
        const dayOfWeek = date.getDay();

        if (month !== currentMonth || year !== currentYear) {
            if (currentWeek.length > 0 && monthsData.length > 0) {
                monthsData[monthsData.length - 1].weeks.push([...currentWeek]);
                currentWeek = [];
            }

            currentMonth = month;
            currentYear = year;
            monthsData.push({ month, year, weeks: [] });

            for (let i = 0; i < dayOfWeek; i++) {
                currentWeek.push(null as any);
            }
        }

        currentWeek.push(date);

        if (dayOfWeek === 6 || index === dates.length - 1) {
            if (monthsData.length > 0) {
                monthsData[monthsData.length - 1].weeks.push([...currentWeek]);
            }
            currentWeek = [];
        }
    });

    const getIntensity = (count: number): number => {
        if (count === 0) return 0;
        if (count <= 2) return 1;
        if (count <= 5) return 2;
        if (count <= 10) return 3;
        return 4;
    };

    const intensityColors = [
        'bg-gray-100',
        'bg-emerald-200',
        'bg-emerald-400',
        'bg-emerald-500',
        'bg-emerald-700'
    ];

    const dayLabels = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    const monthLabels = ['ม.ค', 'ก.พ', 'มี.ค', 'เม.ย', 'พ.ค', 'มิ.ย', 'ก.ค', 'ส.ค', 'ก.ย', 'ต.ค', 'พ.ย', 'ธ.ค'];

    return (
        <div className="flex flex-col gap-4 w-full h-full">

            <div className="flex gap-1 w-full overflow-x-auto pb-2">
                <div className="flex flex-col gap-1 text-xs text-gray-500 pr-2 sticky left-0 bg-white z-10">
                    <div className="h-5"></div>
                    {dayLabels.map((day, idx) => (
                        <div key={idx} className="h-4 flex items-center justify-end text-[11px]">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Months */}
                <div className="flex gap-3 flex-1">
                    {monthsData
                        .filter(monthData => !selectedMonths || selectedMonths.length === 0 || selectedMonths.includes(monthData.month + 1))
                        .map((monthData, monthIdx) => (
                            <div key={monthIdx} className="flex flex-col">
                                <div className="h-5 text-xs font-medium text-gray-600 mb-1 whitespace-nowrap">
                                    {monthLabels[monthData.month]} {monthData.year + 543}
                                </div>

                                {/* Weeks in month */}
                                <div className="flex gap-1">
                                    {monthData.weeks.map((week, weekIdx) => (
                                        <div key={weekIdx} className="flex flex-col gap-1">
                                            {week.map((date, dayIdx) => {
                                                if (!date) {
                                                    return <div key={dayIdx} className="w-4 h-4" />;
                                                }
                                                const dateStr = date.toISOString().split('T')[0];
                                                const activity = activityByDate[dateStr];
                                                const count = activity?.count || 0;
                                                const intensity = getIntensity(count);

                                                return (
                                                    <div
                                                        key={dayIdx}
                                                        className={`w-4 h-4 rounded-sm ${intensityColors[intensity]} cursor-pointer transition-all hover:ring-2 hover:ring-gray-400 hover:scale-125`}
                                                        title={`${date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n${count} รายการ`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end pt-2 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>น้อย</span>
                    {intensityColors.map((color, idx) => (
                        <div key={idx} className={`w-4 h-4 rounded-sm ${color}`} />
                    ))}
                    <span>มาก</span>
                </div>
            </div>
        </div>
    );
};

export const FuelDetectionDashboard = ({ data, filters }: { data?: any; filters?: any }) => {
    const [animateCards, setAnimateCards] = useState(false);

    useEffect(() => {
        setAnimateCards(true);
        // console.log(" data:", data);
    }, [data]);

    if (!data || !data.fuelDetection ) return null;

    // TOTAL REVIEWS - จำนวนรายการที่ review แล้วทั้งหมด
    const total_reviews = data.fuelDetection.length || 0;

    // ACTIVITY
    const total_Reviews = new Set(data.fuelDetection.map((item: any) => item.plate)).size || 0;

    // SUSPICIOUS VEHICLES

    const suspicious_vehicles = data.fuelDetection.filter((item: any) => item.decision === 'reviewed_suspicious').length || 0;

    // FUEL DIFFERENCE TOTAL

    const fuel_difference_suspicious = data.fuelDetection.filter((item: any) => item.decision === 'reviewed_suspicious').reduce((sum: number, item: any) => sum + (item.fuel_diff || 0), 0).toFixed(1) || '0.0';

    // Calculate days since last action
    const getLastActionInfo = () => {
        if (data.fuelDetection.length === 0) return null;

        const sortedData = [...data.fuelDetection]
            .filter((item: any) => item.created_at)
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        if (sortedData.length === 0) return null;

        const lastActionDate = new Date(sortedData[0].created_at);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - lastActionDate.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        return {
            date: lastActionDate,
            daysAgo: diffDays,
            plate: sortedData[0].plate
        };
    };

    const lastAction = getLastActionInfo();

    const dataFuelDiffData = data.fuelDetection
        .sort((a: any, b: any) => b.fuel_diff - a.fuel_diff)
        .map((item: any) => ({
            driver: item.plate,
            diff: item.fuel_diff,
            duration: item.duration_min
        }));

    const dataReviewStatus = {
        reviewed_ok: data.fuelDetection.filter((fd: any) => fd.decision === 'reviewed_ok').length || 0,
        reviewed_suspicious: data.fuelDetection.filter((fd: any) => fd.decision === 'reviewed_suspicious').length || 0,
        need_follow_up: data.fuelDetection.filter((fd: any) => fd.decision === 'need_follow_up').length || 0
    };

    // console.log('dataReviewStatus : ',dataReviewStatus)
    // 2 Fuel Difference by Driver - Combo Chart (Bar + Line)
    // const fuelDiffComboData = {
    //     labels: dataFuelDiffData.length > 0 ? dataFuelDiffData.map((d: { driver: string }) => `${d.driver}`) : [],
    //     datasets: [
    //         {
    //             type: 'bar' as const,
    //             label: 'Fuel Difference (L)',
    //             data: dataFuelDiffData.length > 0 ? dataFuelDiffData.map((d: { diff: number }) => d.diff) : [],
    //             backgroundColor: 'rgba(59, 130, 246, 0.8)',
    //             borderColor: 'rgb(59, 130, 246)',
    //             borderWidth: 1,
    //             yAxisID: 'y',
    //             order: 1
    //         },
    //         {
    //             type: 'line' as const,
    //             label: 'Duration (min)',
    //             data: dataFuelDiffData.length > 0 ? dataFuelDiffData.map((d: { duration: number }) => d.duration) : [],
    //             borderColor: 'rgba(234, 88, 12, 0.8)',
    //             backgroundColor: 'rgba(234, 88, 12, 0.1)',
    //             borderWidth: 2,
    //             pointRadius: 1,
    //             pointHoverRadius: 6,
    //             yAxisID: 'y1',
    //             tension: 0.3,
    //             order: 0
    //         }
    //     ]
    // };

    const comboChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        plugins: {
            legend: {
                display: true,
                position: 'top' as const,
            },
            title: {
                display: false
            }
        },
        scales: {
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                title: {
                    display: true,
                    text: 'Fuel Diff (L)'
                }
            },
            y1: {
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                title: {
                    display: true,
                    text: 'Duration (min)'
                },
                grid: {
                    drawOnChartArea: false,
                },
            },
        }
    };

    // 3 % about reviewed_ok, reviewed_suspicious, need_follow_up, null (risk group not completed) - Doughnut Chart 
    const reviewStatusDoughnutData = {
        labels: ['Normal', 'Suspicious', 'Need Follow-up', 'Null'],
        datasets: [
            {
                type: 'doughnut' as const,
                label: 'Review Status',
                data: dataReviewStatus ? [
                    dataReviewStatus.reviewed_ok,
                    dataReviewStatus.reviewed_suspicious,
                    dataReviewStatus.need_follow_up
                ] : [0, 0, 0, 0],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(251, 191, 36, 0.8)',
                    'rgba(107, 114, 128, 0.8)'
                ],
                hoverOffset: 30,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 1)',
            },
        ],
    }

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
            },
            tooltip: {
                callbacks: {
                    label: function (context: any) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            },
            datalabels: {
                color: '#fff',
                font: {
                    weight: 'bold' as const,
                    size: 14
                },
                formatter: (value: number, context: any) => {
                    const total = context.chart.data.datasets[0].data.reduce((a: number, b: number) => a + b, 0);
                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                    return value > 0 ? `${percentage}%` : '';
                }
            }
        },
    };



    return (
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-start">
            {/* Header Section - Vertical */}
            <div className="flex items-center lg:items-start mt-10 justify-center h-full min-h-75 lg:min-h-full">
                <div className="whitespace-nowrap">
                    <h3 className="text-2xl font-bold tracking-wider text-gray-700 uppercase">Fuel Detection</h3>
                </div>
            </div>

            {/* Content Section */}
            <div className="flex flex-col gap-10">
                {/* Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Card 1: Total Reviews */}
                    <div className={`relative overflow-hidden rounded-xl p-6 bg-white shadow-lg transition-all duration-500 hover:shadow-xl hover:-translate-y-1 ${animateCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-4xl font-bold bg-gradient-to-br from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                {total_reviews.toLocaleString()}
                            </span>
                            <ClipboardCheck className="w-8 h-8 text-blue-500" />
                        </div>

                        <span className="text-sm font-medium text-gray-600">Total Reviews</span>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    </div>

                    {/* Card 2: Suspicious Vehicles */}
                    <div className={`relative overflow-hidden rounded-xl p-6 bg-white shadow-lg transition-all duration-500 hover:shadow-xl hover:-translate-y-1 ${animateCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-4xl font-bold bg-linear-to-br from-orange-600 to-red-600 bg-clip-text text-transparent">
                                {suspicious_vehicles} คัน
                            </span>
                            <AlertCircle className="w-8 h-8 text-orange-500" />
                        </div>
                        {/* <div className="h-2 bg-gray-200 rounded-full mb-3"></div> */}
                        <span className="text-sm font-medium text-gray-600">Suspicious Vehicles</span>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-orange-100 to-red-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    </div>

                    {/* Card 3: Fuel Difference Total */}
                    <div className={`relative overflow-hidden rounded-xl p-6 bg-white shadow-lg transition-all duration-500 hover:shadow-xl hover:-translate-y-1 ${animateCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '200ms' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-4xl font-bold bg-linear-to-br from-red-600 to-pink-600 bg-clip-text text-transparent">
                                {fuel_difference_suspicious} ลิตร
                            </span>
                            <Droplets className="w-8 h-8 text-red-500" />
                        </div>
                        {/* <div className="h-2 bg-gray-200 rounded-full mb-3"></div> */}
                        <span className="text-sm font-medium text-gray-600">Fuel Difference Total</span>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-red-100 to-pink-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    </div>
                </div>

                {/* Graph */}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* 1. Show data.length Action Calendar Graph  2 ช่อง */}

                    <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-md font-medium text-gray-700">Activity Calendar</h3>
                            {lastAction && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
                                    <Clock className="w-4 h-4 text-amber-600" />
                                    <span className="text-sm text-amber-700">
                                        Action ล่าสุด: <span className="font-semibold">
                                            {lastAction.daysAgo === 0 ? 'วันนี้' :
                                                lastAction.daysAgo === 1 ? 'เมื่อวาน' :
                                                    `${lastAction.daysAgo} วันที่แล้ว`}
                                        </span>
                                        <span className="text-amber-500 ml-1">({lastAction.plate})</span>
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="p-6 min-h-70">
                            {data.fuelDetection && data.fuelDetection.length > 0 ? (
                                <CalendarHeatmap
                                    data={data.fuelDetection}
                                    selectedMonths={filters?.months}
                                />
                            ) : (
                                <ChartSkeleton />
                            )}
                        </div>
                    </div>


                    {/* 2. Pie Chart % about reviewed_ok, reviewed_suspicious, need_follow_up, null (risk group not completed) */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-md font-medium text-gray-700">Review Status by Category</h3>
                        </div>
                        <div className="h-80 flex items-center justify-center p-3">
                            {(dataReviewStatus.reviewed_ok > 0 || dataReviewStatus.reviewed_suspicious > 0 || dataReviewStatus.need_follow_up > 0) ? (
                                <Doughnut
                                    data={reviewStatusDoughnutData as any}
                                    options={doughnutOptions}
                                />
                            ) : (
                                <ChartSkeleton />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

}