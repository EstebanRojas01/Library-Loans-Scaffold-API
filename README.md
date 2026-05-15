# Library Loans API

Sistema de préstamos de biblioteca — ISIS 3710.

## Setup rápido

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Base de datos (Postgres 16)
docker compose up -d

# 3. Dependencias
npm install

# 4. Migraciones
npm run migration:run

# 5. Desarrollo
npm run start:dev
```

Swagger UI: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## Variables de entorno (.env)

| Variable | Descripción | Default |
|---|---|---|
| `DB_HOST` | Host Postgres | — |
| `DB_PORT` | Puerto Postgres | 5432 |
| `DB_USER` | Usuario DB | — |
| `DB_PASSWORD` | Password DB | — |
| `DB_NAME` | Nombre DB | — |
| `DB_SYNCHRONIZE` | Auto-sync esquema (solo dev) | `false` |
| `JWT_ACCESS_SECRET` | Secret JWT access (≥32 chars) | — |
| `JWT_ACCESS_EXPIRES_IN` | Expiración access token | `15m` |
| `JWT_REFRESH_SECRET` | Secret JWT refresh (≥32 chars) | — |
| `JWT_REFRESH_EXPIRES_IN` | Expiración refresh token | `7d` |
| `BCRYPT_SALT_ROUNDS` | Rondas bcrypt (4-15) | `10` |
| `MAX_ACTIVE_LOANS` | Máx. préstamos activos por usuario | `3` |
| `DAILY_FINE_RATE` | Multa diaria por atraso (USD) | `0.50` |
| `MAX_LOAN_DAYS` | Máximo días de préstamo | `30` |

## Docker

```bash
docker compose up -d    # levanta Postgres
docker compose down     # detiene y elimina contenedor
docker compose down -v  # también elimina volumen (borra datos)
```

## Migraciones

```bash
npm run migration:run                                    # aplica pendientes
npm run migration:revert                                 # revierte última
npm run migration:generate src/database/migrations/Nombre  # genera desde entidades
```

**No usar `DB_SYNCHRONIZE=true` en producción.**

## Scripts

| Script | Descripción |
|---|---|
| `npm run start:dev` | Hot reload |
| `npm run start:prod` | Producción (requiere build) |
| `npm run build` | Compila a `dist/` |
| `npm test` | Tests unitarios |
| `npm run test:cov` | Tests con coverage |
| `npm run lint` | ESLint + autofix |

## Flujo básico

```
POST /api/auth/register   → crea cuenta
POST /api/auth/login      → obtiene accessToken + refreshToken
GET  /api/auth/me         → perfil del usuario autenticado

POST  /api/items          → crea item (admin/librarian)
GET   /api/items          → lista items activos (filtros: search, type, available)
GET   /api/items/:id      → detalle de item
PATCH /api/items/:id      → actualiza item
DELETE /api/items/:id     → soft delete (isActive=false)

POST  /api/loans             → crea préstamo (requiere dueAt en body)
GET   /api/loans             → lista préstamos
GET   /api/loans/:id         → detalle de préstamo
PATCH /api/loans/:id/return  → devuelve item (calcula multa si vencido)
PATCH /api/loans/:id/mark-lost → marca préstamo como perdido
```

## Reglas de negocio

| Regla | Descripción | Excepción |
|---|---|---|
| R1 | `dueAt > ahora` y `≤ 30 días` | `400 BadRequest` |
| R2 | Item sin copias disponibles | `409 Conflict` |
| R3 | Usuario con ≥3 préstamos activos/vencidos | `409 Conflict` |
| R4 | Multa = `Math.ceil(díasAtraso) × DAILY_FINE_RATE` | — |
| R5 | FSM: `returned` y `lost` son estados terminales | `400 BadRequest` |

## Transición automática a `overdue` (decisión de diseño)

No se implementó un job cron. La transición a `overdue` es **lazy**: el sistema no actualiza
el status en BD automáticamente, pero `LoansService` expone `markAllOverdue()` que puede
invocarse manualmente o conectarse a un scheduler.

Para consultar préstamos vencidos, `GET /api/loans?status=overdue` devuelve los préstamos
cuyo status ya es `overdue` en BD. Si se quiere incluir los préstamos `active` con
`dueAt < now()`, actualizar primero con `markAllOverdue()` o añadir un `@Cron` job.

La regla de negocio R4 (multa) funciona correctamente independientemente del status
almacenado: `returnLoan` calcula `Math.ceil((returnedAt - dueAt) / 1 día)` comparando
timestamps, no el campo `status`.

## Swagger

Auth JWT Bearer configurado en Swagger. Flujo:
1. Login → copiar `accessToken`
2. Click "Authorize" → pegar token
3. Todos los endpoints protegidos disponibles

## Bonos implementados

| Bono | Descripción | Estado |
|---|---|---|
| B2 +5% | Refresh tokens stateful (POST /auth/refresh, POST /auth/logout) | ✅ |
| B3 +4% | GitHub Actions CI (lint + test en cada push/PR) | ✅ |
| B3 +1% | Docker build en CI | ✅ |
| B4 +3% | Suite e2e (flujo completo + fineAmount) + matriz FSM con it.each | ✅ |

## Qué incluye este scaffold

- **NestJS 10** inicializado.
- **Docker Compose** con Postgres 16-alpine.
- **`ConfigModule`** con validación Joi al arranque (todas las variables requeridas están en `.env.example`).
- **`ValidationPipe`** global con `whitelist`, `forbidNonWhitelisted`, `transform`.
- **Swagger UI** montado en `/api/docs`.
- **Módulo `health`** con `/api/health/live` y `/api/health/ready` como referencia mínima de un módulo NestJS.
- **`@Public()` decorator** en [src/common/decorators/public.decorator.ts](src/common/decorators/public.decorator.ts) listo para usar cuando implementes auth.
- **CLI de TypeORM** configurado en [src/database/data-source.ts](src/database/data-source.ts) — corre `npm run migration:generate` para crear migraciones.

## Qué NO incluye (lo implementas tú)

- Módulo `auth` (entidad `User`, register, login, JWT strategy, guards).
- Entidades `Item` y `Loan`.
- Cualquier migración.
- Tests.

Ver el enunciado para los pesos exactos de cada parte.

## Arranque rápido

```bash
# 1) Variables de entorno
cp .env.example .env

