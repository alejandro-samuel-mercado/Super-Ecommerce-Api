const prisma = require('../src/config/prisma');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');

async function main() {
    console.log('🌱 Iniciando Seed Avanzado...');

    // 1. CHAT AUTO RESPONSES (50)
    console.log('-> Generando 50 respuestas automáticas del bot...');
    const botResponses = [
        { trigger: 'hola', response: '¡Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte hoy?' },
        { trigger: 'buenos dias', response: '¡Buen día! Espero que estés teniendo una excelente jornada. ¿Cómo puedo asistirte?' },
        { trigger: 'envio', response: 'Realizamos envíos a todo el país. El costo se calcula en el carrito según tu ubicación.' },
        { trigger: 'costo de envio', response: 'El costo de envío varía según la zona y el peso del paquete. Podés verlo antes de finalizar la compra.' },
        { trigger: 'pago', response: 'Aceptamos Mercado Pago (tarjetas de crédito/débito), Transferencia Bancaria y Efectivo en sucursales.' },
        { trigger: 'cuotas', response: 'A través de Mercado Pago podés pagar en cuotas. Las promociones dependen de tu banco.' },
        { trigger: 'devolucion', response: 'Tenés 30 días para realizar devoluciones siempre que el producto esté en su empaque original.' },
        { trigger: 'garantia', response: 'Todos nuestros productos cuentan con garantía oficial del fabricante, mínimo de 6 meses.' },
        { trigger: 'horario', response: 'Nuestras sucursales abren de Lunes a Viernes de 09:00 a 18:00 y Sábados de 10:00 a 14:00.' },
        { trigger: 'sucursal', response: 'Contamos con sucursales en CABA (Palermo y Centro). Podés ver las direcciones en la web.' },
        { trigger: 'stock', response: 'El stock que ves en la web es en tiempo real. Si lo podés agregar al carrito, está disponible.' },
        { trigger: 'factura', response: 'Emitimos facturas A y B. Podés solicitarla al momento de la compra ingresando tu CUIT.' },
        { trigger: 'seguimiento', response: 'Una vez despachado, recibirás un mail con el código de seguimiento de tu pedido.' },
        { trigger: 'demora', response: 'Los envíos en CABA demoran 24-48hs. Al interior del país, entre 3 y 7 días hábiles.' },
        { trigger: 'cancelar', response: 'Podés cancelar tu pedido desde tu perfil siempre que no haya sido despachado.' },
        { trigger: 'ayuda', response: 'Estoy aquí para ayudarte. Podés preguntarme sobre envíos, pagos, stock o sucursales.' },
        { trigger: 'cupon', response: 'Si tenés un cupón, podés ingresarlo en el carrito de compras antes de pagar.' },
        { trigger: 'descuento', response: 'Tenemos promociones vigentes que podés ver en la sección de Ofertas.' },
        { trigger: 'puntos', response: 'Con cada compra sumás puntos que podés canjear por descuentos en futuras compras.' },
        { trigger: 'canje', response: 'Para canjear tus puntos, seleccioná la opción de usar puntos al finalizar tu compra.' },
        { trigger: 'seguridad', response: 'Tus datos están protegidos. Usamos conexiones seguras y procesadores de pago certificados.' },
        { trigger: 'contacto', response: 'Podés contactarnos vía WhatsApp al +54 9 11 2233-4455 o por mail a soporte@tienda.com.' },
        { trigger: 'reclamo', response: 'Lamentamos el inconveniente. Envianos tu número de pedido y detalle del problema por WhatsApp.' },
        { trigger: 'mayorista', response: 'Realizamos ventas mayoristas. Por favor contactate con ventas@tienda.com para más info.' },
        { trigger: 'apple', response: 'Somos distribuidores autorizados de productos Apple con garantía oficial.' },
        { trigger: 'computadora', response: 'Tenemos una amplia variedad de laptops y PCs de escritorio. Mirá nuestra sección de informática.' },
        { trigger: 'celular', response: 'Todos nuestros celulares son libres para cualquier compañía.' },
        { trigger: 'auriculares', response: 'Contamos con auriculares Bluetooth, deportivos y de estudio. ¡Revisá la sección de Audio!' },
        { trigger: 'smartwatch', response: 'Llevá el control de tu salud con nuestra gama de relojes inteligentes.' },
        { trigger: 'tablet', response: 'Ideales para estudio o trabajo. Tenemos modelos de Samsung, Lenovo y iPad.' },
        { trigger: 'teclado', response: 'Desde teclados básicos hasta mecánicos para gaming. ¡Encontrá el tuyo!' },
        { trigger: 'mouse', response: 'Mouse ergonómicos, inalámbricos y competitivos disponibles en la web.' },
        { trigger: 'monitor', response: 'Monitores 4K, curvos y de alta tasa de refresco para la mejor experiencia visual.' },
        { trigger: 'impresora', response: 'Impresoras a chorro de tinta y láser. También vendemos insumos y cartuchos.' },
        { trigger: 'gaming', response: 'Visitá nuestra sección Gamer para ver lo último en placas de video y accesorios.' },
        { trigger: 'ps5', response: 'Tenemos stock de consolas y juegos para PlayStation 5.' },
        { trigger: 'xbox', response: 'Encontrá consolas Xbox Series X/S y suscripciones a Game Pass.' },
        { trigger: 'nintendo', response: 'Disponemos de consolas Nintendo Switch y los títulos más populares.' },
        { trigger: 'camara', response: 'Cámaras reflex, mirrorless y deportivas GoPro disponibles.' },
        { trigger: 'dron', response: 'Explorá el cielo con nuestra variedad de drones DJI.' },
        { trigger: 'tv', response: 'Smart TVs de todas las pulgadas con tecnología LED, QLED y OLED.' },
        { trigger: 'parlante', response: 'Parlantes portátiles resistentes al agua y sistemas de sonido para el hogar.' },
        { trigger: 'microfono', response: 'Micrófonos para streaming, podcast y grabación profesional.' },
        { trigger: 'cargador', response: 'Cargadores rápidos y cables reforzados para todos tus dispositivos.' },
        { trigger: 'fundas', response: 'Protegé tu equipo con nuestras fundas y vidrios templados.' },
        { trigger: 'bolso', response: 'Mochilas y bolsos diseñados para transportar laptops de forma segura.' },
        { trigger: 'software', response: 'Vendemos licencias oficiales de Windows, Office y antivirus.' },
        { trigger: 'wifi', response: 'Mejorá tu conexión con nuestros routers y repetidores de señal.' },
        { trigger: 'disco duro', response: 'Discos rígidos externos y SSDs internos para mayor velocidad.' },
        { trigger: 'ram', response: 'Memorias RAM para potenciar tu notebook o PC de escritorio.' }
    ];

    for (const res of botResponses) {
        await prisma.chatAutoResponse.upsert({
            where: { trigger: res.trigger },
            update: { response: res.response, isActive: true },
            create: res
        });
    }

    // 2. EVENTS (10)
    console.log('-> Generando 10 eventos estacionales...');
    const events = [
        { name: 'Hot Sale 2026', startDate: new Date('2026-05-10'), endDate: new Date('2026-05-15'), active: false },
        { name: 'Black Friday 2026', startDate: new Date('2026-11-20'), endDate: new Date('2026-11-27'), active: false },
        { name: 'Cyber Monday 2026', startDate: new Date('2026-11-30'), endDate: new Date('2026-12-05'), active: false },
        { name: 'Navidad Mágica', startDate: new Date('2025-12-15'), endDate: new Date('2025-12-26'), active: false },
        { name: 'Día del Padre', startDate: new Date('2026-06-10'), endDate: new Date('2026-06-25'), active: false },
        { name: 'Día de la Madre', startDate: new Date('2026-10-10'), endDate: new Date('2026-10-25'), active: false },
        { name: 'Vuelta al Cole', startDate: new Date('2026-02-15'), endDate: new Date('2026-03-10'), active: false },
        { name: 'Liquidación de Verano', startDate: new Date('2026-01-01'), endDate: new Date('2026-02-01'), active: false },
        { name: 'Aniversario Tienda', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-15'), active: false },
        { name: 'Semana Tech', startDate: new Date(), endDate: new Date(new Date().setDate(new Date().getDate() + 7)), active: true }
    ];

    for (const ev of events) {
        await prisma.event.create({
            data: {
                ...ev,
                bannerMessages: { top: `¡Aprovechá las ofertas de ${ev.name}!`, footer: "Hasta 12 cuotas sin interés." },
                shippingEnabled: true,
                couponsEnabled: true,
                pointsEnabled: true,
                taxesEnabled: true
            }
        });
    }

    // 3. SHIPPING ZONES (35)
    console.log('-> Generando 35 zonas de envío...');
    const zones = [
        { country: 'Argentina', province: 'Buenos Aires', city: 'La Plata', cost: 4500 },
        { country: 'Argentina', province: 'Buenos Aires', city: 'Mar del Plata', cost: 5000 },
        { country: 'Argentina', province: 'Buenos Aires', city: 'Bahía Blanca', cost: 5500 },
        { country: 'Argentina', province: 'Córdoba', city: 'Córdoba Capital', cost: 6000 },
        { country: 'Argentina', province: 'Córdoba', city: 'Villa Carlos Paz', cost: 6200 },
        { country: 'Argentina', province: 'Santa Fe', city: 'Rosario', cost: 5800 },
        { country: 'Argentina', province: 'Santa Fe', city: 'Santa Fe Capital', cost: 6000 },
        { country: 'Argentina', province: 'Mendoza', city: 'Mendoza Capital', cost: 7000 },
        { country: 'Argentina', province: 'Salta', city: 'Salta Capital', cost: 8500 },
        { country: 'Argentina', province: 'Tucumán', city: 'San Miguel de Tucumán', cost: 8000 },
        { country: 'Argentina', province: 'Chubut', city: 'Puerto Madryn', cost: 9000 },
        { country: 'Argentina', province: 'Tierra del Fuego', city: 'Ushuaia', cost: 12000 },
        { country: 'Argentina', province: 'Neuquén', city: 'Neuquén Capital', cost: 7500 },
        { country: 'Argentina', province: 'Misiones', city: 'Posadas', cost: 8200 },
        { country: 'Argentina', province: 'Entre Ríos', city: 'Paraná', cost: 5900 },
        { country: 'Uruguay', province: 'Montevideo', city: 'Montevideo', cost: 15000 },
        { country: 'Uruguay', province: 'Canelones', city: 'Punta del Este', cost: 18000 },
        { country: 'Chile', province: 'Santiago', city: 'Santiago de Chile', cost: 20000 },
        { country: 'Chile', province: 'Valparaíso', city: 'Viña del Mar', cost: 22000 },
        { country: 'Paraguay', province: 'Asunción', city: 'Asunción', cost: 16000 },
        { country: 'Bolivia', province: 'La Paz', city: 'La Paz', cost: 19000 },
        { country: 'Perú', province: 'Lima', city: 'Lima', cost: 25000 },
        { country: 'Argentina', province: 'San Juan', city: 'San Juan Capital', cost: 7200 },
        { country: 'Argentina', province: 'Corrientes', city: 'Corrientes Capital', cost: 7800 },
        { country: 'Argentina', province: 'Jujuy', city: 'San Salvador de Jujuy', cost: 8800 },
        { country: 'Argentina', province: 'La Rioja', city: 'La Rioja Capital', cost: 7400 },
        { country: 'Argentina', province: 'Catamarca', city: 'Catamarca Capital', cost: 7900 },
        { country: 'Argentina', province: 'San Luis', city: 'San Luis Capital', cost: 6800 },
        { country: 'Argentina', province: 'Chaco', city: 'Resistencia', cost: 8100 },
        { country: 'Argentina', province: 'Formosa', city: 'Formosa Capital', cost: 8400 },
        { country: 'Argentina', province: 'Santiago del Estero', city: 'Santiago Capital', cost: 7700 },
        { country: 'Argentina', province: 'La Pampa', city: 'Santa Rosa', cost: 6300 },
        { country: 'Argentina', province: 'Santa Cruz', city: 'Río Gallegos', cost: 10500 },
        { country: 'Uruguay', province: 'Colonia', city: 'Colonia del Sacramento', cost: 16500 },
        { country: 'Chile', province: 'Antofagasta', city: 'Antofagasta', cost: 24000 }
    ];

    for (const zone of zones) {
        await prisma.shippingZone.upsert({
            where: { country_province_city: { country: zone.country, province: zone.province, city: zone.city } },
            update: { cost: zone.cost, active: true },
            create: zone
        });
    }

    // 4. USERS (10 Employees, 20 Customers)
    console.log('-> Generando Usuarios (Empleados y Clientes)...');
    const employeeRole = await prisma.role.findUnique({ where: { name: 'EMPLOYEE' } });
    const customerRole = await prisma.role.findUnique({ where: { name: 'CUSTOMER' } });
    const branches = await prisma.branch.findMany();

    if (!employeeRole || !customerRole || branches.length === 0) {
        console.error('❌ Error: Falta configurar roles o sucursales básicos. Ejecuta primero seed.js');
        return;
    }

    const passwordHash = await bcrypt.hash('123456', 10);

    // Generar 10 Empleados (distribuidos en sucursales)
    console.log('   -> Generando 10 empleados...');
    for (let i = 0; i < 10; i++) {
        const branch = branches[i % branches.length];
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const email = `empleado${i + 1}@tienda.com`;

        await prisma.user.upsert({
            where: { email },
            update: { branchId: branch.id, activeBranchId: branch.id },
            create: {
                name: `${firstName} ${lastName}`,
                email,
                password: passwordHash,
                roleId: employeeRole.id,
                status: 'ACTIVE',
                branchId: branch.id,
                activeBranchId: branch.id,
                phone: faker.phone.number(),
                address: faker.location.streetAddress(),
                city: branch.city,
                state: branch.state,
                country: branch.country,
                adminBranches: {
                    create: [{ branchId: branch.id }]
                }
            }
        });
    }

    // Generar 20 Clientes
    console.log('   -> Generando 20 clientes...');
    for (let i = 0; i < 20; i++) {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const email = `cliente${i + 1}@gmail.com`;

        await prisma.user.upsert({
            where: { email },
            update: {},
            create: {
                name: `${firstName} ${lastName}`,
                email,
                password: passwordHash,
                roleId: customerRole.id,
                status: 'ACTIVE',
                points: faker.number.int({ min: 0, max: 2000 }),
                phone: faker.phone.number(),
                address: faker.location.streetAddress(),
                city: faker.location.city(),
                state: faker.location.state(),
                country: 'Argentina',
                zipCode: faker.location.zipCode()
            }
        });
    }

    console.log('✅ Seed Avanzado finalizado con éxito.');
}

main()
    .catch((e) => {
        console.error('❌ Error en el seed avanzado:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
