const prisma = require('../config/prisma');

async function main() {
  console.log('🌱 Sembrando Pasarelas de Pago...');

  /** 1. Asegurar que las monedas existan */
  const ars = await prisma.currency.upsert({
    where: { code: 'ARS' },
    update: {},
    create: {
      code: 'ARS',
      symbol: '$',
      exchangeRateToBase: 1.0,
      isActive: true
    }
  });

  const usd = await prisma.currency.upsert({
    where: { code: 'USD' },
    update: {},
    create: {
      code: 'USD',
      symbol: 'US$',
      exchangeRateToBase: 0.001,
      isActive: true
    }
  });

  /** 2. Crear pasarela de MercadoPago */
  const mercadopago = await prisma.paymentGateway.upsert({
    where: { slug: 'mercadopago' },
    update: {},
    create: {
      name: 'Mercado Pago',
      slug: 'mercadopago',
      isActive: true,
      config: {
          accessToken: process.env.MP_ACCESS_TOKEN
      }
    }
  });

  /** 3. Vincular MercadoPago a ARS (Principal) */
  await prisma.gatewayCurrencySupport.upsert({
    where: {
      gatewayId_currencyCode: {
        gatewayId: mercadopago.id,
        currencyCode: 'ARS'
      }
    },
    update: { isPrimary: true },
    create: {
      gatewayId: mercadopago.id,
      currencyCode: 'ARS',
      isPrimary: true
    }
  });

  console.log('✅ MercadoPago vinculado a ARS');

  /** 4. Crear pasarela de Stripe (Contexto simulado) */
  const stripe = await prisma.paymentGateway.upsert({
    where: { slug: 'stripe' },
    update: {},
    create: {
      name: 'Stripe',
      slug: 'stripe',
      isActive: true, 
      isGlobalFallback: false
    }
  });

  /** Vincular Stripe a USD */
  await prisma.gatewayCurrencySupport.upsert({
    where: {
        gatewayId_currencyCode: {
            gatewayId: stripe.id,
            currencyCode: 'USD'
        }
    },
    update: { isPrimary: true },
    create: {
        gatewayId: stripe.id,
        currencyCode: 'USD',
        isPrimary: true
    }
  });
  
  /** Vincular Stripe a EUR (Asegurar que la moneda exista primero) */
  await prisma.currency.upsert({
    where: { code: 'EUR' },
    update: {},
    create: {
      code: 'EUR',
      symbol: '€',
      exchangeRateToBase: 0.0011,
      isActive: true
    }
  });

  await prisma.gatewayCurrencySupport.upsert({
    where: {
        gatewayId_currencyCode: {
            gatewayId: stripe.id,
            currencyCode: 'EUR'
        }
    },
    update: { isPrimary: true },
    create: {
        gatewayId: stripe.id,
        currencyCode: 'EUR',
        isPrimary: true
    }
  });



  /** 5. Crear PayPal (Respaldo Global) */
  const paypal = await prisma.paymentGateway.upsert({
    where: { slug: 'paypal' },
    update: {},
    create: {
      name: 'PayPal',
      slug: 'paypal',
      isActive: true,
      isGlobalFallback: true
    }
  });

}

main()
  .catch((e) => {
    console.error('❌ ERROR AL SEMBRAR:', e);
    
    if (e.code) console.error('Código de Error:', e.code);
    if (e.meta) console.error('Meta de Error:', e.meta);
    
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
