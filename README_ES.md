# Backend Central - E-commerce Platform

Sistema backend profesional para una plataforma de E-commerce de alto rendimiento. Construido con Node.js, Express y Prisma ORM bajo conceptos de Arquitectura Limpia (Clean Architecture).

## 🚀 Características Arquitectónicas Core

- **Seguridad Proxy Zero-Trust**: El backend asume que el frontend miente. Reconstruye el carrito desde cero, recuperando precios de la base de datos, calculando descuentos anti-solapamiento y aplicando impuestos; previniendo del 100% de fraudes en manipulación de montos.
- **Inmutabilidad Financiera**: Operación base en "Moneda Principal". En el momento del pago, se toma una "fotografía" (Snapshot) del tipo de cambio exacto, blindando los registros fiscales de caja de futuras fluctuaciones económicas.
- **Patrón Strategy para Pagos**: Sistema escalable donde las integraciones no están hardcodeadas directamente. Un `PaymentFactory` delega peticiones dinámicamente a estrategias (`MercadoPagoStrategy`, `PayPalStrategy`, `StripeStrategy`), acelerando adiciones futuras.
- **Webhooks de Liquidación Segura**: Endpoints firmados criptográficamente para escuchar avisos asíncronos (IPN) de PayPal o Stripe, liquidando órdenes o devolviendo stock tras bloqueos automáticamente sin intervención humana.
- **Mantenimiento Autónomo (Cron Jobs)**: Procesos agendados en segundo plano que auditan y limpian carritos abandonados (descongelando unidades de stock amarrado) y emiten copias de seguridad incrementales automatizadas.
- **Servicios Puros de Reportes**: Exportación a nivel servidor de documentos PDF pesados (Facturas / Comprobantes) y planillas matriciales de generación de Códigos de Barras masivas por lote de SKU.
- **Módulo de Tiempo Real**: Implementación de Socket.io dividida en canales seguros para abastecer el módulo de Atención al Cliente (CX Inbox) de los administradores y alertas instantáneas de quiebre de stock.

## 🛠️ Tecnologías Empleadas

- **Runtime**: Node.js (v20+)
- **Framework REST**: Express.js
- **Base de Datos Relacional**: PostgreSQL
- **ORM Modular**: Prisma Client
- **Interceptores de Datos**: Express-Validator
- **Testing**: Node Test Runner & Supertest

## 📦 Configuración e Instalación

1.  **Clonar este directorio**
2.  **Instalar los paquetes del ecosistema**:
    ```bash
    npm install
    ```
3.  **Configurar Variables de Entorno**:
    Copiar el ejemplo a archivo activo e inyectar configuraciones locales.
    ```bash
    cp .env.example .env
    ```

## 🗄️ Despliegue de DB PostgreSQL

1.  **Ejecutar Migraciones Estructurales**:
    ```bash
    npx prisma migrate deploy
    ```
2.  **Poblar Data (Crucial)**:
    Siembra roles obligatorios y genera usuario Super_Admin para entrar por primera vez al panel.
    ```bash
    npx prisma db seed
    ```

## ⚡ Ejecución Múltiple

- **Ambiente Desarrollo**:
    ```bash
    npm run dev
    ```
- **Arranque en Producción**:
    ```bash
    npm start
    ```
- **Auditoría de Tests Puros**:
    ```bash
    npm test
    ```

## 🔑 Jerarquía de Acceso (RBAC vía JWT)

- **SUPER_ADMIN**: Potestad infinita, mutación del sistema e invitaciones corporativas.
- **ADMIN**: Gestor de producto, analítica general y panel modular.
- **EMPLEADO**: Acción segmentada a las sucursales donde operan físicamente (Cajas POS). 
- **CLIENTE**: Rol por defecto web, con limitantes lógicas de un B2C online.

## 📁 Capas de Responsabilidad

```
src/
├── app.js        # Inicialización base Express
├── server.js     # Punto de entrada y listener de Sockets
├── config/       # Contexto Global y Credenciales SetUp
├── routes/       # Ruteadores API y validación de endpoints
├── controllers/  # Extracción Request/Response (Capa HTTP)
├── middlewares/  # Escudos de acceso, auth y verificaciones intermedias
├── services/     # Lógica Corporativa Intacta (Factureros, Modificadores, Factory)
├── cron/         # Tareas automatizadas programadas
└── utils/        # Funciones helpers sin estado
```

---
© 2026 Software Propietario. Todos los derechos reservados.
