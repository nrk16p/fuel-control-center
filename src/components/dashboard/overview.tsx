import { useEffect, useState } from 'react'
import { DashboardFilters } from './filter'
import { FuelDetectionDashboard } from './function/fueldetection'


export const OverviewDashboard = () => {

  const [filters, setFilters] = useState<{ years?: number[]; months?: number[]; search?: string }>({})
  const [data, setData] = useState<{ fuelDetection?: any }>({})

  useEffect(() => {

    const fetchData = async () => {

      const years = (filters as any).years ;
      const months = (filters as any).months;
      const plate = (filters as any).search || ''

      const list = ["fuelDetection"]
      for (const item of list) {
        try {
          const yearsParam = years.join(',') || ""
          const monthsParam = months.join(',') || ""  
          const response = await fetch(`/api/dashboard/${item}?years=${yearsParam}&months=${monthsParam}&plate=${plate}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          })
          const data = await response.json()
          setData(prevData => ({ ...prevData, [item]: data }))
        } catch (error) {
          console.error(`Error fetching data from ${item}:`, error)
        }
      }

    }

    fetchData()

  }, [filters])

  return (
    <div className="space-y-6">

      <DashboardFilters
        type="overview"
        filters={setFilters}
      /> 

      <FuelDetectionDashboard 
      data={{ fuelDetection: data.fuelDetection }}
      filters={filters}
       />
       {/* <div className="h-2 bg-gray-100 my-10 rounded-full"></div> */}


      {/* <EngineOnDashboard />
      
      <div className="h-2 bg-gray-100 my-10 rounded-full"></div>


  
      <SmartDistanceDashboard /> */}

    </div>
  )
}