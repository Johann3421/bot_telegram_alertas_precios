'use client';

import { useState, useEffect } from 'react';

interface ProviderStat {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  listings: number;
  jobs: number;
}

interface StatsData {
  totalProducts: number;
  totalListings: number;
  totalAlerts: number;
  pendingAlerts: number;
  lastScrape: {
    provider: string;
    status: string;
    finishedAt: string | null;
    itemsFound: number;
  } | null;
  providers: ProviderStat[];
}

export default function ProvidersPage() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  const cellStyle: React.CSSProperties = {
    padding: 'var(--spacing-cell)',
    fontSize: 12,
    fontFamily: 'var(--font-ui)',
    borderBottom: '1px solid var(--border-color)',
    borderRight: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
    height: 'var(--row-height)',
    color: 'var(--text-primary)',
  };

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    background: 'var(--cell-header)',
    borderBottom: '2px solid var(--border-dark)',
    fontWeight: 700,
    fontSize: 11,
  };

  if (!stats) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
        Cargando proveedores...
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Resumen general */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { label: 'Total productos', value: stats.totalProducts, color: 'var(--color-neutral)' },
          { label: 'Total listings', value: stats.totalListings, color: 'var(--color-positive)' },
          { label: 'Total alertas', value: stats.totalAlerts, color: 'var(--color-warning)' },
          { label: 'Alertas pendientes', value: stats.pendingAlerts, color: 'var(--color-negative)' },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              padding: '12px 16px',
              fontFamily: 'var(--font-ui)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stat.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-data)', marginTop: 4 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Último scraping */}
      {stats.lastScrape && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            padding: '10px 16px',
            marginBottom: 16,
            fontSize: 12,
            fontFamily: 'var(--font-ui)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Último scraping:</span>
          <span style={{ fontWeight: 600 }}>{stats.lastScrape.provider}</span>
          <span
            style={{
              padding: '1px 6px',
              fontSize: 10,
              fontWeight: 600,
              background: stats.lastScrape.status === 'DONE' ? 'var(--cell-alert-low)' : 'var(--cell-alert-high)',
              color: stats.lastScrape.status === 'DONE' ? 'var(--color-positive)' : 'var(--color-negative)',
            }}
          >
            {stats.lastScrape.status}
          </span>
          <span style={{ fontFamily: 'var(--font-data)', color: 'var(--text-secondary)' }}>
            {stats.lastScrape.itemsFound} items
          </span>
          {stats.lastScrape.finishedAt && (
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {new Date(stats.lastScrape.finishedAt).toLocaleString('es-PE')}
            </span>
          )}
        </div>
      )}

      {/* Tabla de proveedores */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headerStyle}>#</th>
            <th style={headerStyle}>Proveedor</th>
            <th style={headerStyle}>Tipo</th>
            <th style={headerStyle}>Estado</th>
            <th style={headerStyle}>Listings</th>
            <th style={headerStyle}>Jobs ejecutados</th>
          </tr>
        </thead>
        <tbody>
          {stats.providers.map((p, idx) => (
            <tr
              key={p.id}
              style={{ background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)' }}
            >
              <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
              <td style={{ ...cellStyle, fontWeight: 600 }}>{p.name}</td>
              <td
                style={{
                  ...cellStyle,
                  color: p.type === 'MAYORISTA' ? 'var(--color-positive)' : 'var(--color-neutral)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {p.type}
              </td>
              <td style={cellStyle}>
                <span
                  style={{
                    padding: '1px 8px',
                    fontSize: 10,
                    fontWeight: 600,
                    background: p.isActive ? 'var(--cell-alert-low)' : 'var(--cell-alert-high)',
                    color: p.isActive ? 'var(--color-positive)' : 'var(--color-negative)',
                  }}
                >
                  {p.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td style={{ ...cellStyle, textAlign: 'center', fontFamily: 'var(--font-data)' }}>{p.listings}</td>
              <td style={{ ...cellStyle, textAlign: 'center', fontFamily: 'var(--font-data)' }}>{p.jobs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
