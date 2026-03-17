\# Accountant Hub - TBF\_AccountantApp



\## Comandos de Control (Build \& Test)

\- \*\*Verificar API\*\*: `node debug-api.js`

\- \*\*Ejecutar 8 Fixes\*\*: `node test-fixes.js`

\- \*\*Entorno Local\*\*: `npm run dev` (Frontend) / `npm run start` (Backend)



\## Guia de Estilo y Reglas

\- \*\*Rutas\*\*: Siempre usar `/` (prohibido `\\`).

\- \*\*Validacion\*\*: Ejecutar `test-fixes.js` antes de dar una tarea por terminada.

\- \*\*Commits\*\*: Seguir formato convencional (ej: `fix: descripción`).

\- \*\*Logica\*\*: Priorizar legibilidad sobre brevedad. Comentar logica compleja.



\## Arquitectura y Zonas Protegidas

\- \*\*Frontend\*\*: React 18 + Vite.

\- \*\*Backend\*\*: Express + Node 24.

\- \*\*DB\*\*: PostgreSQL (Drizzle ORM).

\- \*\*CRITICO\*\*: No modificar el sistema de Autenticacion (Replit OIDC) ni el esquema de la base de datos sin permiso explicito.

