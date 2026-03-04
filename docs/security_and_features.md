# Security and Features Update

This document details the recent system updates focusing on security enhancements, financial exploit prevention, and the new manual refund architecture.

## 1. Secure Logout & Token Invalidation
The logout mechanism has been upgraded to properly invalidate sessions on the server side. 
- When an employee or customer logs out, their `refreshToken` is actively deleted from the `RefreshToken` database table.
- This prevents token reuse attacks and ensures that sessions are strictly terminated.

## 2. Financial Exploits Prevention (Points & Discounts)
Critical vulnerabilities within the point redemption and discount calculation logic have been patched to prevent malicious exploitation:
- **Negative Point Prevention:** Added sanitization (`Math.max(0, ...)`) to ensure users cannot inject negative values into the `pointsToRedeem` payload.
- **Combined Discount Capping:** The checkout algorithm now dynamically limits the total combined discount (Coupons + Manual Discounts + Loyalty Points) to never exceed the order's subtotal. This prevents the generation of negative final totals and infinite point generation loops.
- **Reward Points Logic:** Customers will no longer earn new reward points if their purchase was paid entirely using existing loyalty points.

## 3. Strict Payment Status Control
To maintain data integrity and prevent conflicts with automated POS and Cron systems:
- The Admin Panel (`sale-details-dialog`) no longer permits manual alteration of the payment status when an order is in `PENDING` or `CANCELLED` states.
- This ensures that incomplete or abandoned sales are handled exclusively by the automated webhook or the stock cleanup chron job.

## 4. Audited Manual Refund System
A comprehensive manual refund flow has been implemented for orders that are `PAID`, `SHIPPED`, or `DELIVERED`.

### Features:
- **Admin UI Integration:** A dedicated, prominent "Refund / Cancel Sale" button replaces the manual status dropdown.
- **Mandatory Justification:** Administrators are forced to input a reason for the cancellation before proceeding.
- **Automated Stock Restitution:** The system automatically identifies the exact quantities and variants, restoring the items accurately to both the global `SKU` stock and the specific `BranchInventory` stock.
- **Loyalty Point Reversion:** 
  - Automatically refunds any points the customer used to pay for the order.
  - Automatically subtracts any reward points the customer earned from that specific order from their current balance.
- **Strict Audit Logging:** The entire operation is logged in the `AuditLog` table, recording the administrator's ID, IP address, the inputted reason, and the exact points/stock manipulated, ensuring complete traceability.

> **Note on Financial Refunds:** The system handles internal stock and point accounting. The actual monetary refund must still be processed manually through the chosen payment gateway (e.g., MercadoPago, Stripe).
