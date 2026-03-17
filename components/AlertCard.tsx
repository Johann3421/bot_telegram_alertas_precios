'use client';

interface AlertCardProps {
  alert: {
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
  };
  onDismiss?: (id: string) => void;
}

export function AlertCard({ alert, onDismiss }: AlertCardProps) {
  const marginColor =
    alert.marginPercent >= 30
      ? 'var(--color-negative)'
      : alert.marginPercent >= 20
      ? 'var(--color-warning)'
      : 'var(--color-positive)';

  const marginBg =
    alert.marginPercent >= 30
      ? 'var(--cell-alert-high)'
      : alert.marginPercent >= 20
      ? 'var(--cell-alert-med)'
      : 'var(--cell-alert-low)';

  const statusLabel: Record<string, string> = {
    PENDING: 'Pendiente',
    SENT: 'Enviada',
    DISMISSED: 'Descartada',
    EXPIRED: 'Expirada',
  };

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        padding: '10px 14px',
        fontFamily: 'var(--font-ui)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* Indicador de margen */}
      <div
        style={{
          width: 50,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: marginBg,
          color: marginColor,
          fontWeight: 700,
          fontSize: 14,
          fontFamily: 'var(--font-data)',
          flexShrink: 0,
        }}
      >
        {alert.marginPercent.toFixed(0)}%
      </div>

      {/* Info del producto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {alert.product.canonicalName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {alert.product.brand} · {alert.product.category}
        </div>
      </div>

      {/* Precios */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          May: <span style={{ fontFamily: 'var(--font-data)', color: 'var(--color-positive)' }}>S/ {alert.mayoristPrice.toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Min: <span style={{ fontFamily: 'var(--font-data)', color: 'var(--text-primary)' }}>S/ {alert.minoristaPrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Status */}
      <div style={{ flexShrink: 0, textAlign: 'center', width: 70 }}>
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            background: alert.status === 'SENT' ? 'var(--cell-alert-low)' : 'var(--bg-tertiary)',
            color: alert.status === 'SENT' ? 'var(--color-positive)' : 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          {statusLabel[alert.status] ?? alert.status}
        </span>
        {alert.sentToTelegram && (
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>📱 Telegram</div>
        )}
      </div>

      {/* Fecha */}
      <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-muted)', width: 80, textAlign: 'right' }}>
        {new Date(alert.createdAt).toLocaleString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>

      {/* Acción */}
      {onDismiss && alert.status === 'PENDING' && (
        <button
          onClick={() => onDismiss(alert.id)}
          style={{
            height: 24,
            padding: '0 8px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          Descartar
        </button>
      )}
    </div>
  );
}
