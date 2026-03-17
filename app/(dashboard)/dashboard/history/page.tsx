'use client';

import { useState, useEffect, useCallback } from 'react';
import { PriceHistoryChart } from '@/components/PriceHistoryChart';

interface HistoryProduct {
  id: string;
  canonicalName: string;
  brand: string;
}

interface PriceLogEntry {
  date: string;
  price: number;
  provider: string;
}

export default function HistoryPage() {
  const [products, setProducts] = useState<HistoryProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [historyData, setHistoryData] = useState<PriceLogEntry[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Cargar lista de productos
  useEffect(() => {
    fetch('/api/products?limit=200')
      .then((r) => r.json())
      .then((data) => setProducts(data.items ?? []))
      .catch(console.error);
  }, []);

  // Cargar historial cuando se selecciona un producto
  const fetchHistory = useCallback(async () => {
    if (!selectedProduct) {
      setHistoryData([]);
      setProviders([]);
      return;
    }

    try {
      const res = await fetch(`/api/products/${selectedProduct}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data.history ?? []);
        setProviders(data.providers ?? []);
      }
    } catch {
      setHistoryData([]);
      setProviders([]);
    }
  }, [selectedProduct]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredProducts = products.filter((p) =>
    p.canonicalName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Panel izquierdo: lista de productos */}
      <div
        style={{
          width: 300,
          borderRight: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            style={{ width: '100%', height: 26, fontSize: 12, padding: '0 8px' }}
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedProduct(p.id)}
              style={{
                padding: '6px 12px',
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
                background: selectedProduct === p.id ? 'var(--cell-selected)' : 'transparent',
                borderBottom: '1px solid var(--border-color)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={p.canonicalName}
              onMouseEnter={(e) => {
                if (selectedProduct !== p.id) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--cell-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedProduct !== p.id) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }
              }}
            >
              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.canonicalName}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.brand}</div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              No se encontraron productos
            </div>
          )}
        </div>
      </div>

      {/* Panel derecho: gráfico */}
      <div style={{ flex: 1, padding: 16 }}>
        {!selectedProduct ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 13,
              fontFamily: 'var(--font-ui)',
            }}
          >
            Seleccione un producto del panel izquierdo para ver su historial de precios.
          </div>
        ) : (
          <div>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'var(--font-ui)',
                color: 'var(--text-primary)',
                marginBottom: 16,
              }}
            >
              Historial de precios
            </h2>
            <PriceHistoryChart data={historyData} providers={providers} />

            {/* Tabla de datos raw */}
            {historyData.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          background: 'var(--cell-header)',
                          borderBottom: '2px solid var(--border-dark)',
                          borderRight: '1px solid var(--border-color)',
                          padding: 'var(--spacing-cell)',
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'left',
                        }}
                      >
                        Fecha
                      </th>
                      <th
                        style={{
                          background: 'var(--cell-header)',
                          borderBottom: '2px solid var(--border-dark)',
                          borderRight: '1px solid var(--border-color)',
                          padding: 'var(--spacing-cell)',
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'left',
                        }}
                      >
                        Proveedor
                      </th>
                      <th
                        style={{
                          background: 'var(--cell-header)',
                          borderBottom: '2px solid var(--border-dark)',
                          padding: 'var(--spacing-cell)',
                          fontSize: 11,
                          fontWeight: 700,
                          textAlign: 'right',
                        }}
                      >
                        Precio
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.slice(0, 50).map((entry, idx) => (
                      <tr
                        key={idx}
                        style={{
                          background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                        }}
                      >
                        <td
                          style={{
                            padding: 'var(--spacing-cell)',
                            fontSize: 11,
                            borderBottom: '1px solid var(--border-color)',
                            borderRight: '1px solid var(--border-color)',
                          }}
                        >
                          {entry.date}
                        </td>
                        <td
                          style={{
                            padding: 'var(--spacing-cell)',
                            fontSize: 11,
                            borderBottom: '1px solid var(--border-color)',
                            borderRight: '1px solid var(--border-color)',
                          }}
                        >
                          {entry.provider}
                        </td>
                        <td
                          style={{
                            padding: 'var(--spacing-cell)',
                            fontSize: 11,
                            fontFamily: 'var(--font-data)',
                            textAlign: 'right',
                            borderBottom: '1px solid var(--border-color)',
                            color: 'var(--color-positive)',
                          }}
                        >
                          S/ {entry.price.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
