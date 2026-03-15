# Accountancy Manager

## Overview

A full-stack accountancy/bookkeeping web application built with React + Vite (frontend) and Express (backend), using PostgreSQL for persistent storage.

## Features

- **Dashboard**: Summary cards (net balance, total income/expenses, transaction count), monthly income vs. expense bar chart, expense category breakdown pie chart, recent transactions list
- **Transactions**: Full searchable and filterable transaction table with add/edit/delete support
- **Manual Entry**: Add individual transactions (date, description, amount, type, category, notes, reference)
- **Statement Upload**: Upload CSV or PDF bank statements — automatically parsed, categorized, and imported
- **Accounts**: Manage multiple accounts (checking, savings, credit, investment, other) with currency and balance tracking

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite, TailwindCSS, shadcn/ui, Recharts, React Hook Form, React Query
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **File uploads**: multer (in-memory), csv-parse for CSV parsing, PDF text extraction (heuristic)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/          # Express API server
│   │   └── src/routes/
│   │       ├── accounts.ts      # GET/POST/DELETE /api/accounts
│   │       ├── transactions.ts  # GET/POST/PUT/DELETE /api/transactions
│   │       ├── statements.ts    # POST /api/statements/upload
│   │       └── dashboard.ts     # GET /api/dashboard/summary|monthly|categories
│   └── accountancy/         # React + Vite frontend
│       └── src/
│           ├── pages/           # Dashboard, Transactions, Accounts, Upload
│           └── components/      # Sidebar, Layout, UI components
├── lib/
│   ├── api-spec/openapi.yaml    # OpenAPI 3.1 spec (source of truth)
│   ├── api-client-react/        # Generated React Query hooks
│   ├── api-zod/                 # Generated Zod schemas
│   └── db/src/schema/
│       ├── accounts.ts          # accounts table
│       └── transactions.ts      # transactions table
```

## API Endpoints

- `GET /api/healthz` — health check
- `GET /api/accounts` — list accounts
- `POST /api/accounts` — create account
- `DELETE /api/accounts/:id` — delete account
- `GET /api/transactions` — list with filters (accountId, category, type, startDate, endDate, limit, offset)
- `POST /api/transactions` — create transaction
- `PUT /api/transactions/:id` — update transaction
- `DELETE /api/transactions/:id` — delete transaction
- `POST /api/statements/upload` — upload CSV/PDF statement (multipart/form-data: file + accountId)
- `GET /api/dashboard/summary` — summary stats
- `GET /api/dashboard/monthly` — monthly income/expense data
- `GET /api/dashboard/categories` — expense category breakdown

## Transaction Categories

Salary, Sales, Office Supplies, Rent, Utilities, Travel, Food, Healthcare, Entertainment, Tax, Insurance, Software, Refund, Income, Other

## Transaction Types

income, expense, transfer

## Account Types

checking, savings, credit, investment, other
