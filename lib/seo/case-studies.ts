// Editorial summaries of published descriptions. Show only while their source remains present.
export function caseStudy(project: { titulo: string; descripcion: string | null }) {
  const name = project.titulo.toLowerCase();
  const description = (project.descripcion || '').toLowerCase();
  if (name.includes('rohi') && description.includes('campañas comerciales')) return [
    { title: 'Necesidad de comunicación', text: 'Presentar promociones, beneficios y novedades de Rohi Sommiers con una identidad reconocible en sus canales digitales.' },
    { title: 'Trabajo realizado', text: 'Diseño gráfico con jerarquías tipográficas y composiciones orientadas a la comunicación comercial.' },
    { title: 'Entregables', text: 'Piezas para campañas, anuncios de descuentos, placas informativas y contenido institucional adaptado a formatos digitales.' },
    { title: 'Resultado observable', text: 'Una serie de piezas con un criterio visual común para comunicar promociones y novedades. Podés ver las aplicaciones en la galería.' },
  ];
  if (name.includes('onix') && description.includes('iluminación controlada')) return [
    { title: 'Necesidad de comunicación', text: 'Presentar retratos y productos de Onix en catálogo y redes sociales, mostrando textura y detalles.' },
    { title: 'Trabajo realizado', text: 'Producción fotográfica de retrato y producto con iluminación controlada.' },
    { title: 'Entregables', text: 'Fotografías preparadas para catálogo y redes sociales, según la descripción del proyecto.' },
    { title: 'Resultado observable', text: 'Un conjunto de imágenes que permite apreciar texturas y productos bajo un mismo tratamiento de luz. La galería muestra el material producido.' },
  ];
  if (name.includes('mike') && description.includes('dirección de arte gastronómica')) return [
    { title: 'Necesidad de comunicación', text: 'Presentar los productos de Mike Donas en canales digitales y piezas promocionales.' },
    { title: 'Trabajo realizado', text: 'Sesión de fotografía de producto con dirección de arte gastronómica.' },
    { title: 'Entregables', text: 'Imágenes y versiones optimizadas para e-commerce, piezas promocionales y redes.' },
    { title: 'Resultado observable', text: 'Material fotográfico adaptado a distintos usos digitales, con una presentación visual consistente del producto. Explorá las imágenes en la galería.' },
  ];
  return null;
}
