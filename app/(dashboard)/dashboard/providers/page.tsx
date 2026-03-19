'use client';

import { useState, useEffect } from 'react';
import { useScrapeStatus } from '@/components/ScrapeStatusProvider';

interface ProviderStat {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  listings: number;
  jobs: number;
  successRate: number;
  lastBackend: string;
  lastStrategy: string;
  lastItemsFound: number;
  pagesSucceeded: number;
  pagesAttempted: number;
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
    backendUsed?: string | null;
    strategyUsed?: string | null;
  } | null;
  providers: ProviderStat[];
}

export default function ProvidersPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const scrapeStatus = useScrapeStatus();

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
      {/* Banner de scraping activo */}
      {scrapeStatus.isRunning && scrapeStatus.runningJob && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            marginBottom: 12,
            background: 'rgba(237,125,49,0.1)',
            border: '1px solid rgba(237,125,49,0.3)',
            borderLeft: '4px solid #ED7D31',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ED7D31',
              boxShadow: '0 0 0 4px rgba(237,125,49,0.2)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 700, color: '#ED7D31' }}>Scraping en curso</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {scrapeStatus.runningJob.provider}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {scrapeStatus.runningJob.itemsFound} items
          </span>
          {scrapeStatus.runningJob.pagesAttempted > 0 && (
            <span style={{ color: 'var(--text-secondary)' }}>
              · páginas {scrapeStatus.runningJob.pagesSucceeded}/{scrapeStatus.runningJob.pagesAttempted}
            </span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto' }}>
            Actualiza automáticamente cada 3 s
          </span>
        </div>
      )}

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
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            backend: {stats.lastScrape.backendUsed || '-'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            estrategia: {stats.lastScrape.strategyUsed || '-'}
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
            <th style={headerStyle}>Exito 10 jobs</th>
            <th style={headerStyle}>Backend ultimo</th>
            <th style={headerStyle}>Ultimo items</th>
            <th style={headerStyle}>Paginas ok</th>
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
              <td style={{ ...cellStyle, textAlign: 'center', fontFamily: 'var(--font-data)' }}>{p.successRate}%</td>
              <td style={{ ...cellStyle, textAlign: 'center', fontSize: 11 }}>{p.lastBackend}</td>
              <td style={{ ...cellStyle, textAlign: 'center', fontFamily: 'var(--font-data)' }}>{p.lastItemsFound}</td>
              <td style={{ ...cellStyle, textAlign: 'center', fontFamily: 'var(--font-data)' }}>{p.pagesSucceeded}/{p.pagesAttempted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
