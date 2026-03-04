# Actualización de Seguridad y Características

Este documento detalla las recientes actualizaciones del sistema enfocadas en mejoras de seguridad, prevención de exploits financieros y la nueva arquitectura de anulación manual.

## 1. Cierre de Sesión Seguro e Invalidación de Tokens
El mecanismo de cierre de sesión ha sido actualizado para invalidar correctamente las sesiones en el lado del servidor.
- Cuando un empleado o cliente cierra sesión, su `refreshToken` es eliminado activamente de la tabla `RefreshToken` en la base de datos.
- Esto previene ataques de reutilización de tokens y garantiza que las sesiones se terminen de forma estricta.

## 2. Prevención de Exploits Financieros (Puntos y Descuentos)
Se han parcheado vulnerabilidades críticas dentro de la lógica de redención de puntos y cálculos de descuentos para evitar manipulaciones maliciosas:
- **Prevención de Puntos Negativos:** Se agregó sanitización matemática (`Math.max(0, ...)`) para asegurar que los usuarios no puedan inyectar valores negativos en su redención de puntos.
- **Límite de Descuento Combinado:** El algoritmo de pago ahora limita dinámicamente el descuento combinado total (Cupones + Descuentos Manuales + Puntos) para que nunca exceda el subtotal de la orden. Esto previene la generación de totales negativos en el carrito.
- **Lógica de Ganancia de Puntos:** Los clientes ya no recibirán puntos de recompensa si su compra fue pagada en su totalidad utilizando puntos de fidelidad.

## 3. Control Estricto del Estado de Pago
Para mantener la integridad de los datos y evitar conflictos con los sistemas automáticos (POS y Webhooks):
- El Panel de Administración (`sale-details-dialog`) ya no permite la alteración manual del estado de pago cuando una orden se encuentra en estado `PENDIENTE` o `CANCELADO`.
- Esto asegura que las ventas incompletas o abandonadas sean manejadas exclusivamente por el sistema automatizado de limpieza de stock.

## 4. Sistema de Devolución Manual Auditado
Se ha implementado un flujo exhaustivo de devolución manual para las órdenes que se encuentran `PAGADAS`, `ENVIADAS` o `ENTREGADAS`.

### Características:
- **Integración de UI Admin:** Un botón prominente y dedicado de "Devolución / Anular Venta" reemplaza la modificación manual del estado.
- **Justificación Obligatoria:** Los administradores están obligados a ingresar un motivo para la anulación antes de proceder.
- **Restitución Automática de Inventario:** El sistema identifica automáticamente las cantidades exactas y variantes, devolviendo los artículos con precisión tanto al stock global de `SKU` como al inventario específico de la sucursal (`BranchInventory`).
- **Reversión de Puntos de Fidelidad:** 
  - Reembolsa automáticamente cualquier punto que el cliente haya usado para pagar la orden.
  - Resta automáticamente del balance del cliente cualquier punto que haya ganado por esa compra específica.
- **Registro de Auditoría Estricto:** Toda la operación queda registrada en la tabla `AuditLog`, guardando el ID del administrador, su dirección IP, el motivo ingresado y los puntos/stock manipulados, asegurando una trazabilidad completa.

> **Nota sobre Reembolsos Financieros:** El sistema maneja la contabilidad interna de stock y puntos. El reembolso monetario real debe procesarse manualmente a través de la pasarela de pago correspondiente (ej. MercadoPago, Stripe).
