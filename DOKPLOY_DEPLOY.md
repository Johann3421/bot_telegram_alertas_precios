# Despliegue en Dokploy con Docker Compose

Guía paso a paso para subir este proyecto a Dokploy desde cero.

---

## Servicios incluidos

| Servicio   | Descripción |
|------------|-------------|
| `postgres` | PostgreSQL 16 con volumen persistente |
| `app`      | Next.js 14 (dashboard + API) |
| `worker`   | Scheduler de scraping + bot de Telegram |

---

## Paso 0 — Antes de empezar

Necesitas tener listo:

1. **El repo en GitHub/GitLab** con el código subido (rama `main`).
2. **Tu dominio** apuntando al servidor Dokploy (ej. `precios.tudominio.com`).
3. **Tres secretos generados.** Ejecútalos en tu terminal local, uno por uno, y guarda cada resultado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Necesitas tres valores distintos para: `NEXTAUTH_SECRET`, `CREDENTIALS_SECRET_KEY` y `POSTGRES_PASSWORD`.

---

## Paso 1 — Crear el proyecto en Dokploy

1. Inicia sesión en tu panel de Dokploy.
2. Clic en **"Projects"** → **"Create Project"** → ponle un nombre (ej. `precios-pe`).
3. Dentro del proyecto, clic en **"Create Service"** → elige **"Docker Compose"**.
4. Conecta tu repositorio Git:
   - Selecciona el proveedor (GitHub / GitLab / Gitea).
   - Elige el repositorio del proyecto.
   - Configura la rama: `main`.
5. En el campo **"Compose File"** escribe: `compose.yml`
6. Clic en **"Save"** (aún NO hagas deploy).

---

## Paso 2 — Configurar las variables de entorno

Esto es lo más importante. Un valor erróneo aquí derribará los servicios.

1. En la pantalla del servicio Compose, ve a la pestaña **"Environment"**.
2. Copia y pega el bloque completo de abajo, **reemplazando cada valor** por el tuyo.
3. Clic en **"Save"**.

```env
# Postgres
POSTGRES_DB=precios_pe
POSTGRES_USER=preciospe
POSTGRES_PASSWORD=REEMPLAZA_CON_TU_PASSWORD_SEGURA

# Puerto host para Dokploy (mapea al puerto de contenedor 3000). Cambia si tu plataforma usa otro puerto.
APP_PORT=3308

# Next.js / Auth
# Pon aquí tu dominio real con https://, sin barra al final
NEXTAUTH_URL=https://precios.tudominio.com
NEXT_PUBLIC_APP_URL=https://precios.tudominio.com
NEXTAUTH_SECRET=REEMPLAZA_CON_SECRETO_LARGO_1
CREDENTIALS_SECRET_KEY=REEMPLAZA_CON_SECRETO_LARGO_2

# Usuario administrador inicial (se crea solo en el seed)
ADMIN_SEED_PASSWORD=Cambia123!

# OpenAI (normalización IA)
OPENAI_API_KEY=sk-...

# Telegram
TELEGRAM_BOT_TOKEN=token-del-bot
TELEGRAM_BROADCAST_CHAT_ID=@tu_canal
TELEGRAM_BROADCAST_INVITE_URL=https://t.me/tu_canal

# Scraping
MIN_MARGIN_PERCENT=15
SCRAPE_INTERVAL_HOURS=3

# Mayoristas (opcional, dejar vacíos si no tienes acceso)
DELTRON_USER=
DELTRON_PASS=
INGRAM_USER=
INGRAM_PASS=
INTCOMEX_USER=
INTCOMEX_PASS=
```

> **Importante:** `DATABASE_URL` **no** hay que definirla. El `compose.yml` la construye automáticamente usando las variables de Postgres de arriba.

> **No uses `localhost`** en `NEXTAUTH_URL` ni `NEXT_PUBLIC_APP_URL`. Si queda `localhost`, las sesiones fallarán y el bot de Telegram enviará botones rotos.

---

## Paso 3 — Configurar el dominio

