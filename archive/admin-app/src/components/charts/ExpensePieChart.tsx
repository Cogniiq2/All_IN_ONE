import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  type TooltipProps,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

const EXPENSE_DATA = [
  { name: 'Heizöl', value: 28 },
  { name: 'Handwerker', value: 35 },
  { name: 'Darlehen', value: 22 },
  { name: 'Nebenkosten', value: 8 },
  { name: 'Versicherung', value: 7 },
]
const COLORS = ['#D4A843', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6']
const TOTAL = 14872

const CustomTooltip = ({ active, payload }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div style={{ background: '#111827', border: '1px solid #D4A843', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
      <p style={{ color: '#F9FAFB', fontWeight: 600, marginBottom: '3px' }}>{entry.name}</p>
      <p style={{ color: entry.color, fontVariantNumeric: 'tabular-nums' }}>
        {entry.value}% — {formatCurrency((TOTAL * (entry.value as number)) / 100)}
      </p>
    </div>
  )
}

const CenterLabel = () => (
  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="#F9FAFB" fontSize="14" fontWeight="700">
    {formatCurrency(TOTAL)}
  </text>
)

export function ExpensePieChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={EXPENSE_DATA} cx="40%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value" label={false}>
          {EXPENSE_DATA.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
          <CenterLabel />
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ fontSize: '12px', color: '#9CA3AF', paddingLeft: '20px' }}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
