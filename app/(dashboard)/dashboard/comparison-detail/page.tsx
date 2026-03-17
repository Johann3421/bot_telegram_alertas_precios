interface DetailPageProps {
  searchParams: {
    productId?: string;
    canonicalName?: string;
    category?: string;
    sourceName?: string;
    sourcePrice?: string;
    sourceUrl?: string;
    sourceRawName?: string;
    targetName?: string;
    targetPrice?: string;
    targetUrl?: string;
    targetRawName?: string;
    marginPercent?: string;
    difference?: string;
  };
}

function parseMoney(value?: string): string {
  const numeric = Number(value ?? '0');
  return `S/ ${numeric.toFixed(2)}`;
}

function InfoCard(props: {
  title: string;
  provider: string;
  price: string;
  rawName: string;
  url: string;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        padding: 20,
        display: 'grid',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{props.title}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{props.provider}</div>
      </div>

      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-positive)', fontFamily: 'var(--font-data)' }}>
        {props.price}
      </div>

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Referencia encontrada</div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{props.rawName}</div>
      </div>

      <a
        href={props.url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 36,
          padding: '0 14px',
          background: 'var(--color-accent)',
          color: 'white',
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 600,
          width: 'fit-content',
        }}
      >
        Abrir oferta
      </a>
    </div>
  );
}

export default function ComparisonDetailPage({ searchParams }: DetailPageProps) {
  const canonicalName = searchParams.canonicalName ?? 'Comparativa';
  const category = searchParams.category ?? 'OTRO';
  const sourceName = searchParams.sourceName ?? 'Proveedor base';
  const targetName = searchParams.targetName ?? 'Proveedor comparado';
  const sourceUrl = searchParams.sourceUrl ?? '#';
  const targetUrl = searchParams.targetUrl ?? '#';
  const sourceRawName = searchParams.sourceRawName ?? canonicalName;
  const targetRawName = searchParams.targetRawName ?? canonicalName;
  const marginPercent = Number(searchParams.marginPercent ?? '0');
  const difference = Number(searchParams.difference ?? '0');

  return (
    <div style={{ padding: 24, display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <a
          href="/dashboard"
          style={{ color: 'var(--color-accent)', textDecoration: 'none', fontSize: 12, width: 'fit-content' }}
        >
          ← Volver al dashboard
        </a>
        <h1 style={{ margin: 0, fontSize: 28, color: 'var(--text-primary)' }}>{canonicalName}</h1>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>Categoría: {category}</span>
          <span>Margen: {marginPercent.toFixed(2)}%</span>
          <span>Diferencia: S/ {difference.toFixed(2)}</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}
      >
        <InfoCard
          title="Proveedor base"
          provider={sourceName}
          price={parseMoney(searchParams.sourcePrice)}
          rawName={sourceRawName}
          url={sourceUrl}
        />
        <InfoCard
          title="Proveedor comparado"
          provider={targetName}
          price={parseMoney(searchParams.targetPrice)}
          rawName={targetRawName}
          url={targetUrl}
        />
      </div>
    </div>
  );
}