# 2) Base de datos
docker compose up -d

# 3) Dependencias
npm install

# 4) Build
npm run build

# 5) Arrancar la app en modo desarrollo
npm run start:dev
```

Abre [http://localhost:3000/api/docs](http://localhost:3000/api/docs) y deberías ver el Swagger UI con el módulo `health` ya disponible.

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run start:dev` | Arranca con hot reload. |
| `npm run start:prod` | Arranca el build de producción (requiere `npm run build` antes). |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm run lint` | ESLint con autofix. |
| `npm run format` | Prettier. |
| `npm test` | Tests unitarios. |
| `npm run test:cov` | Tests con coverage. |
| `npm run test:e2e` | Tests e2e con `jest-e2e.json`. |
| `npm run migration:generate src/database/migrations/NombreDeLaMigracion` | Genera migración a partir del diff entre entidades y BD. |
| `npm run migration:run` | Aplica migraciones pendientes. |
| `npm run migration:revert` | Revierte la última migración. |

## Estructura

```
library-loans-scaffold/
├── docker-compose.yml          # Postgres 16-alpine
├── .env.example                # plantilla de variables (cópiala a .env)
├── package.json
├── tsconfig.json
├── nest-cli.json
├── src/
│   ├── main.ts                 # bootstrap: ValidationPipe + Swagger + /api prefix
│   ├── app.module.ts           # ConfigModule + TypeOrmModule + HealthModule
│   ├── config/
│   │   ├── configuration.ts    # AppConfig interface + factory
│   │   └── validation.schema.ts # Joi schema
│   ├── database/
│   │   ├── data-source.ts      # DataSource para CLI de TypeORM
│   │   └── migrations/         # (vacío — aquí van tus migraciones)
│   ├── common/
│   │   └── decorators/
│   │       └── public.decorator.ts
│   └── modules/
│       └── health/
│           ├── health.module.ts
│           └── health.controller.ts
└── test/
    └── jest-e2e.json
```

## Aliases de path

Configurados en `tsconfig.json` para imports limpios:

```typescript
import { ItemsModule } from '@modules/items/items.module';
import { Public } from '@common/decorators/public.decorator';
import configuration from '@config/configuration';
import { AppDataSource } from '@database/data-source';
```

## Configuración: variables que el scaffold ya valida

El `validationSchema` de Joi exige al arranque:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (todas requeridas, sin defaults).
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (mínimo 32 caracteres).
- `BCRYPT_SALT_ROUNDS` (4-15, default 10).
- `MAX_ACTIVE_LOANS` (default 3), `DAILY_FINE_RATE` (default 0.50), `MAX_LOAN_DAYS` (default 30) — usadas por las reglas de negocio que implementarás (ver enunciado §4.4).

Si falta alguna requerida o no cumple el formato, la app **falla al arrancar** con un mensaje claro.

## Siguiente paso

Lee el enunciado completo:

```bash
open ../meditrack-api/docs/enunciado-parcial.md
```

Empieza por implementar la entidad `User` y el módulo `auth` (§4.1 del enunciado). Sin auth, los demás endpoints no se pueden probar.

¡Éxitos!
