/**
 * Script semilla para entradas de blog
 * Ejecutar: node src/scripts/seed-blog.js
 */
const prisma = require('../config/prisma');

const posts = [
  {
    slug: 'como-elegir-el-mejor-producto-para-ti',
    title: 'Cómo elegir el mejor producto para ti',
    excerpt: 'Descubre los factores clave que debes considerar antes de realizar tu próxima compra. Te ayudamos a tomar la mejor decisión.',
    content: `<h2>Factores clave a considerar</h2>
<p>Elegir el producto adecuado puede parecer complicado con tantas opciones disponibles. Aquí te dejamos una guía práctica para tomar la mejor decisión.</p>
<h3>1. Define tu presupuesto</h3>
<p>Antes de empezar a buscar, establece un rango de precio que se ajuste a tus posibilidades. Esto te ayudará a filtrar opciones y enfocarte en lo que realmente puedes adquirir.</p>
<h3>2. Investiga las especificaciones</h3>
<p>No te dejes llevar solo por la apariencia. Lee las características técnicas, compara materiales y revisa la durabilidad del producto.</p>
<h3>3. Lee las reseñas</h3>
<p>Las opiniones de otros compradores son invaluables. Busca patrones en los comentarios: si varios usuarios mencionan el mismo problema, probablemente sea algo a considerar.</p>
<h3>4. Compara opciones</h3>
<p>Nunca te quedes con la primera opción. Compara al menos 3 productos similares antes de decidirte.</p>
<p>Recuerda: <strong>la mejor compra es una compra informada</strong>.</p>`,
    coverImage: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800',
    authorName: 'Equipo Editorial',
    authorBio: 'Nuestro equipo de expertos en compras inteligentes.',
    tags: ['Guía', 'Consejos', 'Compras'],
    readingTime: 4,
    published: true,
    publishedAt: new Date('2026-02-01'),
  },
  {
    slug: 'guia-completa-para-principiantes',
    title: 'Guía completa para principiantes en compras online',
    excerpt: 'Todo lo que necesitas saber para empezar a comprar en línea de forma segura y aprovechar las mejores ofertas.',
    content: `<h2>Bienvenido al mundo de las compras online</h2>
<p>Si es tu primera vez comprando por internet, esta guía te ayudará a navegar el proceso con confianza.</p>
<h3>Paso 1: Crea tu cuenta</h3>
<p>Registrarte te permite guardar tus favoritos, rastrear pedidos y acceder a ofertas exclusivas.</p>
<h3>Paso 2: Explora el catálogo</h3>
<p>Usa los filtros de categoría, precio y valoración para encontrar exactamente lo que buscas.</p>
<h3>Paso 3: Agrega al carrito</h3>
<p>Selecciona la variante que prefieras (color, talle, etc.) y agrégala a tu carrito de compras.</p>
<h3>Paso 4: Revisa y paga</h3>
<p>Verifica los productos en tu carrito, aplica cupones de descuento si los tienes, y elige tu método de pago preferido.</p>
<h3>Paso 5: Recibe tu pedido</h3>
<p>Recibirás actualizaciones sobre el estado de tu envío. ¡Disfruta tu compra!</p>`,
    coverImage: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800',
    authorName: 'Equipo Editorial',
    authorBio: 'Nuestro equipo de expertos en compras inteligentes.',
    tags: ['Guía', 'Principiantes', 'Tutorial'],
    readingTime: 5,
    published: true,
    publishedAt: new Date('2026-02-03'),
  },
  {
    slug: 'que-debes-saber-antes-de-comprar',
    title: 'Qué debes saber antes de comprar: checklist esencial',
    excerpt: 'Una lista de verificación práctica que todo comprador debería revisar antes de confirmar su pedido.',
    content: `<h2>Tu checklist antes de comprar</h2>
<p>Antes de hacer clic en "Comprar", asegúrate de revisar estos puntos:</p>
<ul>
<li><strong>Política de devoluciones:</strong> ¿Puedes devolver si no te convence? Nosotros ofrecemos 30 días de garantía.</li>
<li><strong>Costos de envío:</strong> ¿Son gratuitos? ¿A partir de qué monto?</li>
<li><strong>Métodos de pago:</strong> ¿Aceptan tu método preferido?</li>
<li><strong>Valoraciones:</strong> ¿Qué dicen otros compradores?</li>
<li><strong>Garantía:</strong> ¿Tiene garantía el producto?</li>
<li><strong>Especificaciones:</strong> ¿Cumple con lo que necesitas?</li>
</ul>
<p>Tomarte unos minutos extra para verificar estos puntos puede ahorrarte problemas y devoluciones innecesarias.</p>`,
    coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
    authorName: 'Equipo Editorial',
    authorBio: 'Nuestro equipo de expertos en compras inteligentes.',
    tags: ['Consejos', 'Compras', 'Checklist'],
    readingTime: 3,
    published: true,
    publishedAt: new Date('2026-02-05'),
  },
  {
    slug: 'errores-comunes-al-comprar-online',
    title: 'Errores comunes al comprar online y cómo evitarlos',
    excerpt: 'Aprende de los errores más frecuentes que cometen los compradores y sigue estos consejos para evitarlos.',
    content: `<h2>Los 5 errores más comunes</h2>
<h3>1. No leer la descripción completa</h3>
<p>Muchos compradores se guían solo por la imagen. Siempre lee la descripción completa, dimensiones y materiales.</p>
<h3>2. Ignorar las reseñas negativas</h3>
<p>Las reseñas negativas son tan valiosas como las positivas. Te ayudan a identificar posibles problemas.</p>
<h3>3. No comparar precios</h3>
<p>El mismo producto puede tener precios muy diferentes. Tómate el tiempo de comparar.</p>
<h3>4. Olvidar revisar la política de devoluciones</h3>
<p>Antes de comprar, asegúrate de entender las condiciones de devolución.</p>
<h3>5. Comprar impulsivamente</h3>
<p>Si no lo necesitas, probablemente no es la mejor compra. Deja el producto en favoritos y vuelve en 24 horas.</p>`,
    coverImage: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800',
    authorName: 'Equipo Editorial',
    authorBio: 'Nuestro equipo de expertos en compras inteligentes.',
    tags: ['Consejos', 'Errores', 'Compras'],
    readingTime: 4,
    published: true,
    publishedAt: new Date('2026-02-07'),
  },
  {
    slug: 'caso-real-experiencia-cliente-satisfecho',
    title: 'Caso real: la experiencia de un cliente satisfecho',
    excerpt: 'Conoce la historia de uno de nuestros clientes y cómo nuestra tienda transformó su experiencia de compra.',
    content: `<h2>La historia de María</h2>
<p>María buscaba un regalo especial para el cumpleaños de su madre. Después de visitar varias tiendas sin éxito, encontró nuestra tienda online.</p>
<blockquote>"No esperaba encontrar exactamente lo que buscaba, y mucho menos recibirlo en tan solo 2 días. La calidad superó mis expectativas."</blockquote>
<h3>Lo que más le gustó</h3>
<ul>
<li>La variedad de productos disponibles</li>
<li>El proceso de compra intuitivo y rápido</li>
<li>El envío express con seguimiento en tiempo real</li>
<li>La atención al cliente personalizada</li>
</ul>
<p>María ahora es una clienta habitual y participa activamente en nuestro programa de puntos.</p>
<p><em>"Cada vez que necesito algo, mi primera opción es esta tienda. La confianza se gana con hechos."</em></p>`,
    coverImage: 'https://images.unsplash.com/photo-1556742031-c6961e8560b0?w=800',
    authorName: 'Equipo Editorial',
    authorBio: 'Nuestro equipo de expertos en compras inteligentes.',
    tags: ['Caso Real', 'Clientes', 'Testimonios'],
    readingTime: 3,
    published: true,
    publishedAt: new Date('2026-02-10'),
  },
  {
    slug: 'nuevo-ingreso-productos-disponibles',
    title: 'Nuevo ingreso: descubre lo último que llegó a nuestra tienda',
    excerpt: 'Te presentamos las últimas incorporaciones a nuestro catálogo. Productos frescos seleccionados especialmente para ti.',
    content: `<h2>¡Nuevos productos disponibles!</h2>
<p>Estamos emocionados de anunciar que hemos ampliado nuestro catálogo con productos nuevos y exclusivos.</p>
<h3>¿Qué hay de nuevo?</h3>
<p>Hemos incorporado líneas de productos que nuestros clientes nos venían pidiendo. Desde accesorios hasta tecnología de última generación.</p>
<h3>Disponibilidad limitada</h3>
<p>Algunos de estos productos tienen stock limitado. Te recomendamos agregar a favoritos los que te interesen para no perdértelos.</p>
<h3>Ofertas de lanzamiento</h3>
<p>Durante las primeras dos semanas, todos los nuevos ingresos tendrán un <strong>descuento especial de lanzamiento</strong>. ¡No te lo pierdas!</p>`,
    coverImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
    authorName: 'Equipo Editorial',
    authorBio: 'Nuestro equipo de expertos en compras inteligentes.',
    tags: ['Novedades', 'Productos', 'Lanzamiento'],
    readingTime: 3,
    published: true,
    publishedAt: new Date('2026-02-12'),
  },
  {
    slug: 'actualizacion-importante-tienda',
    title: 'Actualización importante en nuestra tienda',
    excerpt: 'Hemos implementado mejoras significativas para ofrecerte una mejor experiencia de compra. Conoce todos los detalles.',
    content: `<h2>Mejoras en nuestra plataforma</h2>
<p>Trabajamos constantemente para mejorar tu experiencia. Estas son las novedades más recientes:</p>
<h3>🚀 Nuevo sistema de búsqueda</h3>
<p>Encontrar lo que buscas ahora es más rápido y preciso con nuestro motor de búsqueda mejorado.</p>
<h3>💳 Más métodos de pago</h3>
<p>Incorporamos nuevas opciones de pago para tu comodidad, incluyendo billeteras digitales.</p>
<h3>📦 Seguimiento mejorado</h3>
<p>Ahora puedes rastrear tu pedido en tiempo real con actualizaciones más frecuentes.</p>
<h3>⭐ Programa de puntos renovado</h3>
<p>Gana más puntos con cada compra y canjéalos por descuentos exclusivos.</p>`,
    coverImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
    authorName: 'Equipo de Desarrollo',
    authorBio: 'El equipo técnico detrás de la plataforma.',
    tags: ['Actualización', 'Novedades', 'Plataforma'],
    readingTime: 4,
    published: true,
    publishedAt: new Date('2026-02-15'),
  },
  {
    slug: 'nueva-version-con-mejoras',
    title: 'Nueva versión con mejoras: todo lo que cambió',
    excerpt: 'Lanzamos una nueva versión de nuestra plataforma con mejoras de rendimiento, diseño y funcionalidad.',
    content: `<h2>Versión 2.0 de nuestra tienda</h2>
<p>Nos complace anunciar el lanzamiento de la versión 2.0, con cambios significativos en toda la plataforma.</p>
<h3>Diseño renovado</h3>
<p>Interfaz más moderna, limpia y fácil de usar. Navegación intuitiva en todos los dispositivos.</p>
<h3>Rendimiento mejorado</h3>
<p>Páginas que cargan hasta un 50% más rápido. Tu tiempo es valioso.</p>
<h3>Nuevas funcionalidades</h3>
<ul>
<li>Lista de deseos mejorada</li>
<li>Comparador de productos</li>
<li>Chat en vivo con soporte</li>
<li>Notificaciones personalizadas</li>
</ul>
<p>¡Explora la nueva versión y cuéntanos qué te parece!</p>`,
    coverImage: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800',
    authorName: 'Equipo de Desarrollo',
    authorBio: 'El equipo técnico detrás de la plataforma.',
    tags: ['Actualización', 'Versión', 'Tecnología'],
    readingTime: 4,
    published: true,
    publishedAt: new Date('2026-02-18'),
  },
  {
    slug: 'como-esta-cambiando-la-industria-ecommerce',
    title: 'Cómo está cambiando la industria del e-commerce',
    excerpt: 'Análisis de las tendencias que están transformando el comercio electrónico y cómo nos adaptamos.',
    content: `<h2>El futuro del comercio electrónico</h2>
<p>La industria del e-commerce evoluciona constantemente. Estas son las tendencias que están definiendo el futuro:</p>
<h3>Inteligencia Artificial</h3>
<p>Los sistemas de recomendación basados en IA están revolucionando la forma en que los clientes descubren productos.</p>
<h3>Compras por voz</h3>
<p>Cada vez más personas usan asistentes de voz para realizar compras. La adaptación es clave.</p>
<h3>Sostenibilidad</h3>
<p>Los consumidores valoran cada vez más las prácticas sostenibles. Envíos eco-friendly y packaging reciclable son la norma.</p>
<h3>Personalización extrema</h3>
<p>Cada cliente espera una experiencia única, desde las recomendaciones hasta los descuentos personalizados.</p>
<p>En nuestra tienda, estamos comprometidos a estar a la vanguardia de estas tendencias.</p>`,
    coverImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
    authorName: 'Equipo Editorial',
    authorBio: 'Nuestro equipo de expertos en compras inteligentes.',
    tags: ['Industria', 'Tendencias', 'E-commerce'],
    readingTime: 5,
    published: true,
    publishedAt: new Date('2026-02-20'),
  },
  {
    slug: 'lo-que-se-viene-en-2026',
    title: 'Lo que se viene en 2026: predicciones para el comercio online',
    excerpt: 'Nuestras predicciones sobre las tendencias más importantes que marcarán el comercio electrónico este año.',
    content: `<h2>Predicciones para 2026</h2>
<p>El 2026 promete ser un año de grandes cambios en el mundo del e-commerce. Estas son nuestras predicciones:</p>
<h3>1. Realidad aumentada en compras</h3>
<p>Probar productos virtualmente antes de comprar será cada vez más común. Desde ropa hasta muebles.</p>
<h3>2. Entregas en el mismo día</h3>
<p>La logística de última milla seguirá mejorando, haciendo que las entregas ultra-rápidas sean la norma.</p>
<h3>3. Pagos biométricos</h3>
<p>Pagar con huella dactilar o reconocimiento facial será más frecuente y seguro.</p>
<h3>4. Social commerce</h3>
<p>Comprar directamente desde redes sociales sin salir de la aplicación. Una tendencia que no para de crecer.</p>
<h3>5. Suscripciones inteligentes</h3>
<p>Sistemas que aprenden tus hábitos de consumo y te envían productos automáticamente cuando los necesitas.</p>
<p><strong>El futuro es ahora.</strong> Estamos preparados para llevarte la mejor experiencia de compra.</p>`,
    coverImage: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800',
    authorName: 'Equipo Editorial',
    authorBio: 'Nuestro equipo de expertos en compras inteligentes.',
    tags: ['Tendencias', '2026', 'Predicciones'],
    readingTime: 5,
    published: true,
    publishedAt: new Date('2026-02-25'),
  },
];

async function seed() {
  console.log('🌱 Sembrando entradas de blog...');

  for (const post of posts) {
    const existing = await prisma.blogPost.findUnique({ where: { slug: post.slug } });
    if (existing) {
      console.log(`  ⏭️  Omitiendo "${post.title}" (ya existe)`);
      continue;
    }
    await prisma.blogPost.create({ data: post });
    console.log(`  ✅ Creado "${post.title}"`);
  }

  console.log('🎉 ¡Carga inicial del blog completada!');
  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error('❌ Error en el script semilla:', e);
  prisma.$disconnect();
  process.exit(1);
});
