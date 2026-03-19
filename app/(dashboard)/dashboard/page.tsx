'use client';

import { useCallback, useEffect, useState } from 'react';
import { ComparisonTable } from '@/components/ComparisonTable';
import { StatsBar } from '@/components/StatsBar';
import { CategoryFilter } from '@/components/CategoryFilter';
import { useScrapeStatus } from '@/components/ScrapeStatusProvider';

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

interface ScrapeFeedback {
  tone: 'success' | 'warning' | 'error';
  text: string;
}

function formatElapsed(elapsedSeconds: number) {
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

function getFeedbackColors(tone: ScrapeFeedback['tone']) {
  if (tone === 'success') {
    return {
      color: 'var(--color-positive)',
      background: 'var(--cell-alert-low)',
      border: '1px solid rgba(33, 115, 70, 0.24)',
    };
  }

  if (tone === 'warning') {
    return {
      color: 'var(--color-warning)',
      background: 'var(--cell-alert-med)',
      border: '1px solid rgba(237, 125, 49, 0.24)',
    };
  }

  return {
    color: 'var(--color-negative)',
    background: 'var(--cell-alert-high)',
    border: '1px solid rgba(192, 0, 0, 0.18)',
  };
}

export default function DashboardPage() {
  const [category, setCategory] = useState('TODOS');
  const [minMargin, setMinMargin] = useState(15);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStartingScrape, setIsStartingScrape] = useState(false);
  const [isCancellingScrape, setIsCancellingScrape] = useState(false);
  const [data, setData] = useState<ComparisonRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [meta, setMeta] = useState<CompareMeta | null>(null);
  const [scrapingMsg, setScrapingMsg] = useState<ScrapeFeedback | null>(null);
  const scrapeStatus = useScrapeStatus();

  const fetchData = useCallback(async () => {    setIsRefreshing(true);
    try {
      const response = await fetch(
        `/api/compare?category=${encodeURIComponent(category)}&minMargin=${minMargin}`,
        { cache: 'no-store' }
      );
      const json = await response.json();
      setData(json.items ?? []);
      setStats(json.stats ?? null);
      setMeta(json.meta ?? null);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [category, minMargin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!scrapingMsg) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setScrapingMsg(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [scrapingMsg]);

  const triggerManualScrape = async () => {
    if (scrapeStatus.isRunning) {
      const providerName = scrapeStatus.runningJob?.provider;
      setScrapingMsg({
        tone: 'warning',
        text: providerName
          ? `Ya hay un scraping en curso con ${providerName}. Puedes seguir ajustando filtros sin relanzarlo.`
          : 'Ya hay un scraping en curso. Puedes seguir ajustando filtros sin relanzarlo.',
      });
      return;
    }

    setIsStartingScrape(true);
    try {
      const response = await fetch('/api/scrape/trigger', { method: 'POST' });
      const json = await response.json();

      if (response.ok) {
        setScrapingMsg({ tone: 'success', text: json.message ?? 'Scraping iniciado' });
        return;
      }

      if (response.status === 409) {
        setScrapingMsg({
          tone: 'warning',
          text:
            json.message ??
            'Ya hay un scraping en ejecución. Ajustar el margen no necesita reiniciar ese proceso.',
        });
        return;
      }

      setScrapingMsg({ tone: 'error', text: json.message ?? json.error ?? 'Error al iniciar' });
    } catch {
      setScrapingMsg({ tone: 'error', text: 'Error de conexión' });
    } finally {
      setIsStartingScrape(false);
    }
  };

  const cancelScrape = async () => {
    setIsCancellingScrape(true);
    try {
      const response = await fetch('/api/scrape/cancel', { method: 'POST' });
      const json = await response.json();
      setScrapingMsg({
        tone: response.ok ? 'success' : 'error',
        text: json.message ?? (response.ok ? 'Scraping cancelado' : 'Error al cancelar'),
      });
    } catch {
      setScrapingMsg({ tone: 'error', text: 'Error de conexión al cancelar' });
    } finally {
      setIsCancellingScrape(false);
    }
  };

  const feedbackColors = scrapingMsg ? getFeedbackColors(scrapingMsg.tone) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          padding: 16,
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
        }}
      >
        <section
          style={{
            display: 'grid',
            gap: 14,
            padding: 16,
            background: 'linear-gradient(135deg, rgba(68,114,196,0.06), rgba(255,255,255,0.92))',
            border: '1px solid rgba(68,114,196,0.16)',
            boxShadow: '0 10px 24px rgba(30,58,95,0.06)',
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-neutral)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
              }}
            >
              Filtros de comparación
            </span>
            <h2 style={{ fontSize: 18, lineHeight: 1.1, fontFamily: 'var(--font-ui)' }}>
              Ajusta el margen sin tocar el scraping
            </h2>
            <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              El porcentaje y la categoría solo recalculan la tabla. El scraping manual se controla aparte.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                Margen mínimo
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={minMargin}
                  onChange={(event) => setMinMargin(Number(event.target.value))}
                  style={{
                    width: 88,
                    height: 34,
                    border: '1px solid var(--border-dark)',
                    padding: '0 10px',
                    fontSize: 14,
                    fontFamily: 'var(--font-data)',
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>%</span>
              </div>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                Categoría
              </span>
              <CategoryFilter value={category} onChange={setCategory} />
            </label>

            <button
              onClick={fetchData}
              disabled={isRefreshing}
              style={{
                height: 34,
                padding: '0 14px',
                background: 'var(--color-neutral)',
                color: 'white',
                borderRadius: 8,
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
              }}
            >
              {isRefreshing ? 'Recargando tabla...' : 'Recargar tabla'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            {lastUpdated && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                Tabla actualizada: {lastUpdated.toLocaleTimeString('es-PE')}
              </span>
            )}

            {scrapingMsg && feedbackColors && (
              <span
                style={{
                  fontSize: 11,
                  color: feedbackColors.color,
                  fontFamily: 'var(--font-ui)',
                  background: feedbackColors.background,
                  border: feedbackColors.border,
                  padding: '6px 10px',
                  borderRadius: 999,
                }}
              >
                {scrapingMsg.text}
              </span>
            )}
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: 14,
            padding: 16,
            background: scrapeStatus.isRunning
              ? 'linear-gradient(135deg, rgba(237,125,49,0.12), rgba(255,255,255,0.95))'
              : 'linear-gradient(135deg, rgba(33,115,70,0.08), rgba(255,255,255,0.95))',
            border: scrapeStatus.isRunning
              ? '1px solid rgba(237,125,49,0.24)'
              : '1px solid rgba(33,115,70,0.18)',
            boxShadow: '0 10px 24px rgba(30,58,95,0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: scrapeStatus.isRunning ? 'var(--color-warning)' : 'var(--color-positive)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                }}
              >
                Scraping manual
              </span>
              <h2 style={{ fontSize: 18, lineHeight: 1.1, fontFamily: 'var(--font-ui)' }}>
                {scrapeStatus.isRunning ? 'Proceso en curso' : 'Listo para ejecutar'}
              </h2>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                {scrapeStatus.isRunning
                  ? 'Mientras corre el scraping puedes seguir filtrando la tabla y revisando resultados existentes.'
                  : 'Usalo cuando quieras refrescar la captura de proveedores. No hace falta para probar otro margen.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={triggerManualScrape}
                disabled={scrapeStatus.isRunning || isStartingScrape || isCancellingScrape}
                style={{
                  height: 38,
                  padding: '0 16px',
                  background: scrapeStatus.isRunning ? 'var(--border-dark)' : 'var(--color-positive)',
                  color: 'white',
                  borderRadius: 10,
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 700,
                  minWidth: 184,
                  cursor: scrapeStatus.isRunning ? 'not-allowed' : 'pointer',
                  opacity: scrapeStatus.isRunning ? 0.55 : 1,
                }}
              >
                {isStartingScrape
                  ? 'Iniciando...'
                  : scrapeStatus.isRunning
                    ? 'Scraping en curso'
                    : 'Iniciar scraping manual'}
              </button>

              {scrapeStatus.isRunning && (
                <button
                  onClick={cancelScrape}
                  disabled={isCancellingScrape}
                  style={{
                    height: 38,
                    padding: '0 16px',
                    background: isCancellingScrape ? 'var(--border-dark)' : 'var(--color-negative)',
                    color: 'white',
                    borderRadius: 10,
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 700,
                    cursor: isCancellingScrape ? 'not-allowed' : 'pointer',
                    opacity: isCancellingScrape ? 0.65 : 1,
                  }}
                >
                  {isCancellingScrape ? 'Cancelando...' : 'Detener scraping'}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: scrapeStatus.isRunning ? 'rgba(237,125,49,0.14)' : 'rgba(33,115,70,0.12)',
                  color: scrapeStatus.isRunning ? 'var(--color-warning)' : 'var(--color-positive)',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: scrapeStatus.isRunning ? 'var(--color-warning)' : 'var(--color-positive)',
                  }}
                />
                {scrapeStatus.isRunning ? 'Activo ahora' : 'Sin proceso activo'}
              </span>

              {scrapeStatus.isRunning && scrapeStatus.runningJob && (
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {scrapeStatus.runningJob.provider}
                </span>
              )}

              {scrapeStatus.isRunning && scrapeStatus.runningJob && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  En ejecución hace {formatElapsed(scrapeStatus.runningJob.elapsedSeconds)}
                </span>
              )}

              {scrapeStatus.isRunning && scrapeStatus.runningJob && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {scrapeStatus.runningJob.itemsFound} items encontrados
                </span>
              )}

              {scrapeStatus.isRunning && scrapeStatus.runningJob && scrapeStatus.runningJob.pagesAttempted > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Páginas: {scrapeStatus.runningJob.pagesSucceeded}/{scrapeStatus.runningJob.pagesAttempted}
                </span>
              )}
            </div>

            {scrapeStatus.lastScrape && !scrapeStatus.isRunning && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}
              >
                <span>
                  Último job: <strong style={{ color: 'var(--text-primary)' }}>{scrapeStatus.lastScrape.provider}</strong>
                </span>
                <span>
                  Estado: <strong style={{ color: 'var(--text-primary)' }}>{scrapeStatus.lastScrape.status}</strong>
                </span>
                <span>
                  Items: <strong style={{ color: 'var(--text-primary)' }}>{scrapeStatus.lastScrape.itemsFound}</strong>
                </span>
                {scrapeStatus.lastScrape.finishedAt && (
                  <span>{new Date(scrapeStatus.lastScrape.finishedAt).toLocaleString('es-PE')}</span>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

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