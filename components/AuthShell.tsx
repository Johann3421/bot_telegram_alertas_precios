import type { ReactNode } from 'react';

export function AuthShell({
  mode,
  title,
  description,
  children,
}: {
  mode: 'Ingreso' | 'Registro';
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-shell">
        <section className="auth-overview">
          <div>
            <span className="auth-kicker">Mesa de control comercial</span>
            <h1 className="auth-title">Auditoría real para catálogos, márgenes y mayoristas.</h1>
            <p className="auth-copy">
              Precios PE ahora puede operar con credenciales por cuenta. Cada usuario administra su
              acceso mayorista sin tocar código y dispara comparaciones completas desde su propio
              entorno de trabajo.
            </p>

            <div className="auth-stat-grid">
              <div className="auth-stat">
                <strong>3</strong>
                <span>Mayoristas listos</span>
              </div>
              <div className="auth-stat">
                <strong>4+</strong>
                <span>Minoristas activos</span>
              </div>
              <div className="auth-stat">
                <strong>1</strong>
                <span>Cuenta, credenciales y sesión</span>
              </div>
            </div>

            <div className="auth-notes">
              <div className="auth-note">
                El acceso queda aislado por usuario. Tus credenciales se cifran en servidor y no se
                comparten con otras cuentas del panel.
              </div>
              <div className="auth-note">
                El scraping manual puede usar tus accesos guardados para salir del modo temporal sin
                editar `.env`.
              </div>
            </div>
          </div>

          <div>
            <div className="auth-note">
              <strong>{mode}</strong>
              <div style={{ marginTop: 6 }}>{title}</div>
              <div style={{ marginTop: 8, color: 'rgba(240,240,240,0.72)' }}>{description}</div>
            </div>
          </div>
        </section>

        <section className="auth-form-wrap">{children}</section>
      </div>
    </div>
  );
}