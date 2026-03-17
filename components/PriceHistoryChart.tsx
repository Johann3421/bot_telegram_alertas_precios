'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface PricePoint {
  date: string;
  price: number;
  provider: string;
}

interface PriceHistoryChartProps {
  data: PricePoint[];
  providers: string[];
}

const PROVIDER_COLORS: Record<string, string> = {
  Deltron: '#217346',
  'Ingram Micro': '#4472C4',
  Intcomex: '#ED7D31',
  Coolbox: '#C00000',
  Hiraoka: '#7030A0',
  Impacto: '#00B0F0',
  Sercoplus: '#FFC000',
};

export function PriceHistoryChart({ data, providers }: PriceHistoryChartProps) {
  // Agrupar datos por fecha, con una columna por proveedor
  const grouped: Record<string, Record<string, number>> = {};
  for (const point of data) {
    if (!grouped[point.date]) grouped[point.date] = {};
    grouped[point.date][point.provider] = point.price;
  }

  const chartData = Object.entries(grouped)
    .map(([date, prices]) => ({ date, ...prices }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (chartData.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 12,
          fontFamily: 'var(--font-ui)',
        }}
      >
        No hay datos históricos para este producto.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fontFamily: 'var(--font-ui)' }}
            stroke="var(--border-dark)"
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: 'var(--font-data)' }}
            stroke="var(--border-dark)"
            tickFormatter={(v: number) => `S/${v}`}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-dark)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
            }}
            formatter={(value) => [`S/ ${Number(value).toFixed(2)}`, '']}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-ui)' }}
          />
          {providers.map((prov) => (
            <Line
              key={prov}
              type="monotone"
              dataKey={prov}
              stroke={PROVIDER_COLORS[prov] ?? '#888'}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
