# Accountancy Manager

## Overview

A full-stack accountancy/bookkeeping web application built with React + Vite (frontend) and Express (backend), using PostgreSQL for persistent storage.

## Features

- **Authentication**: Replit OIDC (OpenID Connect) — login gate on all pages; first user automatically becomes admin
- **Role-based access**: Admin and User roles; admin-only pages/routes protected both client- and server-side
- **Dashboard**: Summary cards (net balance, total income/expenses, transaction count), monthly income vs. expense bar chart, expense category breakdown pie chart, recent transactions list
- **Transactions**: Full searchable and filterable transaction table with add/edit/delete support
- **Manual Entry**: Add individual transactions (date, description, amount, type, category, notes, reference)
- **Statement Upload**: Upload CSV or PDF bank statements — automatically parsed, categorized, and imported
- **Accounts**: Manage multiple accounts (checking, savings, credit, investment, other) with currency and balance tracking; "Fix & Recalculate Balance" button repairs legacy misclassified data
- **Profile**: Shows user avatar, name, email, role badge; language preference picker (saved to DB)
- **Admin Panel**: User management table with role toggle (admin ↔ user), stats cards (total/admins/users)
- **i18n**: Full English / Español / Deutsch translations via react-i18next; language saved to DB and localStorage

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite, TailwindCSS, shadcn/ui, Recharts, React Hook Form, React Query, react-i18next
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: openid-client, connect-pg-simple (session store), Replit OIDC
- **File uploads**: multer (in-memory), csv-parse for CSV parsing, pdf-parse for PDF text extraction

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/          # Express API server
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── accounts.ts      # GET/POST/PUT/DELETE /api/accounts + recalculate
│   │       │   ├── transactions.ts  # GET/POST/PUT/DELETE /api/transactions
│   │       │   ├── statements.ts    # POST /api/statements/upload
│   │       │   ├── dashboard.ts     # GET /api/dashboard/summary|monthly|categories
│   │       │   ├── auth.ts          # /api/login, /api/auth/callback, /api/auth/user, /api/logout
│   │       │   └── users.ts         # GET /api/users, PATCH role/language, GET /api/users/stats
│   │       ├── lib/
│   │       │   └── auth.ts          # OIDC helpers, session management, upsertUser
│   │       └── app.ts               # Express app setup (cookieParser, authMiddleware, routes)
│   └── accountancy/         # React + Vite frontend
│       └── src/
│           ├── pages/
│           │   ├── dashboard.tsx
│           │   ├── transactions.tsx
│           │   ├── accounts.tsx
│           │   ├── upload.tsx
│           │   ├── profile.tsx      # User profile + language switcher
│           │   ├── admin.tsx        # Admin user management
│           │   ├── login.tsx        # Auth gate page
│           │   └── not-found.tsx
│           ├── components/
│           │   ├── app-sidebar.tsx  # Sidebar with auth-aware nav + user footer
│           │   └── layout.tsx
│           └── lib/
│               └── i18n.ts          # Full EN/ES/DE translations
├── lib/
│   ├── api-spec/openapi.yaml        # OpenAPI 3.1 spec (source of truth)
│   ├── api-client-react/            # Generated React Query hooks + AuthUser type
│   ├── api-zod/                     # Generated Zod schemas
│   ├── replit-auth-web/             # useAuth() hook (wraps /api/auth/user)
│   └── db/src/schema/
│       ├── accounts.ts
│       ├── transactions.ts
│       └── auth.ts                  # sessions + users tables (role, language columns)
```

## API Endpoints

### Auth
- `GET /api/login` — redirect to Replit OIDC
- `GET /api/auth/callback` — OIDC callback, creates session
- `GET /api/auth/user` — returns `{ user: AuthUser | null }`
- `GET /api/logout` — clears session, redirects to OIDC end-session

### Users (admin-protected where noted)
- `GET /api/users` — list all users [admin only]
- `GET /api/users/stats` — `{ total, admins, users }` [admin only]
- `PATCH /api/users/:id/role` — change user role [admin only]
- `PATCH /api/users/me/language` — save language preference [authenticated]

### Accounts
- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/recalculate` — recompute balance from all transactions

### Transactions
- `GET /api/transactions` — filters: accountId, category, type, startDate, endDate, limit, offset
- `POST /api/transactions`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`

### Statements
- `POST /api/statements/upload` — multipart: file (CSV or PDF) + accountId

### Dashboard
- `GET /api/dashboard/summary`
- `GET /api/dashboard/monthly`
- `GET /api/dashboard/categories`

## Balance Sign Convention

For CornerCard PDF statements: negative amounts = card reloads = **income**; positive = **expenses**. Net balance = income_sum − expense_sum.

## Transaction Categories

Salary, Sales, Office Supplies, Rent, Utilities, Travel, Food, Healthcare, Entertainment, Tax, Insurance, Software, Refund, Income, Other

## Transaction Types

income, expense, transfer

## Account Types

checking, savings, credit, investment, other
