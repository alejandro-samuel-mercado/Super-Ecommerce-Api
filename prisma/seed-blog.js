const prisma = require('../src/config/prisma');

async function main() {
  console.log('📝 Iniciando Seed de Blog Posts...');

  const posts = [
    {
      title: "Las 5 Mejores Tendencias Tech para 2026",
      excerpt: "Descubre las innovaciones que marcarán el ritmo este año, desde IA integrada hasta gadgets ecológicos.",
      content: "El 2026 se perfila como el año de la consolidación tecnológica. En este artículo exploramos cómo la inteligencia artificial ha pasado de ser una promesa a ser un estándar en nuestros dispositivos cotidianos. Hablaremos sobre los nuevos smartphones con baterías de estado sólido que prometen durar una semana entera, y cómo la realidad aumentada está cambiando nuestras oficinas.\n\n### 1. IA Nativa en Hardware\nYa no dependemos de la nube; los nuevos procesadores ejecutan modelos pesados localmente.\n\n### 2. Dispositivos Circulares\nLa ecología ya no es opcional. Marcas líderes están lanzando productos 100% reparables y reciclables.",
      coverImage: "https://img.freepik.com/free-photo/modern-technology-gadgets-collection_23-2149503460.jpg",
      tags: ["Tecnología", "2026", "Tendencias"],
      readingTime: 6
    },
    {
      title: "Guía para Elegir tu Smartphone Ideal",
      excerpt: "¿Cámara, rendimiento o batería? Te ayudamos a decidir qué priorizar según tus necesidades y presupuesto.",
      content: "Elegir un teléfono nuevo puede ser abrumador. Con tantas opciones en el mercado, es fácil perderse en las especificaciones. En Kwik-E-Mart Electro hemos preparado esta guía definitiva para que hagas la mejor inversión.\n\nSi eres amante de la fotografía, fíjate en el tamaño del sensor más que en los megapíxeles. Si eres un gamer, el sistema de refrigeración es tu mejor aliado.",
      coverImage: "https://img.freepik.com/free-photo/hand-holding-smartphone-with-blank-screen_23-2148450148.jpg",
      tags: ["Smartphones", "Guía", "Compras"],
      readingTime: 8
    },
    {
      title: "Cómo Optimizar tu Espacio de Home Office",
      excerpt: "Transforma ese rincón de tu casa en una estación de trabajo productiva y ergonómica con estos simples pasos.",
      content: "Trabajar desde casa llegó para quedarse, pero ¿lo estamos haciendo bien? La iluminación es el factor número uno que la gente olvida. Una buena lámpara de escritorio con temperatura ajustable puede reducir la fatiga visual en un 40%.\n\nTambién hablamos de la importancia de las sillas ergonómicas y cómo un segundo monitor puede disparar tu productividad.",
      coverImage: "https://img.freepik.com/free-photo/stylish-workspace-with-computer-and-laptop_23-2148107564.jpg",
      tags: ["Productividad", "Hogar", "Home Office"],
      readingTime: 5
    },
    {
      title: "El Futuro de los Pagos Digitales",
      excerpt: "Desde cripto hasta autenticación biométrica, te contamos cómo pagarás tus compras en el futuro cercano.",
      content: "La era de las billeteras físicas está llegando a su fin. En este post analizamos cómo sistemas como Stripe y PayPal están integrando biometría para que solo necesites tu mirada para autorizar una transacción. Seguridad y rapidez son los pilares de este cambio.",
      coverImage: "https://img.freepik.com/free-photo/online-payment-concept-person-using-smart-phone-and-visa-credit-card_53876-133618.jpg",
      tags: ["Finanzas", "Pagos", "Digital"],
      readingTime: 4
    },
    {
      title: "Review: Los Mejores Auriculares Noise Cancelling",
      excerpt: "Probamos los últimos lanzamientos de Sony, Bose y Apple para decirte cuál reina en silencio y calidad.",
      content: "Hemos pasado una semana aislados del mundo probando tres pesos pesados del audio. El resultado te sorprenderá. Mientras que Sony sigue liderando en cancelación bruta, Apple destaca por su integración en el ecosistema, pero Bose mantiene el trono de la comodidad eterna.",
      coverImage: "https://img.freepik.com/free-photo/young-man-wearing-headphones-enjoying-music_23-2148816768.jpg",
      tags: ["Audio", "Reviews", "Auriculares"],
      readingTime: 10
    },
    {
      title: "Mantenimiento Preventivo de tu Laptop",
      excerpt: "Alarga la vida útil de tu equipo con estos 5 consejos básicos de limpieza y cuidado de componentes.",
      content: "No esperes a que tu laptop suene como un avión para limpiarla. Polvo y calor son los enemigos mortales de la electrónica. Aprende a limpiar tus ventiladores y por qué nunca deberías usar tu equipo sobre la cama sin una base rígida.",
      coverImage: "https://img.freepik.com/free-photo/repairman-fixing-laptop-with-screwdriver_23-2148419163.jpg",
      tags: ["Soporte", "Tips", "Hardware"],
      readingTime: 7
    },
    {
      title: "Cocina Inteligente: Los electrodomésticos que necesitas",
      excerpt: "Automatiza tu cocina y ahorra tiempo con la nueva generación de dispositivos conectados.",
      content: "Desde freidoras de aire con Wi-Fi hasta cafeteras que detectan cuándo te despiertas. La cocina se ha vuelto el centro de la domótica. Te mostramos cómo configurar una rutina para que tu café te espere humeante cada mañana.",
      coverImage: "https://img.freepik.com/free-photo/modern-smart-kitchen_23-2148842183.jpg",
      tags: ["Hogar", "Cocina", "Smart Home"],
      readingTime: 6
    },
    {
      title: "La Magia del Gaming en 4K",
      excerpt: "Análisis de las mejores tarjetas gráficas y monitores para disfrutar de una experiencia visual definitiva.",
      content: "Si aún juegas en 1080p, te estás perdiendo de mucho. El 4K ya es accesible y en este post te mostramos la configuración de PC ideal para correr los últimos títulos en ultra sin que tu bolsillo sufra demasiado.",
      coverImage: "https://img.freepik.com/free-photo/gamer-setup-with-neon-lights_23-2149021674.jpg",
      tags: ["Gaming", "PC Master Race", "Gráficos"],
      readingTime: 9
    },
    {
      title: "Cómo Estirar la Batería de tu Smarwatch",
      excerpt: "Trucos y configuraciones que no conocías para que tu reloj aguante un día extra de uso intenso.",
      content: "El GPS y el brillo de pantalla son los mayores culpables. Te enseñamos a configurar el modo ahorro para que no pierdas tus métricas de salud pero ganes horas vitales de batería.",
      coverImage: "https://img.freepik.com/free-photo/fitness-tracker-concept_23-2148530465.jpg",
      tags: ["Smartwatch", "Tips", "Batería"],
      readingTime: 5
    },
    {
      title: "Streaming de Alta Fidelidad: ¿Vale la pena?",
      excerpt: "Tidal, Apple Music y Amazon ofrecen audio Lossless. Te explicamos qué hardware necesitas para notarlo.",
      content: "No sirve de nada tener audio sin pérdida si usas auriculares Bluetooth básicos. Hablamos sobre DACs, amplificadores y auriculares de alta impedancia para los verdaderos audiófilos.",
      coverImage: "https://img.freepik.com/free-photo/vinyl-record-player_23-2148111054.jpg",
      tags: ["Audio", "Streaming", "Música"],
      readingTime: 7
    },
    {
      title: "Moda y Tecnología: El Auge de los Wearables",
      excerpt: "Ya no son solo gadgets raros; ahora la tecnología se viste y luce increíble.",
      content: "Desde anillos inteligentes hasta chaquetas con calefacción controlada por app. La moda está convergiendo con la utilidad tecnológica a pasos agigantados.",
      coverImage: "https://img.freepik.com/free-photo/smart-ring-on-finger_23-2149503465.jpg",
      tags: ["Moda", "Wearables", "Estilo"],
      readingTime: 5
    },
    {
      title: "Guía de Regalos: Tech para Niños",
      excerpt: "Los mejores dispositivos educativos para introducir a los más pequeños en el mundo de la programación y ciencia.",
      content: "Tablets protegidas, kits de robótica y juegos de lógica. Elegir tech para niños requiere equilibrio entre aprendizaje y seguridad.",
      coverImage: "https://img.freepik.com/free-photo/child-playing-with-robot_23-2148816770.jpg",
      tags: ["Niños", "Educación", "Regalos"],
      readingTime: 6
    },
    {
      title: "Fotografía Móvil: Domina el Modo Pro",
      excerpt: "ISO, Shutter Speed y Enfoque Manual. Aprende a usar tu teléfono como una cámara profesional.",
      content: "Tu teléfono tiene un potencial enorme. Deja el modo automático de lado y aprende a capturar la Vía Láctea con técnicas de larga exposición.",
      coverImage: "https://img.freepik.com/free-photo/person-taking-photo-with-smartphone_23-2148107568.jpg",
      tags: ["Fotografía", "Smartphones", "Tips"],
      readingTime: 8
    },
    {
      title: "Backups de Datos: No esperes a perderlo todo",
      excerpt: "La importancia de la regla 3-2-1 y los mejores servicios de nube para respaldar tus recuerdos y archivos.",
      content: "Un disco duro fallará tarde o temprano. En este artículo te explicamos cómo automatizar tus copias de seguridad en local y en la nube simultáneamente.",
      coverImage: "https://img.freepik.com/free-photo/cloud-computing-concept_23-2148816772.jpg",
      tags: ["Seguridad", "Software", "Nube"],
      readingTime: 5
    },
    {
      title: "El Renacer de la Fotografía Analógica",
      excerpt: "Por qué en plena era digital las cámaras instantáneas e impresoras portátiles son el regalo estrella.",
      content: "Lo tangible tiene un valor que el píxel no puede replicar. Analizamos la tendencia retro que está capturando a la Generación Z.",
      coverImage: "https://img.freepik.com/free-photo/instant-camera-on-table_23-2148043209.jpg",
      tags: ["Fotografía", "Retro", "Tendencias"],
      readingTime: 6
    },
    {
      title: "Criptomonedas en el Ecommerce",
      excerpt: "¿Es seguro pagar con Bitcoin? Analizamos la volatilidad y la adopción de las stablecoins en las tiendas online.",
      content: "Pagar con cripto es cada vez más fácil gracias a intermediarios que aseguran el precio al vendedor. Te contamos los pros y contras de esta forma de pago descentralizada.",
      coverImage: "https://img.freepik.com/free-photo/bitcoins-stacked-on-laptop_23-2148107570.jpg",
      tags: ["Cripto", "Finanzas", "Ecommerce"],
      readingTime: 7
    },
    {
      title: "Drones para Principiantes: ¿Cuál comprar?",
      excerpt: "Regulaciones, seguridad y modelos recomendados para tu primer vuelo recreativo.",
      content: "Volar un dron es divertido pero conlleva responsabilidades. Te orientamos sobre qué dice la ley y qué modelos son los más estables para aprender sin estrellarlos.",
      coverImage: "https://img.freepik.com/free-photo/modern-drone-flying_23-2148419165.jpg",
      tags: ["Drones", "Hobbies", "Guía"],
      readingTime: 8
    },
    {
      title: "Tablets vs Laptops: ¿Cuál necesitas para estudiar?",
      excerpt: "Análisis comparativo de portabilidad y potencia para estudiantes universitarios.",
      content: "Con los teclados externos y lápices ópticos, la línea entre tablet y laptop es muy delgada. Vemos casos de uso específicos para diseño, medicina e ingeniería.",
      coverImage: "https://img.freepik.com/free-photo/student-with-tablet-in-library_23-2148816774.jpg",
      tags: ["Estudio", "Tablets", "Laptops"],
      readingTime: 6
    },
    {
      title: "Smart Lighting: Cambia el ambiente de tu hogar",
      excerpt: "Cómo usar luces RGB y temperaturas de color para mejorar tu ánimo y descanso.",
      content: "Azul para concentrarse, naranja para relajarse. La luz afecta nuestra química cerebral y te enseñamos a hackearla con bombillas inteligentes.",
      coverImage: "https://img.freepik.com/free-photo/smart-home-lighting-control_23-2148842185.jpg",
      tags: ["Domótica", "Hogar", "Iluminación"],
      readingTime: 5
    },
    {
      title: "El Auge de los E-Sports: Mucho más que jugar",
      excerpt: "Cómo la industria de los videojuegos competitivos está superando en audiencias a deportes tradicionales.",
      content: "Los E-Sports son un fenómeno global que mueve millones. Analizamos el impacto cultural y las oportunidades de carrera en este sector.",
      coverImage: "https://img.freepik.com/free-photo/pro-gamer-playing-at-tournament_23-2149021676.jpg",
      tags: ["Gaming", "E-Sports", "Cultura"],
      readingTime: 7
    },
    {
      title: "Salud Digital: Apps y Gadgets para un Bienestar Total",
      excerpt: "Cómo las métricas de tu reloj y teléfono pueden ayudarte a dormir mejor y reducir el estrés.",
      content: "No solo cuentan pasos. Los nuevos sensores de ECG y oxígeno en sangre son herramientas poderosas para un autocuidado consciente.",
      coverImage: "https://img.freepik.com/free-photo/health-tracking-on-smartphone_23-2148530467.jpg",
      tags: ["Salud", "Wearables", "Apps"],
      readingTime: 6
    }
  ];

  for (const post of posts) {
    const slug = post.title.toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    await prisma.blogPost.upsert({
      where: { slug: slug },
      update: {
        ...post,
        published: true,
        publishedAt: new Date(new Date().setDate(new Date().getDate() - Math.floor(Math.random() * 30)))
      },
      create: {
        ...post,
        slug: slug,
        published: true,
        publishedAt: new Date(new Date().setDate(new Date().getDate() - Math.floor(Math.random() * 30))),
        authorName: "Equipo Kwik-E-Mart",
        readingTime: post.readingTime || 5
      }
    });
  }

  console.log(`✅ ${posts.length} Blog Posts sincronizados con éxito.`);
}

main()
  .catch(e => {
    console.error('❌ Error durante el seed de blog:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
