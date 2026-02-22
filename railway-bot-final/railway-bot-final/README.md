# Argentina RP Bot — Deploy en Railway

## Estructura del proyecto
```
argentina-rp-bot/
├── server/
│   ├── index.ts                  ← Entry point
│   ├── routes.ts                 ← Comandos del bot
│   ├── storage.ts                ← Acceso a la base de datos
│   ├── db.ts                     ← Conexión PostgreSQL
│   └── logo_argrp.png            ← (copiala de Replit si la tenés)
├── shared/
│   └── schema.ts                 ← Tablas de la base de datos
├── scripts/
│   └── importar-calificaciones.mjs ← Migración de datos de Replit
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── railway.json
└── .gitignore
```

---

## PASO A PASO COMPLETO

### 1. Preparar los archivos
- Descomprimí el ZIP
- Si tenés `logo_argrp.png` en Replit, copialo dentro de `server/`
- Si no la tenés, no importa, el bot funciona igual

### 2. Crear repositorio privado en GitHub
1. Entrá a https://github.com → **New repository**
2. Nombre: `argentina-rp-bot`
3. Visibilidad: **Private** ✅ (IMPORTANTE)
4. Subí todos los archivos de la carpeta descomprimida

### 3. Crear proyecto en Railway
1. Entrá a https://railway.com
2. **New Project** → **Deploy from GitHub repo**
3. Seleccioná `argentina-rp-bot`

### 4. Agregar base de datos PostgreSQL
1. Dentro de tu proyecto en Railway → **Add Service**
2. **Database** → **PostgreSQL**
3. Railway crea la base de datos automáticamente

### 5. Configurar variables de entorno
En el panel de tu **servicio del bot** (NO en PostgreSQL) → pestaña **Variables** → agregar:

| Variable        | Valor                        |
|-----------------|------------------------------|
| `DISCORD_TOKEN` | Tu token de Discord          |
| `DATABASE_URL`  | `${{Postgres.DATABASE_URL}}` |
| `NODE_ENV`      | `production`                 |

> ⚠️ El valor `${{Postgres.DATABASE_URL}}` se escribe TAL CUAL,
> Railway lo reemplaza automáticamente con la URL real.

### 6. Esperar el primer deploy
Railway va a buildear y arrancar el bot automáticamente.
Esperá que el deploy diga ✅ antes de continuar.

### 7. Importar las calificaciones (MUY IMPORTANTE)
Una vez que el bot esté deployado:

1. En Railway, dentro de tu servicio del bot → pestaña **Deploy** → botón **Open Terminal** (o "Railway Shell")
2. Ejecutá este comando:
```bash
node scripts/importar-calificaciones.mjs
```
3. Vas a ver algo así:
```
✅ Importación completada.
   → 50 calificaciones importadas
   → 0 omitidas (ya existían)
   → El contador de IDs fue ajustado correctamente.
```

**Esto importa los 50 registros de calificaciones de Replit a Railway. Solo ejecutarlo UNA VEZ.**

---

## Comandos del bot

| Comando           | Descripción                              | Permisos         |
|-------------------|------------------------------------------|------------------|
| `/verificar`      | Verifica a un usuario                    | Solo Moderadores |
| `/calificar-staff`| Califica a un moderador (guarda en DB)   | Todos            |
| `/lista-staff`    | Lista de moderadores y postulantes       | Todos            |
| `/añadir-rol`     | Añade un rol a un usuario                | Solo Moderadores |
| `/eliminar-rol`   | Elimina un rol de un usuario             | Solo Moderadores |
| `/muted`          | Silencia a un usuario                    | Solo Moderadores |
| `/entorno`        | Registra entorno del personaje           | Todos            |
| `/roblox-info`    | Info de cuenta de Roblox                 | Todos            |
| `/ayuda`          | Lista completa de comandos               | Todos            |
| `c?info`          | Información del bot                      | Todos            |
| `c?faq`           | Preguntas frecuentes                     | Todos            |
| `c?tecnicatura`   | Panel de tecnicaturas                    | Solo Moderadores |
