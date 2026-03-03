# Backend B2B/B2C - E-commerce Platform

Professional central backend system for a high-performance E-commerce platform. Built with Node.js, Express, and Prisma ORM.

## 🚀 Core Architectural Features

- **Zero-Trust Proxy Security**: The backend never trusts prices or totals sent by the frontend's cart. It meticulously reconstructs orders, calculates overlapping discounts, validates SKU physical stock, and injects shipping costs completely server-side to prevent bypasses.
- **Financial Immutability**: All accounting prices are handled in a "Base Currency" in the DB. Post-checkout, a "Snapshot" of the exact historical exchange rate is saved. Future fluctuations do not alter old fiscal order records.
- **Strategy Pattern for Payments**: Gateways are not hardcoded. A `PaymentFactory` dynamically delegates processing to specific strategies (`MercadoPagoStrategy`, `PayPalStrategy`, `StripeStrategy`), ensuring modular scalability for new methods.
- **Secure Settlement Webhooks**: Exposed endpoints that asynchronously react to PayPal/Stripe IPNs to automatically mutate purchase states (Pending -> Confirmed/Cancelled) with signature encryption validation.
- **Autonomous Maintenance (Cron Jobs)**: Background executions that audit abandoned carts, release frozen physical stock from dropped payments, and automate daily database backups.
- **Pure Core Report Generator**: Dedicated services exporting PDF commercial invoices and Batch Barcode Sheets directly from the server.
- **Real-Time Module**: Socket.io integration mapping specific channels for live customer support (CX Inbox) and instant system notifications.

## 🛠️ Technology Stack

- **Runtime**: Node.js (v20+)
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: Express-Validator
- **Testing**: Node Test Runner & Supertest

## 📦 Setup & Installation

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Setup**:
    Copy `.env.example` to `.env` and configure your credentials.
    ```bash
    cp .env.example .env
    ```

## 🗄️ Database Management

1.  **Run Migrations**:
    ```bash
    npx prisma migrate deploy
    ```
2.  **Seed Database (Critical)**:
    Initializes Roles, Permissions, and Default Super Admin.
    ```bash
    npx prisma db seed
    ```

## ⚡ Execution

- **Development Mode**:
    ```bash
    npm run dev
    ```
- **Production Mode**:
    ```bash
    npm start
    ```
- **Run Tests**:
    ```bash
    npm test
    ```

## 🔑 Caged Access (RBAC)

- **SUPER_ADMIN**: Absolute system control and multi-tenant expansion.
- **ADMIN**: Content, promotion, sales, and user management.
- **EMPLOYEE**: Local branch constraints, physical sales handling (POS access).
- **CUSTOMER**: Online B2C purchasing, unprivileged profiling.

## 📁 Clean Architecture Structure

```
src/
├── app.js        # Core App initialization
├── server.js     # Entry Point & Sockets connection
├── config/       # Environment & Database Context
├── routes/       # API Gateway Definitions
├── controllers/  # Http Request Handlers
├── middlewares/  # Extractor, Auth Wall, Validation Traps
├── services/     # Pure Business Logic (CRUD, Factory, etc)
├── cron/         # Scheduled autonomous routines
└── utils/        # Shared pure helpers
```

---
© 2026 Proprietary Software. All rights reserved.
