'use client';

import { useEffect, useMemo, useState } from 'react';

type ProviderKey = 'DELTRON' | 'INGRAM' | 'INTCOMEX';

interface CredentialFormState {
  provider: ProviderKey;
  label: string;
  hint: string;
  username: string;
  password: string;
  hasPassword: boolean;
  configuredAt: string | null;
  remove: boolean;
}

interface SettingsResponse {
  profile: {
    id: string;
    name: string | null;
    email: string;
    alertThreshold: number;
  };
  credentials: Array<Omit<CredentialFormState, 'password' | 'remove'>>;
  broadcast: {
    inviteUrl: string | null;
  };
}

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    alertThreshold: 15,
  });
  const [broadcastInviteUrl, setBroadcastInviteUrl] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialFormState[]>([]);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<ProviderKey, boolean>>({
    DELTRON: false,
    INGRAM: false,
    INTCOMEX: false,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        const response = await fetch('/api/settings');
        const payload = (await response.json()) as SettingsResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'No se pudo cargar la configuración.');
        }

        if (!isMounted) {
          return;
        }

        setProfile({
          name: payload.profile.name ?? '',
          email: payload.profile.email,
          alertThreshold: payload.profile.alertThreshold,
        });
        setBroadcastInviteUrl(payload.broadcast.inviteUrl);
        setCredentials(
          payload.credentials.map((credential) => ({
            ...credential,
            password: '',
            remove: false,
          }))
        );
      } catch (error) {
        if (isMounted) {
          setFeedback({
            type: 'error',
            message: error instanceof Error ? error.message : 'No se pudo cargar la configuración.',
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const configuredCount = useMemo(
    () => credentials.filter((credential) => credential.hasPassword && !credential.remove).length,
    [credentials]
  );

  function updateCredential(provider: CredentialFormState['provider'], patch: Partial<CredentialFormState>) {
    setCredentials((current) =>
      current.map((credential) =>
        credential.provider === provider ? { ...credential, ...patch } : credential
      )
    );
  }

  function togglePasswordVisibility(provider: ProviderKey) {
    setVisiblePasswords((current) => ({
      ...current,
      [provider]: !current[provider],
    }));
  }

  async function handleSave() {
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            name: profile.name,
            alertThreshold: profile.alertThreshold,
          },
          credentials: credentials.map((credential) => ({
            provider: credential.provider,
            username: credential.username,
            password: credential.password,
            remove: credential.remove,
          })),
        }),
      });

      const payload = (await response.json()) as
        | ({ message: string } & SettingsResponse)
        | { error?: string };

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'No se pudo guardar.');
      }

      if ('profile' in payload) {
        setProfile({
          name: payload.profile.name ?? '',
          email: payload.profile.email,
          alertThreshold: payload.profile.alertThreshold,
        });
        setBroadcastInviteUrl(payload.broadcast.inviteUrl);
        setCredentials(
          payload.credentials.map((credential) => ({
            ...credential,
            password: '',
            remove: false,
          }))
        );
      }

      setFeedback({ type: 'success', message: 'Configuración guardada correctamente.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo guardar la configuración.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="settings-shell">
      <section className="settings-hero">
        <h2>Centro de credenciales</h2>
        <p>
          Cada usuario administra aquí sus accesos mayoristas, su umbral de alerta y el canal de
          notificación. Cuando lances “Comparar ahora”, el sistema puede usar estas credenciales
          privadas para salir del modo temporal sin tocar el código.
        </p>
        <div className="settings-chip-row">
          <span className="settings-chip">Cifrado en servidor</span>
          <span className="settings-chip">Aislamiento por usuario</span>
          <span className="settings-chip">Scraping manual autenticado</span>
        </div>
      </section>

      <div className="settings-grid">
        <aside className="settings-panel">
          <div className="settings-panel-head">
            <h3>Resumen operativo</h3>
          </div>
          <div className="settings-panel-body">
            <div className="settings-mini-stat">
              <strong>{configuredCount}/3</strong>
              <span>Mayoristas con acceso listo</span>
            </div>
            <div className="settings-mini-stat" style={{ borderLeftColor: 'var(--color-positive)' }}>
              <strong>{profile.alertThreshold.toFixed(1)}%</strong>
              <span>Umbral de alerta personal</span>
            </div>
            <div className="settings-mini-stat" style={{ borderLeftColor: 'var(--color-warning)' }}>
              <strong>{broadcastInviteUrl ? 'Activo' : 'Pendiente'}</strong>
              <span>Canal público de Telegram</span>
            </div>

            <div className="credential-note">
              El scraping programado puede seguir usando `.env` como respaldo, pero el disparo
              manual del tablero ya puede trabajar con tus credenciales guardadas.
            </div>

            {broadcastInviteUrl ? (
              <a
                className="settings-link-button"
                href={broadcastInviteUrl}
                target="_blank"
                rel="noreferrer"
              >
                Unirse al canal de anuncios
              </a>
            ) : (
              <div className="credential-note">
                Define `TELEGRAM_BROADCAST_INVITE_URL` para habilitar el acceso al canal público.
              </div>
            )}
          </div>
        </aside>

        <div style={{ display: 'grid', gap: 18 }}>
          <section className="settings-panel">
            <div className="settings-panel-head">
              <h3>Preferencias del usuario</h3>
              <span className="auth-badge">Perfil de auditor</span>
            </div>
            <div className="settings-panel-body">
              <div className="settings-form-grid two">
                <div className="settings-form-field">
                  <label htmlFor="settings-name">Nombre visible</label>
                  <input
                    id="settings-name"
                    value={profile.name}
                    onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Analista comercial"
                  />
                </div>

                <div className="settings-form-field">
                  <label htmlFor="settings-email">Correo de acceso</label>
                  <input id="settings-email" value={profile.email} readOnly />
                </div>
              </div>

              <div className="settings-form-grid two">
                <div className="settings-form-field">
                  <label htmlFor="settings-threshold">Umbral de alerta (%)</label>
                  <input
                    id="settings-threshold"
                    type="number"
                    min={0}
                    step={0.1}
                    value={profile.alertThreshold}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        alertThreshold: Number(event.target.value || 0),
                      }))
                    }
                  />
                </div>

                <div className="settings-form-field">
                  <label htmlFor="settings-channel">Canal público de Telegram</label>
                  <div className="settings-channel-cta" id="settings-channel">
                    <span>
                      {broadcastInviteUrl
                        ? 'Usa este acceso para unirte al canal y recibir los anuncios del bot.'
                        : 'El enlace de invitación todavía no está definido en el entorno.'}
                    </span>
                    {broadcastInviteUrl ? (
                      <a href={broadcastInviteUrl} target="_blank" rel="noreferrer">
                        Unirme al canal
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="credential-note">
                El canal público de anuncios del bot se configura a nivel global en el entorno con
                <strong> TELEGRAM_BROADCAST_CHAT_ID </strong> y no aquí, porque lo comparten todos los usuarios.
              </div>
            </div>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-head">
              <h3>Accesos mayoristas personales</h3>
              <span className="auth-badge">Uso privado</span>
            </div>
            <div className="settings-panel-body">
              {isLoading ? <div className="credential-note">Cargando configuración...</div> : null}

              <div className="settings-credential-grid">
                {credentials.map((credential) => {
                  const statusReady = credential.hasPassword && !credential.remove;

                  return (
                    <article className="credential-card" key={credential.provider}>
                      <div className="credential-card-head">
                        <div>
                          <strong style={{ display: 'block', fontSize: 15 }}>{credential.label}</strong>
                          <span className={`credential-status ${statusReady ? 'ready' : ''}`}>
                            {credential.remove
                              ? 'Se eliminará al guardar'
                              : statusReady
                                ? 'Acceso guardado'
                                : 'Pendiente'}
                          </span>
                        </div>
                        <button
                          className="settings-secondary"
                          type="button"
                          onClick={() =>
                            updateCredential(credential.provider, {
                              username: '',
                              password: '',
                              hasPassword: false,
                              remove: true,
                            })
                          }
                        >
                          Borrar acceso
                        </button>
                      </div>

                      <div className="credential-card-body">
                        <div className="credential-note">{credential.hint}</div>

                        <div className="settings-form-grid two">
                          <div className="settings-form-field">
                            <label htmlFor={`user-${credential.provider}`}>Usuario</label>
                            <input
                              id={`user-${credential.provider}`}
                              value={credential.username}
                              onChange={(event) =>
                                updateCredential(credential.provider, {
                                  username: event.target.value,
                                  remove: false,
                                })
                              }
                              placeholder="Usuario mayorista"
                            />
                          </div>

                          <div className="settings-form-field">
                            <label htmlFor={`pass-${credential.provider}`}>Contraseña</label>
                            <div className="settings-password-field">
                              <input
                                id={`pass-${credential.provider}`}
                                type={visiblePasswords[credential.provider] ? 'text' : 'password'}
                                value={credential.password}
                                onChange={(event) =>
                                  updateCredential(credential.provider, {
                                    password: event.target.value,
                                    remove: false,
                                  })
                                }
                                placeholder={
                                  credential.hasPassword && !credential.remove
                                    ? 'Dejar en blanco para conservar'
                                    : 'Contraseña mayorista'
                                }
                              />
                              <button
                                className="settings-password-toggle"
                                type="button"
                                onClick={() => togglePasswordVisibility(credential.provider)}
                                aria-label={
                                  visiblePasswords[credential.provider]
                                    ? `Ocultar contraseña de ${credential.label}`
                                    : `Mostrar contraseña de ${credential.label}`
                                }
                              >
                                {visiblePasswords[credential.provider] ? 'Ocultar' : 'Ver'}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="credential-note">
                          {credential.configuredAt && !credential.remove
                            ? `Última actualización: ${new Date(credential.configuredAt).toLocaleString('es-PE')}`
                            : 'Aún no hay una credencial persistida para este proveedor.'}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {feedback ? (
                <div className={`settings-feedback${feedback.type === 'error' ? ' error' : ''}`}>
                  {feedback.message}
                </div>
              ) : null}

              <div className="settings-actions">
                <div className="credential-note">
                  Tus credenciales solo se exponen a tu sesión autenticada y se cifran antes de llegar a la base de datos.
                </div>
                <button className="settings-primary" type="button" onClick={handleSave} disabled={isSaving || isLoading}>
                  {isSaving ? 'Guardando...' : 'Guardar configuración'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
