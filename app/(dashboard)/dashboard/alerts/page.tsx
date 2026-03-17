'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertCard } from '@/components/AlertCard';

interface AlertItem {
  id: string;
  productId: string;
  mayoristPrice: number;
  minoristaPrice: number;
  marginPercent: number;
  mayoristId: string;
  minoristaId: string;
  status: string;
  sentToTelegram: boolean;
  createdAt: string;
  product: {
    canonicalName: string;
    brand: string;
    category: string;
  };
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchAlerts = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '30' });
    if (statusFilter) params.set('status', statusFilter);

    const res = await fetch(`/api/alerts?${params}`);
    const json = await res.json();
    setAlerts(json.items ?? []);
    setTotalPages(json.pagination?.totalPages ?? 1);
  }, [page, statusFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleDismiss = async (id: string) => {
    await fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'DISMISSED' }),
    });
    fetchAlerts();
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Filtros */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          padding: '8px 12px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
          Estado:
        </span>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{
            height: 24,
            fontSize: 12,
            fontFamily: 'var(--font-ui)',
            border: '1px solid var(--border-dark)',
            padding: '0 6px',
          }}
        >
          <option value="">Todos</option>
          <option value="PENDING">Pendiente</option>
          <option value="SENT">Enviada</option>
          <option value="DISMISSED">Descartada</option>
          <option value="EXPIRED">Expirada</option>
        </select>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          Página {page} de {totalPages}
        </span>
      </div>

      {/* Lista de alertas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {alerts.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
              fontFamily: 'var(--font-ui)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            No hay alertas para mostrar.
          </div>
        )}
        {alerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
        ))}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{
              height: 26,
              padding: '0 12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              fontSize: 12,
            }}
          >
            ← Anterior
          </button>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            style={{
              height: 26,
              padding: '0 12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              fontSize: 12,
            }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
