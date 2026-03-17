'use client';

interface Stats {
  totalComparisons: number;
  maxMargin: number;
  avgMargin: number;
  totalProducts: number;
  activeAlerts: number;
}

export function StatsBar({ stats }: { stats: Stats }) {
  const cells = [
    { label: 'Comparativas', value: stats.totalComparisons.toString(), color: 'var(--text-primary)' },
    { label: 'Productos activos', value: stats.totalProducts.toString(), color: 'var(--color-neutral)' },
    { label: 'Alertas pendientes', value: stats.activeAlerts.toString(), color: stats.activeAlerts > 0 ? 'var(--color-negative)' : 'var(--text-primary)' },
    { label: 'Mayor margen', value: `${stats.maxMargin.toFixed(1)}%`, color: 'var(--color-positive)' },
    { label: 'Margen promedio', value: `${stats.avgMargin.toFixed(1)}%`, color: 'var(--color-warning)' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        height: 32,
      }}
    >
      {cells.map((cell, idx) => (
        <div
          key={cell.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px',
            borderRight: idx < cells.length - 1 ? '1px solid var(--border-color)' : 'none',
            fontSize: 11,
            fontFamily: 'var(--font-ui)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>{cell.label}:</span>
          <span style={{ color: cell.color, fontWeight: 700, fontFamily: 'var(--font-data)' }}>
            {cell.value}
          </span>
        </div>
      ))}
    </div>
  );
}
