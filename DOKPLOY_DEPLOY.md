# Despliegue en Dokploy con Compose

Este proyecto ya quedó preparado para desplegarse en Dokploy usando `compose.yml`, con tres servicios:

- `postgres`: base de datos PostgreSQL persistente.
- `app`: aplicación Next.js.
- `worker`: scheduler de scraping y comandos del bot de Telegram.

## Archivos usados

- `compose.yml`
- `Dockerfile`
- `docker/start-app.sh`
- `docker/start-worker.sh`
- `.env.dokploy.example`

## Antes de desplegar

1. Sube el repositorio con estos archivos incluidos.
2. Ten listo el dominio final que usará la app, por ejemplo `https://precios.tudominio.com`.
3. Genera secretos largos para:
   - `NEXTAUTH_SECRET`
   - `CREDENTIALS_SECRET_KEY`
   - `POSTGRES_PASSWORD`

Ejemplo para generarlos localmente:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Crear el proyecto en Dokploy

1. En Dokploy crea un proyecto nuevo desde tu repositorio Git.
2. Elige despliegue por `Docker Compose`.
3. Indica como archivo principal: `compose.yml`.
4. Configura la rama correcta, normalmente `main`.

## Variables de entorno

Carga en Dokploy todas las variables de `.env.dokploy.example`.

### Variables obligatorias

- `POSTGRES_PASSWORD`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `CREDENTIALS_SECRET_KEY`
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BROADCAST_CHAT_ID`
- `TELEGRAM_BROADCAST_INVITE_URL`
- `NEXT_PUBLIC_APP_URL`

### Variables recomendadas

- `POSTGRES_DB=precios_pe`
- `POSTGRES_USER=preciospe`
- `APP_PORT=3000`
- `ADMIN_SEED_PASSWORD=Admin12345!`
- `MIN_MARGIN_PERCENT=15`
- `SCRAPE_INTERVAL_HOURS=3`

### Variables de mayoristas

Déjalas vacías si todavía no tienes acceso, pero si quieres scraping autenticado automático en producción define:

- `DELTRON_USER`
- `DELTRON_PASS`
- `INGRAM_USER`
- `INGRAM_PASS`
- `INTCOMEX_USER`
- `INTCOMEX_PASS`

## Valores exactos que deben coincidir con tu dominio

Si tu dominio final será `https://precios.tudominio.com`, entonces estas dos variables deben quedar exactamente así:

```env
NEXTAUTH_URL=https://precios.tudominio.com
NEXT_PUBLIC_APP_URL=https://precios.tudominio.com
```

No uses `localhost` en producción. Si dejas `localhost`, fallarán enlaces del dashboard, sesiones y botones de Telegram.

## Dominio en Dokploy

Asocia el dominio público al servicio `app`.

El contenedor expone el puerto interno `3000`. En el `compose.yml` ya está publicado con:

```yaml
ports:
  - ${APP_PORT:-3000}:3000
```

Si Dokploy te pide puerto del servicio web, usa `3000`.

## Qué hace el arranque

### Servicio `app`

Al iniciar:

1. genera cliente Prisma,
2. ejecuta `prisma db push`,
3. ejecuta `prisma db seed`,
4. levanta Next.js en `0.0.0.0:3000`.

### Servicio `worker`

Al iniciar:

1. genera cliente Prisma,
2. verifica el esquema,
3. inicia el scheduler,
4. lanza el bot de Telegram para `/status` y `/alertas` si hay token configurado.

## Primer despliegue recomendado

1. Configura variables.
2. Ejecuta el deploy.
3. Espera a que `postgres` quede healthy.
4. Verifica que `app` quede healthy.
5. Verifica que `worker` arranque sin errores.

## Qué revisar en logs si algo falla

### Si falla `app`

Busca en logs de `app`:

- errores de `prisma db push`
- error por `DATABASE_URL`
- error por `NEXTAUTH_SECRET`
- error por build de Next.js

### Si falla `worker`

Busca en logs de `worker`:

- errores de credenciales mayoristas
- errores de Playwright
- errores del bot de Telegram

## Validaciones después del despliegue

Comprueba esto en orden:

1. La página `/login` abre correctamente.
2. Puedes iniciar sesión con `admin@precios.pe` y la contraseña de `ADMIN_SEED_PASSWORD`.
3. El panel `settings` muestra el botón para unirse al canal.
4. El worker inicia y programa scraping según `SCRAPE_INTERVAL_HOURS`.
5. Telegram publica sin enlaces `localhost`.

## Si necesitas redeploy sin errores comunes

- Cambiaste dominio: actualiza `NEXTAUTH_URL` y `NEXT_PUBLIC_APP_URL`.
- Cambiaste secreto de auth: reinicia `app` y `worker`.
- Cambiaste estructura Prisma: vuelve a desplegar; `db push` se ejecuta al arranque.
- Cambiaste variables de Telegram o mayoristas: reinicia `app` y `worker`.

## Notas importantes

- No subas `.env` al repositorio.
- Usa solo variables cargadas en Dokploy.
- El volumen `postgres-data` ya persiste la base de datos.
- Si quieres separar la base de datos fuera de Dokploy, solo cambia `DATABASE_URL` y elimina el servicio `postgres` del `compose.yml`.