1. En la pestaña **"Domains"** del servicio Compose (o en la configuración del servicio `app`), clic en **"Add Domain"**.
2. Completa los campos:
   - **Domain**: `precios.tudominio.com`
   - **Service**: `app`
   - **Port**: `3000` (puerto interno del contenedor). El mapeo al puerto público se controla con `APP_PORT` (valor por defecto `3308`).
   - **HTTPS**: activar (Dokploy gestiona el certificado Let's Encrypt automáticamente)
3. Clic en **"Save"**.

---

## Paso 4 — Ejecutar el primer deploy

1. Ve a la pestaña **"Deployments"** del servicio Compose.
2. Clic en **"Deploy"** (o **"Redeploy"**).
3. Dokploy hará `docker compose up --build` en tu servidor:
   - Construirá la imagen desde el `Dockerfile`.
   - Levantará `postgres` primero y esperará que quede healthy.
   - Levantará `app`: generará Prisma, sincronizará el esquema, correrá el seed, y arrancará Next.js.
   - Levantará `worker`: generará Prisma, verificará el esquema, iniciará el scheduler y el bot.

El primer build tarda entre 3 y 8 minutos por la instalación de Playwright y las dependencias de Node.

---

## Paso 5 — Verificar que funciona

Cuando el deploy termine, comprueba en orden:

| # | Qué hacer | Resultado esperado |
|---|-----------|-------------------|
| 1 | Abrir `https://precios.tudominio.com/login` | Página de login visible |
| 2 | Iniciar sesión con `admin@precios.pe` y el valor de `ADMIN_SEED_PASSWORD` | Entra al dashboard |
| 3 | Ir a **Settings** → sección Telegram | Muestra el botón de unirse al canal |
| 4 | Revisar logs del servicio `worker` en Dokploy | Incluye `[Worker] Iniciando scheduler...` |
| 5 | Esperar el primer ciclo de scraping (`SCRAPE_INTERVAL_HOURS`) | El bot publica en el canal sin errores |

---

## Diagnóstico de errores comunes

### El deploy falla en el build

- Revisa que el repo tiene `Dockerfile` y `compose.yml` en la raíz.
- Revisa que la rama configurada sea `main` (o la correcta).

### `app` cae con error de base de datos

- Verifica que `POSTGRES_PASSWORD` sea exactamente el mismo valor en `POSTGRES_PASSWORD` y que el servicio `postgres` esté healthy antes de que `app` arranque (el `compose.yml` ya garantiza esto con `depends_on`).
- Asegúrate de que no definiste una `DATABASE_URL` manual con host incorrecto. Bórrala si la pusiste.

### Error `NEXTAUTH_SECRET` o sesión inválida

- Verifica que `NEXTAUTH_SECRET` no esté vacío y que `NEXTAUTH_URL` coincida exactamente con el dominio que usas en el navegador (incluyendo `https://`).

### El bot de Telegram falla

- Verifica que `TELEGRAM_BOT_TOKEN` sea correcto.
- Verifica que `TELEGRAM_BROADCAST_CHAT_ID` empiece con `@` (p.ej. `@micanal`) o sea el chat id numérico con `-100...`.
- Verifica que `TELEGRAM_BROADCAST_INVITE_URL` sea una URL pública, no `localhost`.

### `worker` falla con error de Playwright

- Es normal en el primer arranque si los navegadores aún se están instalando. Espera unos segundos y revisa si se estabiliza.
- Si persiste, verifica que la imagen base `mcr.microsoft.com/playwright:v1.58.2-noble` se descargó correctamente en el servidor.

---

## Redeployar después de cambios

| Cambio realizado | Acción en Dokploy |
|------------------|-------------------|
| Código nuevo subido a Git | Clic en "Redeploy" |
| Cambio de dominio | Actualizar `NEXTAUTH_URL` y `NEXT_PUBLIC_APP_URL` → Redeploy |
| Cambio de secreto de auth | Actualizar variable → Redeploy |
| Cambio en schema Prisma | Solo Redeploy (`db push` se ejecuta automáticamente al arranque) |
| Cambio de token de Telegram | Actualizar variable → Redeploy |

---

## Notas finales

- **No subas `.env` al repositorio.** El `.gitignore` ya lo excluye.
- El volumen `postgres-data` persiste la base de datos entre redeployments. Si necesitas reset total, bórralo desde Dokploy → Volumes.
- Si usas base de datos externa (Neon, Supabase, etc.), define `DATABASE_URL` directamente con la URL externa y elimina el servicio `postgres` del `compose.yml`.