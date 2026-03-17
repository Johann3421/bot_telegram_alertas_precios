'use client';

import { useState, useEffect, useCallback } from 'react';
import { ComparisonTable } from '@/components/ComparisonTable';
import { StatsBar } from '@/components/StatsBar';
import { CategoryFilter } from '@/components/CategoryFilter';

interface ComparisonRow {
  productId: string;
  canonicalName: string;
  category: string;
  mayoristPrice: number;
  mayoristName: string;
  mayoristUrl: string;
  mayoristRawName: string;
  minoristaPrice: number;
  minoristaName: string;
  minoristaUrl: string;
  minoristaRawName: string;
  marginPercent: number;
  difference: number;
  lastUpdated: string;
}

interface Stats {
  totalComparisons: number;
  maxMargin: number;
  avgMargin: number;
  totalProducts: number;
  activeAlerts: number;
}

interface CompareMeta {
  mode: 'WHOLESALE_VS_RETAIL' | 'PUBLIC_FALLBACK';
  sourceLabel: string;
  targetLabel: string;
  message: string;
}

export default function DashboardPage() {
  const [category, setCategory] = useState('TODOS');
  const [minMargin, setMinMargin] = useState(15);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [data, setData] = useState<ComparisonRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [meta, setMeta] = useState<CompareMeta | null>(null);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/compare?category=${encodeURIComponent(category)}&minMargin=${minMargin}`);
      const json = await res.json();
      setData(json.items ?? []);
      setStats(json.stats ?? null);
      setMeta(json.meta ?? null);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [category, minMargin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const triggerManualScrape = async () => {
    try {
      const res = await fetch('/api/scrape/trigger', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        // Usar un mensaje en la UI en vez de alert() nativo
        setScrapingMsg(json.message ?? 'Scraping iniciado');
        setTimeout(() => setScrapingMsg(null), 5000);
      } else {
        setScrapingMsg(json.message ?? json.error ?? 'Error al iniciar');
        setTimeout(() => setScrapingMsg(null), 5000);
      }
    } catch {
      setScrapingMsg('Error de conexión');
      setTimeout(() => setScrapingMsg(null), 5000);
    }
  };

  const [scrapingMsg, setScrapingMsg] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barra de herramientas tipo Excel */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 16px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          height: 42,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
          Margen mínimo:
        </span>
        <input
          type="number"
          value={minMargin}
          onChange={(e) => setMinMargin(Number(e.target.value))}
          style={{
            width: 60,
            height: 24,
            border: '1px solid var(--border-dark)',
            padding: '0 6px',
            fontSize: 12,
            fontFamily: 'var(--font-data)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%</span>

        <div style={{ height: 20, width: 1, background: 'var(--border-color)', margin: '0 4px' }} />

        <CategoryFilter value={category} onChange={setCategory} />

        <div style={{ flex: 1 }} />

        {scrapingMsg && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--color-positive)',
              fontFamily: 'var(--font-ui)',
              background: 'var(--cell-alert-low)',
              padding: '2px 8px',
            }}
          >
            {scrapingMsg}
          </span>
        )}

        {lastUpdated && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
            Actualizado: {lastUpdated.toLocaleTimeString('es-PE')}
          </span>
        )}

        <button
          onClick={fetchData}
          disabled={isRefreshing}
          style={{
            height: 26,
            padding: '0 12px',
            background: 'var(--color-neutral)',
            color: 'white',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {isRefreshing ? '⟳ Cargando...' : '⟳ Actualizar'}
        </button>

        <button
          onClick={triggerManualScrape}
          style={{
            height: 26,
            padding: '0 12px',
            background: 'var(--color-positive)',
            color: 'white',
            fontFamily: 'var(--font-ui)',
          }}
        >
          ▶ Comparar ahora
        </button>
      </div>

      {/* Barra de estadísticas */}
      {stats && <StatsBar stats={stats} />}

      {meta && (
        <div
          style={{
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-color)',
            background:
              meta.mode === 'PUBLIC_FALLBACK' ? 'var(--cell-alert-med)' : 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: 'var(--font-ui)',
          }}
        >
          {meta.message}
        </div>
      )}

      {/* Tabla principal */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)' }}>
        <ComparisonTable
          data={data}
          labels={{
            sourceLabel: meta?.sourceLabel ?? 'Mayorista',
            targetLabel: meta?.targetLabel ?? 'Minorista',
          }}
        />
      </div>
    </div>
  );
}
