const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
const passport = require('./config/google.config');
const { extractBranchId } = require('./middlewares/branch.middleware');

const app = express();
app.set('trust proxy', 1);

app.use(passport.initialize());

// Ruta de Documentación
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

/**
 * ------------------------------------------------------------------
 * Configuración de Middlewares Globales
 * ------------------------------------------------------------------
 */

// 1. CORS: Permite peticiones de otros dominios (frontend)
// Debe ir antes de Helmet para que los headers de CORS no sean sobrescritos o bloqueados
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['https://superx.unixxtech.online','https://superx-admin.unixxtech.online',"https://super-ecommerce-administrador.vercel.app",'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (como apps móviles o curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-branch-id', 'x-currency', 'x-idempotency-key', 'x-silence-toast', 'x-test-country', 'x-client-country']
}));

// 2. Seguridad: Setea headers HTTP seguros
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 3. Logger: Registra peticiones en consola (formato 'dev' para colores y tiempos)
app.use(morgan('dev'));

// 4. Parsers: Entender JSON y URL-encoded forms
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(extractBranchId);

/**
 * ------------------------------------------------------------------
 * Rutas
 * ------------------------------------------------------------------
 */

// Ruta de Healthcheck (Verificación de estado)
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'success', 
    message: 'API E-commerce Profesional - Etapa 0: Productos Online',
    timestamp: new Date()
  });
});

const { apiLimiter, authLimiter } = require('./middlewares/security.middleware');

// Aplicar limitación de tasa global
app.use('/api', apiLimiter);

const categoryRoutes = require('./routes/category.routes');
const checkMaintenanceMode = require('./middlewares/maintenance.middleware');

// Rutas públicas protegidas por modo mantenimiento
app.use('/api/categories', checkMaintenanceMode, categoryRoutes);

const productRoutes = require('./routes/product.routes');
app.use('/api/products', checkMaintenanceMode, productRoutes);

const skuRoutes = require('./routes/sku.routes');
app.use('/api/skus', checkMaintenanceMode, skuRoutes);

const commentRoutes = require('./routes/comment.routes');
app.use('/api/comments', checkMaintenanceMode, commentRoutes);

const authRoutes = require('./routes/auth.routes');
// Las rutas de Auth DEBEN ser accesibles para que los Admins se logueen

app.use('/api/auth', authLimiter, authRoutes);

const userRoutes = require('./routes/user.routes');
// Las rutas de Usuarios también pueden necesitar bloqueo, ¿excepto quizás el perfil? El mantenimiento estricto bloquea todas las acciones del cliente.
app.use('/api/users', checkMaintenanceMode, userRoutes);

const couponRoutes = require('./routes/coupon.routes');
app.use('/api/coupons', checkMaintenanceMode, couponRoutes);

const saleRoutes = require('./routes/sale.routes');
app.use('/api/sales', checkMaintenanceMode, saleRoutes);

const notificationRoutes = require('./routes/notification.routes');
const paymentRoutes = require('./routes/payment.routes');


app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', checkMaintenanceMode, paymentRoutes);

const promoRoutes = require('./routes/promo.routes');
app.use('/api/promos', checkMaintenanceMode, promoRoutes);

const shippingRoutes = require('./routes/shipping.routes');
app.use('/api/shipping', checkMaintenanceMode, shippingRoutes);

const configRoutes = require('./routes/config.routes');
app.use('/api/config', configRoutes);

const adminRoutes = require('./routes/admin.routes');
app.use('/api/admin', adminRoutes);

const uploadRoutes = require('./routes/upload.routes');
app.use('/api/upload', uploadRoutes);

// Servir archivos estáticos de subidas locales
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

const transferRoutes = require('./routes/transfer.routes');
app.use('/api/transfers', checkMaintenanceMode, transferRoutes);

const adminStockRoutes = require('./routes/admin-stock.routes');
app.use('/api/admin/stock', adminStockRoutes);

const stockTransferRoutes = require('./routes/stock-transfer.routes');
app.use('/api/stock-transfers', checkMaintenanceMode, stockTransferRoutes);

const autoResponseRoutes = require('./routes/auto-response.routes');
app.use('/api/chat/auto-responses', autoResponseRoutes);

const chatRoutes = require('./routes/chat.routes');
app.use('/api/chat', chatRoutes);

const cartRoutes = require('./routes/cart.routes');
app.use('/api/cart', cartRoutes);

const branchRoutes = require('./routes/branch.routes');
app.use('/api/branches', checkMaintenanceMode, branchRoutes);

const supplierRoutes = require('./routes/supplier.routes');
app.use('/api/suppliers', checkMaintenanceMode, supplierRoutes);

const purchaseRoutes = require('./routes/purchase.routes');
app.use('/api/purchases', checkMaintenanceMode, purchaseRoutes);

const expenseRoutes = require('./routes/expense.route');
app.use('/api/expenses', checkMaintenanceMode, expenseRoutes);

const supplierPaymentRoutes = require('./routes/supplier-payment.routes');
const reportRoutes = require('./routes/report.routes'); 

app.use('/api/supplier-payments', checkMaintenanceMode, supplierPaymentRoutes);
app.use('/api/reports', checkMaintenanceMode, reportRoutes); 

const systemRoutes = require('./routes/system.routes');
const currencyRoutes = require('./routes/currency.routes');
const backupRoutes = require('./routes/backup.routes');

app.use('/api/system', systemRoutes);
app.use('/api/currencies', currencyRoutes);
app.use('/api/backups', checkMaintenanceMode, backupRoutes);

const blogRoutes = require('./routes/blog.routes');
app.use('/api/blog', blogRoutes);





/**
 * ------------------------------------------------------------------
 * Manejo Global de Errores
 * ------------------------------------------------------------------
 */
const LoggerService = require('./services/logger.service');

app.use(async (err, req, res, next) => {
  // 1. Determinar Severidad
  const statusCode = err.statusCode || 500;
  let severity = 'MEDIUM';
  if (statusCode >= 500) severity = 'HIGH';
  if (statusCode === 503) severity = 'CRITICAL';

  // 2. Logguear en Base de Datos (Async, no bloquear la respuesta demasiado tiempo)
 
  let logId = null;
  try {
      logId = await LoggerService.log(err, {
          url: req.originalUrl,
          method: req.method,
          userId: req.user ? req.user.id : null,
          ip: req.ip,
          body: req.body
      }, severity);
  } catch (loggingError) {
     
  }

 

  // 3. Send Sanitized Response
  const { sanitizeErrorMessage } = require('./utils/error-sanitizer');

  const isOperational = err.isOperational || (statusCode >= 400 && statusCode < 500);
  const responseMessage = isOperational ? sanitizeErrorMessage(err) : 'Ha ocurrido un error interno. Por favor intente más tarde.';

  res.status(statusCode).json({ 
    success: false, 
    message: responseMessage,
    error_code: err.errorCode || err.code || 'INTERNAL_ERROR',
    reference_id: logId,
    // Stack trace removed to keep responses clean
  });
});

module.exports = app;
