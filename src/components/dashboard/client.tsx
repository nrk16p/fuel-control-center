import { useState } from 'react'
import { Calendar, Search, Download } from 'lucide-react'
import { Bar, Doughnut } from 'react-chartjs-2'

export const ClientDashboard = () => {
  const [dateRange, setDateRange] = useState('30days')
  const [searchTerm, setSearchTerm] = useState('')
  const [clientType, setClientType] = useState('all')

  const clientBarData = {
    labels: ['New', 'Active', 'Inactive', 'VIP', 'Regular'],
    datasets: [
      {
        label: 'Client Count',
        data: [145, 890, 105, 48, 752],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(156, 163, 175, 0.8)',
        ],
      },
    ],
  }

  const segmentData = {
    labels: ['Enterprise', 'SMB', 'Individual', 'Partner'],
    datasets: [
      {
        data: [32, 45, 18, 5],
        backgroundColor: [
          'rgba(99, 102, 241, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(236, 72, 153, 0.8)',
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
      <div className="bg-white rounded-lg shadow px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-500" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
              <option value="year">This Year</option>
            </select>
          </div>

          {/* Client Type */}
          <select
            value={clientType}
            onChange={(e) => setClientType(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Clients</option>
            <option value="new">New Clients</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="vip">VIP</option>
          </select>

          {/* Search */}
          <div className="flex-1 min-w-50 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md pl-9 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Export */}
          <button className="flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-1.5 rounded-md hover:bg-blue-700 transition">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Clients', value: '1,940', change: '+15%', color: 'blue' },
          { label: 'Active Clients', value: '890', change: '+8%', color: 'green' },
          { label: 'New This Month', value: '145', change: '+22%', color: 'purple' },
          { label: 'Avg. Lifetime Value', value: '$2,840', change: '+12%', color: 'yellow' },
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
        {/* Bar Chart */}
        <div className="bg-white rounded-lg shadow p-4 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Client Status Distribution</h3>
          <div className="h-64">
            <Bar data={clientBarData} options={chartOptions} />
          </div>
        </div>

        {/* Doughnut Chart */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Client Segments</h3>
          <div className="h-64 flex items-center justify-center">
            <div className="w-48 h-48">
              <Doughnut data={segmentData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Top Clients Table */}
        <div className="bg-white rounded-lg shadow p-4 xl:col-span-3">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Top Clients by Revenue</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-700">Client Name</th>
                  <th className="text-left p-3 font-medium text-gray-700">Type</th>
                  <th className="text-left p-3 font-medium text-gray-700">Revenue</th>
                  <th className="text-left p-3 font-medium text-gray-700">Orders</th>
                  <th className="text-left p-3 font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { name: 'Acme Corp', type: 'Enterprise', revenue: '$45,200', orders: 342, status: 'Active' },
                  { name: 'Tech Solutions Ltd', type: 'SMB', revenue: '$32,100', orders: 218, status: 'Active' },
                  { name: 'Global Traders', type: 'Enterprise', revenue: '$28,900', orders: 195, status: 'Active' },
                  { name: 'StartUp Inc', type: 'SMB', revenue: '$22,400', orders: 156, status: 'Active' },
                  { name: 'Retail Partners', type: 'Partner', revenue: '$19,800', orders: 134, status: 'VIP' },
                ].map((client, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-800">{client.name}</td>
                    <td className="p-3 text-gray-600">{client.type}</td>
                    <td className="p-3 font-semibold text-gray-800">{client.revenue}</td>
                    <td className="p-3 text-gray-600">{client.orders}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        client.status === 'VIP' 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {client.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Client Growth */}
        <div className="bg-white rounded-lg shadow p-4 xl:col-span-3">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Client Growth Metrics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Retention Rate', value: '92%', trend: 'up' },
              { label: 'Churn Rate', value: '8%', trend: 'down' },
              { label: 'Monthly Growth', value: '+15%', trend: 'up' },
              { label: 'Avg. Engagement', value: '78%', trend: 'up' },
            ].map((metric, idx) => (
              <div key={idx} className="p-4 from-blue-50 to-white rounded-lg border border-blue-100">
                <p className="text-sm text-gray-600 mb-2">{metric.label}</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-800">{metric.value}</span>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    metric.trend === 'up' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {metric.trend === 'up' ? '↑' : '↓'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}