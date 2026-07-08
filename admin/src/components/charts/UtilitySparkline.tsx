import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { UtilityEntry } from '@/data/mockData'

interface UtilitySparklineProps {
  data: UtilityEntry[]
  color?: string
}

export function UtilitySparkline({ data, color = '#D4A843' }: UtilitySparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
