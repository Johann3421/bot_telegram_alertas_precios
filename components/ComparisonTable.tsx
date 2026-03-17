'use client';

import { useState, useMemo } from 'react';

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

type SortKey = keyof ComparisonRow;
type SortDir = 'asc' | 'desc';

function exportToCSV(
  data: ComparisonRow[],
  filename: string,
  labels: { sourceLabel: string; targetLabel: string }
) {
  const headers = [
    '#', 'Producto', 'Categoría', `P. ${labels.sourceLabel}`, `Proveedor ${labels.sourceLabel}`,
    `P. ${labels.targetLabel}`, `Proveedor ${labels.targetLabel}`, 'Margen %', 'Diferencia S/.',
  ];
  const rows = data.map((r, i) => [
    i + 1, `"${r.canonicalName}"`, r.category,
    r.mayoristPrice.toFixed(2), r.mayoristName,
    r.minoristaPrice.toFixed(2), r.minoristaName,
    r.marginPercent.toFixed(1), r.difference.toFixed(2),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ComparisonTable({
  data,
  labels = { sourceLabel: 'Mayorista', targetLabel: 'Minorista' },
}: {
  data: ComparisonRow[];
  labels?: { sourceLabel: string; targetLabel: string };
}) {
  const [sortKey, setSortKey] = useState<SortKey>('marginPercent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const getMarginStyle = (margin: number) => {
    if (margin >= 30) return { background: 'var(--cell-alert-high)', color: 'var(--color-negative)', fontWeight: 700 };
    if (margin >= 20) return { background: 'var(--cell-alert-med)', color: '#7D4F00', fontWeight: 600 };
    return { background: 'var(--cell-alert-low)', color: 'var(--color-positive)', fontWeight: 500 };
  };

  const headerStyle: React.CSSProperties = {
    background: 'var(--cell-header)',
    borderBottom: '2px solid var(--border-dark)',
    borderRight: '1px solid var(--border-color)',
    padding: 'var(--spacing-cell)',
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'var(--font-ui)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    cursor: 'pointer',
  };

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

  const numericCell: React.CSSProperties = {
    ...cellStyle,
    fontFamily: 'var(--font-data)',
    textAlign: 'right',
  };

  return (
    <div>
      {/* Toolbar de tabla */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-color)',
          fontSize: 11,
          fontFamily: 'var(--font-ui)',
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>
          {sorted.length} resultado{sorted.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() =>
            exportToCSV(sorted, `comparativa_precios_${new Date().toISOString().slice(0, 10)}.csv`, labels)
          }
          style={{
            height: 22,
            padding: '0 10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-dark)',
            color: 'var(--text-secondary)',
            fontSize: 11,
          }}
        >
          📥 Exportar CSV
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 280 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={headerStyle}>#</th>
              <th style={headerStyle} onClick={() => handleSort('canonicalName')}>
                Producto{sortIndicator('canonicalName')}
              </th>
              <th style={headerStyle} onClick={() => handleSort('category')}>
                Categoría{sortIndicator('category')}
              </th>
              <th style={{ ...headerStyle, textAlign: 'right' }} onClick={() => handleSort('mayoristPrice')}>
                P. {labels.sourceLabel}{sortIndicator('mayoristPrice')}
              </th>
              <th style={headerStyle} onClick={() => handleSort('mayoristName')}>
                Prov. {labels.sourceLabel}{sortIndicator('mayoristName')}
              </th>
              <th style={{ ...headerStyle, textAlign: 'right' }} onClick={() => handleSort('minoristaPrice')}>
                P. {labels.targetLabel}{sortIndicator('minoristaPrice')}
              </th>
              <th style={headerStyle} onClick={() => handleSort('minoristaName')}>
                Prov. {labels.targetLabel}{sortIndicator('minoristaName')}
              </th>
              <th style={{ ...headerStyle, textAlign: 'right' }} onClick={() => handleSort('marginPercent')}>
                Margen %{sortIndicator('marginPercent')}
              </th>
              <th style={{ ...headerStyle, textAlign: 'right' }} onClick={() => handleSort('difference')}>
                Dif. S/.{sortIndicator('difference')}
              </th>
              <th style={headerStyle}>Ver</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  style={{
                    ...cellStyle,
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    padding: '24px',
                  }}
                >
                  No se encontraron comparativas con el margen seleccionado.
                </td>
              </tr>
            )}
            {sorted.map((row, idx) => (
              <tr
                key={row.productId + '-' + idx}
                style={{
                  background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = 'var(--cell-hover)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)')
                }
              >
                <td style={{ ...cellStyle, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {idx + 1}
                </td>
                <td
                  style={{
                    ...cellStyle,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 280,
                  }}
                  title={row.canonicalName}
                >
                  {row.canonicalName}
                </td>
                <td style={{ ...cellStyle, color: 'var(--color-neutral)', fontSize: 11 }}>
                  {row.category}
                </td>
                <td style={{ ...numericCell, color: 'var(--color-positive)' }}>
                  S/ {row.mayoristPrice.toFixed(2)}
                </td>
                <td style={{ ...cellStyle, fontSize: 11, color: 'var(--text-secondary)' }}>
                  {row.mayoristName}
                </td>
                <td style={{ ...numericCell }}>S/ {row.minoristaPrice.toFixed(2)}</td>
                <td style={{ ...cellStyle, fontSize: 11, color: 'var(--text-secondary)' }}>
                  {row.minoristaName}
                </td>
                <td style={{ ...numericCell, ...getMarginStyle(row.marginPercent) }}>
                  {row.marginPercent.toFixed(1)}%
                </td>
                <td style={{ ...numericCell, color: 'var(--color-positive)', fontWeight: 600 }}>
                  S/ {row.difference.toFixed(2)}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  {(() => {
                    const params = new URLSearchParams({
                      productId: row.productId,
                      canonicalName: row.canonicalName,
                      category: row.category,
                      sourceName: row.mayoristName,
                      sourcePrice: row.mayoristPrice.toString(),
                      sourceUrl: row.mayoristUrl,
                      sourceRawName: row.mayoristRawName,
                      targetName: row.minoristaName,
                      targetPrice: row.minoristaPrice.toString(),
                      targetUrl: row.minoristaUrl,
                      targetRawName: row.minoristaRawName,
                      marginPercent: row.marginPercent.toString(),
                      difference: row.difference.toString(),
                    });

                    return (
                  <a
                    href={`/dashboard/comparison-detail?${params.toString()}`}
                    style={{
                      color: 'var(--color-accent)',
                      textDecoration: 'none',
                      fontSize: 11,
                    }}
                  >
                    Detalle →
                  </a>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
