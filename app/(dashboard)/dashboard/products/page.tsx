'use client';

import { useState, useEffect, useCallback } from 'react';
import { CategoryFilter } from '@/components/CategoryFilter';

interface ProductItem {
  id: string;
  canonicalName: string;
  brand: string;
  model: string;
  category: string;
  sku: string | null;
  isActive: boolean;
  updatedAt: string;
  rawListings: Array<{
    id: string;
    price: number;
    rawName: string;
    scrapedAt: string;
    inStock: boolean;
    provider: { name: string; type: string };
  }>;
  _count: { alerts: number };
}

function exportProductsCSV(data: ProductItem[]) {
  const headers = ['#', 'Producto', 'Marca', 'Modelo', 'Categoría', 'SKU', 'Listings', 'Alertas', 'Última actualización'];
  const rows = data.map((p, i) => [
    i + 1,
    `"${p.canonicalName}"`,
    p.brand,
    `"${p.model}"`,
    p.category,
    p.sku ?? '',
    p.rawListings.length,
    p._count.alerts,
    new Date(p.updatedAt).toLocaleDateString('es-PE'),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `productos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [category, setCategory] = useState('TODOS');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchProducts = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (category !== 'TODOS') params.set('category', category);
    if (search) params.set('search', search);

    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    setProducts(json.items ?? []);
    setTotalPages(json.pagination?.totalPages ?? 1);
  }, [page, category, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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
    position: 'sticky',
    top: 0,
    zIndex: 10,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
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
          Buscar:
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Nombre de producto..."
          style={{ width: 200, height: 24, fontSize: 12, fontFamily: 'var(--font-ui)' }}
        />

        <div style={{ height: 20, width: 1, background: 'var(--border-color)' }} />

        <CategoryFilter
          value={category}
          onChange={(c) => {
            setCategory(c);
            setPage(1);
          }}
        />

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Pág. {page}/{totalPages}
        </span>

        <button
          onClick={() => exportProductsCSV(products)}
          style={{
            height: 24,
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

      {/* Tabla */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerStyle}>#</th>
              <th style={headerStyle}>Producto</th>
              <th style={headerStyle}>Marca</th>
              <th style={headerStyle}>Categoría</th>
              <th style={headerStyle}>SKU</th>
              <th style={headerStyle}>Listings</th>
              <th style={headerStyle}>Alertas</th>
              <th style={headerStyle}>Precios actuales</th>
              <th style={headerStyle}>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...cellStyle, textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                  No se encontraron productos.
                </td>
              </tr>
            )}
            {products.map((p, idx) => (
              <tr
                key={p.id}
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
                <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-muted)' }}>{(page - 1) * 50 + idx + 1}</td>
                <td style={{ ...cellStyle, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.canonicalName}>
                  {p.canonicalName}
                </td>
                <td style={{ ...cellStyle, fontSize: 11 }}>{p.brand}</td>
                <td style={{ ...cellStyle, fontSize: 11, color: 'var(--color-neutral)' }}>{p.category}</td>
                <td style={{ ...cellStyle, fontSize: 10, fontFamily: 'var(--font-data)', color: 'var(--text-muted)' }}>
                  {p.sku ?? '—'}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', fontFamily: 'var(--font-data)' }}>
                  {p.rawListings.length}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', fontFamily: 'var(--font-data)', color: p._count.alerts > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                  {p._count.alerts}
                </td>
                <td style={{ ...cellStyle, fontSize: 10 }}>
                  {p.rawListings.slice(0, 3).map((l) => (
                    <div key={l.id}>
                      <span style={{ color: 'var(--text-muted)' }}>{l.provider.name}:</span>{' '}
                      <span style={{ fontFamily: 'var(--font-data)', color: l.provider.type === 'MAYORISTA' ? 'var(--color-positive)' : 'var(--text-primary)' }}>
                        S/{l.price.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </td>
                <td style={{ ...cellStyle, fontSize: 10, color: 'var(--text-muted)' }}>
                  {new Date(p.updatedAt).toLocaleDateString('es-PE')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            padding: 8,
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{ height: 24, padding: '0 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 11 }}
          >
            ← Anterior
          </button>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            style={{ height: 24, padding: '0 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 11 }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
