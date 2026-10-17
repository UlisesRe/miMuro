// ========================================
// miMuro - Legal pages (privacy, terms,
// contact). One component: the router maps
// each path to LegalPage and the component
// picks the document from the path.
// ========================================

const LEGAL_DOCS = {
  privacy: {
    eyebrow: 'Legal',
    title: 'Política de privacidad',
    intro: 'Qué datos guardamos de ti y qué hacemos con ellos.',
    sections: [
      {
        heading: 'Qué recopilamos',
        paragraphs: [
          'Tu nombre y tu correo electrónico cuando creas una cuenta.',
          'Tu contraseña, guardada siempre cifrada y nunca en texto plano.',
          'Nada más: no pedimos teléfono, ni datos de pago, ni ubicación.'
        ]
      },
      {
        heading: 'Para qué lo usamos',
        paragraphs: [
          'Para mantenerte dentro de tu cuenta y reconocerte cuando vuelvas.',
          'Para avisarte si algo falla y podamos solucionarlo.'
        ],
        after: 'No vendemos tus datos, no los prestamos y no los usamos para mostrarte publicidad.'
      },
      {
        heading: 'Con quién se comparte',
        paragraphs: [
          'Tus datos no salen de miMuro salvo que la ley nos obligue a ello.',
          'No compartimos tu información con terceros ni la usamos con fines publicitarios.'
        ]
      },
      {
        heading: 'Tus derechos',
        paragraphs: [
          'Puedes pedir una copia de tus datos o el borrado completo de tu cuenta en cualquier momento.',
          'Al borrar la cuenta se elimina toda tu información de miMuro.'
        ]
      }
    ],
    meta: 'Última actualización: octubre de 2026.'
  },

  terms: {
    eyebrow: 'Legal',
    title: 'Términos y condiciones',
    intro: 'Las reglas básicas para convivir bien en el muro.',
    sections: [
      {
        heading: 'Tu cuenta',
        paragraphs: [
          'Eres responsable de mantener tu contraseña en privado y de lo que se hace desde tu cuenta.',
          'Debes ser mayor de edad o contar con permiso de tus tutores para usar miMuro.'
        ]
      },
      {
        heading: 'Lo que publicas',
        paragraphs: [
          'Sigues siendo autor de todo lo que compartes en miMuro.',
          'Nos das permiso para mostrar ese contenido dentro del servicio, que es para lo que existe.'
        ]
      },
      {
        heading: 'Usos que no permitimos',
        paragraphs: [
          'No se puede usar miMuro para actividad ilegal, acoso, suplantación o envío de spam.',
          'Tampoco para intentar romper el servicio o acceder a cuentas ajenas sin permiso.'
        ]
      },
      {
        heading: 'Disponibilidad',
        paragraphs: [
          'El servicio evoluciona: podemos cambiar funciones o pararlo temporalmente para mantenerlo en buen estado.',
          'Si algo deja de funcionar, avísanos y lo miramos.'
        ]
      }
    ],
    meta: 'Última actualización: octubre de 2026.'
  },

  contact: {
    eyebrow: 'Legal',
    title: 'Contacto',
    intro: 'Estamos al otro lado del muro.',
    sections: [
      {
        heading: 'Escríbenos',
        paragraphs: [
          'Dudas sobre tu cuenta o algo que no se comporta bien: cuéntanoslo y respondemos en unos días.',
          'Correo: contacto@mimuro.app'
        ]
      },
      {
        heading: 'Sugerencias',
        paragraphs: [
          'Si echas en falta una función o ves algo raro, también nos sirve. Nos gusta leerlo todo.'
        ]
      }
    ],
    meta: 'Última actualización: octubre de 2026.'
  }
}

function pathToDoc(pathname) {
  const key = (pathname || '').replace(/^\/+|\/+$/g, '')
  return LEGAL_DOCS[key] ? key : 'privacy'
}

export function LegalPageComponent() {
  return {
    legalPageTemplate: LegalPageTemplate,
    doc: pathToDoc(window.location.pathname),

    init() {
      this.doc = pathToDoc(window.location.pathname)
      // The shell keeps a single LegalPage instance alive while
      // the path moves between /privacy, /terms and /contact.
      this.onRouteChange = (event) => {
        this.doc = pathToDoc(event.detail?.pathname)
      }
      window.addEventListener('route-change', this.onRouteChange)
    },

    destroy() {
      window.removeEventListener('route-change', this.onRouteChange)
    },

    get content() {
      return LEGAL_DOCS[this.doc] || LEGAL_DOCS.privacy
    }
  }
}

export function registerLegalPage(Alpine) {
  Alpine.data('legalPage', LegalPageComponent)
}

export const LegalPageTemplate = `
<div class="page page--legal">
  <section class="section legal">
    <div class="container">

      <div class="section-head">
        <p class="section-head__eyebrow" x-text="content.eyebrow"></p>
        <h1 class="section-head__title" x-text="content.title"></h1>
        <p class="section-head__text" x-text="content.intro"></p>
      </div>

      <div class="legal__body">
        <template x-for="block in content.sections" :key="block.heading">
          <section class="legal__section">
            <h2 class="legal__heading" x-text="block.heading"></h2>
            <template x-for="paragraph in block.paragraphs" :key="paragraph">
              <p class="legal__text" x-text="paragraph"></p>
            </template>
            <p class="legal__text legal__text--strong" x-show="block.after" x-text="block.after"></p>
          </section>
        </template>
      </div>

      <p class="legal__meta" x-text="content.meta"></p>

      <div class="legal__actions">
        <a href="/" class="auth__back" @click.prevent="$router.navigate('/')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Volver al inicio
        </a>
      </div>

    </div>
  </section>
</div>
`
