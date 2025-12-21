"use client"
import { useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/* ================= Types ================= */
interface FuelDetectionData {
  _id: string;
  วันที่: string;
  เวลา: string;
  ทะเบียนพาหนะ: string;
  น้ำมัน: number;
  "ความเร็ว(กม./ชม.)": number;
}

/* ================= Component ================= */

export const FuelDetectionGraph = ({ data }: { data: FuelDetectionData[] }) => {
  const [showMockData, setShowMockData] = useState(true);

  // Mock data with at least 8 days
  const mockData: FuelDetectionData[] = [
    // Day 1 - 14/12/2025
    { "_id": "1", "วันที่": "14/12/2025", "เวลา": "08:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 200, "ความเร็ว(กม./ชม.)": 0 },
    { "_id": "2", "วันที่": "14/12/2025", "เวลา": "12:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 180, "ความเร็ว(กม./ชม.)": 45 },
    { "_id": "3", "วันที่": "14/12/2025", "เวลา": "18:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 160, "ความเร็ว(กม./ชม.)": 30 },
    
    // Day 2 - 15/12/2025
    { "_id": "4", "วันที่": "15/12/2025", "เวลา": "08:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 155, "ความเร็ว(กม./ชม.)": 0 },
    { "_id": "5", "วันที่": "15/12/2025", "เวลา": "12:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 140, "ความเร็ว(กม./ชม.)": 55 },
    { "_id": "6", "วันที่": "15/12/2025", "เวลา": "18:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 120, "ความเร็ว(กม./ชม.)": 40 },
    
    // Day 3 - 16/12/2025
    { "_id": "7", "วันที่": "16/12/2025", "เวลา": "08:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 200, "ความเร็ว(กม./ชม.)": 0 },
    { "_id": "8", "วันที่": "16/12/2025", "เวลา": "12:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 175, "ความเร็ว(กม./ชม.)": 60 },
    { "_id": "9", "วันที่": "16/12/2025", "เวลา": "18:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 150, "ความเร็ว(กม./ชม.)": 35 },
    
    // Day 4 - 17/12/2025
    { "_id": "10", "วันที่": "17/12/2025", "เวลา": "08:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 145, "ความเร็ว(กม./ชม.)": 0 },
    { "_id": "11", "วันที่": "17/12/2025", "เวลา": "12:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 125, "ความเร็ว(กม./ชม.)": 50 },
    { "_id": "12", "วันที่": "17/12/2025", "เวลา": "18:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 100, "ความเร็ว(กม./ชม.)": 25 },
    
    // Day 5 - 18/12/2025
    { "_id": "13", "วันที่": "18/12/2025", "เวลา": "08:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 200, "ความเร็ว(กม./ชม.)": 0 },
    { "_id": "14", "วันที่": "18/12/2025", "เวลา": "12:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 170, "ความเร็ว(กม./ชม.)": 65 },
    { "_id": "15", "วันที่": "18/12/2025", "เวลา": "18:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 145, "ความเร็ว(กม./ชม.)": 40 },
    
    // Day 6 - 19/12/2025
    { "_id": "16", "วันที่": "19/12/2025", "เวลา": "08:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 140, "ความเร็ว(กม./ชม.)": 0 },
    { "_id": "17", "วันที่": "19/12/2025", "เวลา": "12:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 115, "ความเร็ว(กม./ชม.)": 55 },
    { "_id": "18", "วันที่": "19/12/2025", "เวลา": "18:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 90, "ความเร็ว(กม./ชม.)": 30 },
    
    // Day 7 - 20/12/2025
    { "_id": "19", "วันที่": "20/12/2025", "เวลา": "08:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 200, "ความเร็ว(กม./ชม.)": 0 },
    { "_id": "20", "วันที่": "20/12/2025", "เวลา": "12:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 165, "ความเร็ว(กม./ชม.)": 70 },
    { "_id": "21", "วันที่": "20/12/2025", "เวลา": "18:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 135, "ความเร็ว(กม./ชม.)": 45 },
    
    // Day 8 - 21/12/2025
    { "_id": "22", "วันที่": "21/12/2025", "เวลา": "08:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 130, "ความเร็ว(กม./ชม.)": 0 },
    { "_id": "23", "วันที่": "21/12/2025", "เวลา": "12:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 105, "ความเร็ว(กม./ชม.)": 60 },
    { "_id": "24", "วันที่": "21/12/2025", "เวลา": "18:00:00", "ทะเบียนพาหนะ": "71-8623", "น้ำมัน": 80, "ความเร็ว(กม./ชม.)": 35 },
  ];

  // Use mock data or real data based on toggle
  const displayData = showMockData ? mockData : data;

  // Prepare labels (date + time)
  const labels = displayData.map(item => `${item.วันที่} ${item.เวลา}`);
  
  // Prepare fuel level data (for line chart)
  const fuelData = displayData.map(item => item.น้ำมัน);
  
  // Prepare speed data (for bar chart)
  const speedData = displayData.map(item => item["ความเร็ว(กม./ชม.)"]);

  const chartData = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'ระดับน้ำมัน (ลิตร)',
        data: fuelData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgb(59, 130, 246)',
        yAxisID: 'y',
        tension: 0.1,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: 'rgb(59, 130, 246)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        order: 1,
      },
      {
        type: 'bar' as const,
        label: 'ความเร็ว (กม./ชม.)',
        data: speedData,
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
        yAxisID: 'y1',
        order: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            size: 14,
          },
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        text: 'กราฟแสดงระดับน้ำมันและความเร็ว',
        font: {
          size: 18,
          weight: 'bold' as const,
        },
      },
      tooltip: {
        callbacks: {
          title: (context: { label: string }[]) => {
            return `วันที่/เวลา: ${context[0].label}`;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'วันที่และเวลา',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 10,
          },
        },
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'ระดับน้ำมัน (ลิตร)',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
          color: 'rgb(59, 130, 246)',
        },
        ticks: {
          color: 'rgb(59, 130, 246)',
        },
        min: 0,
        max: 250,
        grid: {
          drawOnChartArea: true,
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'ความเร็ว (กม./ชม.)',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
          color: 'rgb(34, 197, 94)',
        },
        ticks: {
          color: 'rgb(34, 197, 94)',
        },
        min: 0,
        max: 100,
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  return (
    <div className="w-full">
      {/* Toggle button for mock data */}
      <div className="mb-4 flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showMockData}
            onChange={(e) => setShowMockData(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            แสดงข้อมูล Mock Data
          </span>
        </label>
        {showMockData && (
          <span className="text-xs text-gray-500 bg-yellow-100 px-2 py-1 rounded">
            กำลังใช้ข้อมูลจำลอง ({mockData.length} รายการ, 8 วัน)
          </span>
        )}
      </div>

      {/* Chart container */}
      <div className="bg-white rounded-lg shadow-md p-4" style={{ height: '500px' }}>
        <Chart type="bar" data={chartData} options={options} />
      </div>

      {/* Data summary */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-600 font-medium">จำนวนข้อมูล</p>
          <p className="text-xl font-bold text-blue-800">{displayData.length} รายการ</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-green-600 font-medium">ความเร็วเฉลี่ย</p>
          <p className="text-xl font-bold text-green-800">
            {displayData.length > 0 
              ? (speedData.reduce((a, b) => a + b, 0) / speedData.length).toFixed(1)
              : 0} กม./ชม.
          </p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-600 font-medium">น้ำมันสูงสุด</p>
          <p className="text-xl font-bold text-blue-800">
            {displayData.length > 0 ? Math.max(...fuelData) : 0} ลิตร
          </p>
        </div>
        <div className="bg-red-50 rounded-lg p-3">
          <p className="text-xs text-red-600 font-medium">น้ำมันต่ำสุด</p>
          <p className="text-xl font-bold text-red-800">
            {displayData.length > 0 ? Math.min(...fuelData) : 0} ลิตร
          </p>
        </div>
      </div>
    </div>
  );
}