# Reconciliation Cockpit

## Overview

A high-performance financial reconciliation interface designed to match bank transactions with orders. The application features a split-screen "cockpit" layout optimized for rapid manual and automated matching of financial records.

Key capabilities:
- Upload and manage bank transaction files
- Fetch and display orders from external APIs
- Smart matching engine with automated suggestions
- Match quality indicators (reference match, name similarity, date/amount differences)
- Reconciliation status tracking and history

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite with custom plugins for Replit integration
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with dark mode default (financial cockpit aesthetic)
- **Animations**: Framer Motion for smooth UI transitions

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints under `/api/` prefix
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Schema Validation**: Zod with drizzle-zod integration

### Data Storage
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema**: Two main tables - `bank_transactions` and `orders`
- **Key Fields**: Transaction hash as primary key for bank records, order_id for orders
- **Matching Fields**: Reference flags, name scores, date/amount differences, reconciliation status

### Build & Development
- **Development**: Vite dev server with HMR for frontend, tsx for backend
- **Production**: esbuild bundles server code, Vite builds client assets
- **Output**: Combined build outputs to `dist/` directory

### Key Design Patterns
- Shared schema definitions between frontend and backend (`shared/schema.ts`)
- Path aliases for clean imports (`@/` for client, `@shared/` for shared code)
- Storage interface pattern for database operations
- Bulk operations support for importing multiple records

## External Dependencies

### Database
- PostgreSQL database required (provision via Replit or external provider)
- Connection via `DATABASE_URL` environment variable

### Core Libraries
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `@tanstack/react-query`: Data fetching and caching
- `express`: HTTP server framework
- `zod`: Runtime type validation

### UI Framework
- `@radix-ui/*`: Accessible component primitives
- `tailwindcss`: Utility-first CSS
- `framer-motion`: Animation library
- `lucide-react`: Icon library

### Development Tools
- `tsx`: TypeScript execution for development
- `esbuild`: Fast JavaScript bundler for production
- `vite`: Frontend build tool and dev server