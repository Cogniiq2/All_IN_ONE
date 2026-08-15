import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, type TooltipProps,
} from 'recharts'
import { cashflowData } from '@/data/mockData'
import { formatCurrency } from '@/lib/utils'

const CustomTooltip = ({ active, payload }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#111827', border: '1px solid #D4A843', borderRadius: '8px',
      padding: '12px 14px', fontSize: '12px', color: '#E5E7EB',
    }}>
      <p style={{ fontWeight: 600, marginBottom: '6px', color: '#F9FAFB' }}>
        {payload[0]?.payload?.month}
      </p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, margin: '3px 0', fontVariantNumeric: 'tabular-nums' }}>
          {entry.name}: {formatCurrency(entry.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

export function CashflowChart() {
  const data = cashflowData.map((d) => ({
    month: d.month,
    Einnahmen: d.einnahmen,
    Ausgaben: d.ausgaben,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal vertical={false} stroke="#1F2937" strokeDasharray="3 3" />
        <XAxis dataKey="month" stroke="#4B5563" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={{ stroke: '#4B5563' }} tickLine={false} />
        <YAxis stroke="#4B5563" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px', color: '#9CA3AF' }} iconType="square" />
        <Bar dataKey="Einnahmen" fill="#10B981" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
        <Bar dataKey="Ausgaben" fill="#EF4444" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
