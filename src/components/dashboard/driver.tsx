import { useState } from 'react'
import { Filter, Calendar, Download } from 'lucide-react'
import { Line, Bar, Doughnut } from 'react-chartjs-2' 
import { DashboardFilters } from './filter'
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

export const DriverDashboard = () => {
  const [search, setSearch] = useState('')
  const [plantCode, setPlantCode] = useState('')
  const [siteCode, setSiteCode] = useState('')
  const [company, setCompany] = useState<'all' | 'Asia' | 'SCCO'>('all')
  const [month, setMonth] = useState<number | 'all'>('all')
  const [year, setYear] = useState<number | 'all'>('all')
  const yearOptions = [2021, 2022, 2023, 2024]

  const handleReset = () => {
    setSearch('')
    setPlantCode('')
    setSiteCode('')
    setCompany('all')
    setMonth('all')
    setYear('all')
  }

  const lineChartData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Active Drivers',
        data: [65, 72, 68, 75, 82, 78, 85],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }

  const barChartData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        label: 'Deliveries',
        data: [320, 450, 380, 520],
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
      },
    ],
  }

  const doughnutData = {
    labels: ['Active', 'Inactive', 'On Break'],
    datasets: [
      {
        data: [65, 25, 10],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 191, 36, 0.8)',
        ],
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
  }

  return (
    <div className="space-y-6">
      {/* Filter Section - Compact */}
      {/* <DashboardFilters 
        type="driver"
        onReset={handleReset}
      /> */}
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Drivers', value: '248', change: '+12%', color: 'blue' },
          { label: 'Active Now', value: '185', change: '+8%', color: 'green' },
          { label: 'Avg. Rating', value: '4.8', change: '+0.2', color: 'yellow' },
          { label: 'Total Trips', value: '1,847', change: '+23%', color: 'purple' },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-1">{stat.label}</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-bold text-gray-800">{stat.value}</h3>
              <span className={`text-xs font-medium text-${stat.color}-600 bg-${stat.color}-50 px-2 py-1 rounded`}>
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid - Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Line Chart */}
        <div className="bg-white rounded-lg shadow p-4 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Driver Activity Trend</h3>
          <div className="h-64">
            <Line data={lineChartData} options={chartOptions} />
          </div>
        </div>

        {/* Doughnut Chart */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Status Distribution</h3>
          <div className="h-64 flex items-center justify-center">
            <div className="w-48 h-48">
              <Doughnut data={doughnutData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="bg-white rounded-lg shadow p-4 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Weekly Deliveries</h3>
          <div className="h-64">
            <Bar data={barChartData} options={chartOptions} />
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Performance Metrics</h3>
          <div className="space-y-4">
            {[
              { label: 'Average Response Time', value: '2.5 min', progress: 85 },
              { label: 'Completion Rate', value: '94%', progress: 94 },
              { label: 'Customer Satisfaction', value: '4.7/5', progress: 94 },
            ].map((metric, idx) => (
              <div key={idx}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{metric.label}</span>
                  <span className="font-medium text-gray-800">{metric.value}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${metric.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Stats Card */}
        <div className="bg-white rounded-lg shadow p-4 xl:col-span-3">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Top Performing Drivers</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: 'John Doe', trips: 124, rating: 4.9 },
              { name: 'Jane Smith', trips: 118, rating: 4.8 },
              { name: 'Mike Johnson', trips: 112, rating: 4.9 },
              { name: 'Sarah Wilson', trips: 108, rating: 4.7 },
            ].map((driver, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-800">{driver.name}</p>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-600">{driver.trips} trips</span>
                  <span className="font-medium text-yellow-600">⭐ {driver.rating}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}