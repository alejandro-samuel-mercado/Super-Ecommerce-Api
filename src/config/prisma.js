require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ 
  connectionString,
  max: 5, 
  min: 0, 
  idleTimeoutMillis: 30000, // Cerrar conexiones inactivas más rápido
  connectionTimeoutMillis: 30000, // Incrementado para arranque en frío de Neon serverless (antes 10s)
  query_timeout: 30000, // Timeout de consulta 30s
  statement_timeout: 30000, // Timeout de sentencia 30s
  allowExitOnIdle: true, // Permitir salir del proceso cuando el pool está inactivo
  ssl: { rejectUnauthorized: false } 
});

// Logueo de eventos del pool para debugging
pool.on('error', (err) => {
 
});

pool.on('connect', () => {
});

pool.on('remove', () => {
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ 
  adapter,
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' }
  ]
});

prisma.$on('warn', (e) => {
  console.warn('  [Prisma]', e.message);
});

prisma.$on('error', (e) => {
  console.error('❌ [Prisma]', e.message);
});

module.exports = prisma;
