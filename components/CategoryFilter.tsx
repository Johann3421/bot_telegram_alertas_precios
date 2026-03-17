'use client';

const CATEGORIES = [
  'TODOS',
  'LAPTOP',
  'DESKTOP',
  'MONITOR',
  'SMARTPHONE',
  'TABLET',
  'COMPONENTE',
  'PERIFERICO',
  'NETWORKING',
  'ALMACENAMIENTO',
  'OTRO',
];

interface CategoryFilterProps {
  value: string;
  onChange: (category: string) => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        Categoría:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 24,
          fontSize: 12,
          fontFamily: 'var(--font-ui)',
          border: '1px solid var(--border-dark)',
          padding: '0 6px',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>
    </div>
  );
}
