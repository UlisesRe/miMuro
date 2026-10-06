// ========================================
// miMuro - Home Page
// ========================================

export function HomePageComponent() {
  return {
    homePageTemplate: HomePageTemplate,

    // Animated preview inside the hero
    previewFrame: null,
    previewContext: null,
    previewResizeHandler: null,
    previewStatic: false,
    previewWidth: 0,
    previewHeight: 0,

    async init() {
      // Wait for layout so the canvas has a size
      this.$nextTick(() => this.startPreview())
    },

    destroy() {
      this.stopPreview()
    },

    getStarted() {
      this.$router.navigate(this.$store.auth.isAuthenticated ? '/dashboard' : '/register')
    },

    // ------------------------------------
    // Hero preview animation
    // Draws fake signatures so the hero shows
    // what the product actually looks like
    // instead of an empty white rectangle.
    // ------------------------------------

    startPreview() {
      const canvas = this.$refs.previewCanvas
      if (!canvas) return

      const context = canvas.getContext('2d')
      if (!context) return

      this.previewContext = context
      this.resizePreview()

      this.previewResizeHandler = () => {
        this.resizePreview()
        if (this.previewStatic) this.renderPreview(1)
      }
      window.addEventListener('resize', this.previewResizeHandler, { passive: true })

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (reduceMotion) {
        // Draw the finished wall once, no loop.
        this.previewStatic = true
        this.renderPreview(1)
        return
      }

      this.previewFrame = requestAnimationFrame(() => this.tickPreview(0))
    },

    stopPreview() {
      if (this.previewFrame) cancelAnimationFrame(this.previewFrame)
      this.previewFrame = null
      if (this.previewResizeHandler) {
        window.removeEventListener('resize', this.previewResizeHandler)
        this.previewResizeHandler = null
      }
      this.previewStatic = false
    },

    resizePreview() {
      const canvas = this.$refs.previewCanvas
      if (!canvas || !this.previewContext) return

      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return

      // Cap the ratio: a 3x phone wastes memory for
      // no visible gain on a decorative canvas.
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      this.previewContext.setTransform(ratio, 0, 0, ratio, 0, 0)
      this.previewWidth = width
      this.previewHeight = height
    },

    tickPreview(timestamp) {
      const cycle = 7000
      const elapsed = timestamp % cycle
      const loopStart = cycle - 900

      if (elapsed >= loopStart) {
        // Fade the wall out, then start over.
        const fade = (elapsed - loopStart) / 900
        this.renderPreview(1, 1 - fade)
        this.previewFrame = requestAnimationFrame((t) => this.tickPreview(t))
        return
      }

      this.renderPreview(Math.min(elapsed / 5200, 1))
      this.previewFrame = requestAnimationFrame((t) => this.tickPreview(t))
    },

    renderPreview(progress, alpha = 1) {
      const context = this.previewContext
      if (!context || !this.previewWidth) return

      const width = this.previewWidth
      const height = this.previewHeight

      context.clearRect(0, 0, width, height)

      const strokes = buildDemoStrokes(width, height)
      const total = strokes.length

      strokes.forEach((stroke, index) => {
        // Stagger the strokes so each signature
        // starts after the previous one settles.
        const start = index / total
        const span = 1 / total
        const local = Math.min(Math.max((progress - start) / span, 0), 1)
        if (local === 0) return

        drawPartialStroke(context, stroke.points, stroke, local, alpha)
      })
    }
  }
}

/**
 * Builds the demo signatures in pixel space.
 * Everything is derived from the canvas size so
 * the preview stays proportional on any screen.
 * Colours are drawn from the same muted set as the
 * interface so the preview does not fight the page.
 */
function buildDemoStrokes(width, height) {
  const unit = Math.min(width, height)
  const cx = width / 2
  const cy = height / 2

  return [
    {
      color: '#334155',
      width: Math.max(2.5, unit * 0.018),
      points: wavePoints(width * 0.12, height * 0.32, width * 0.24, height * 0.07)
    },
    {
      color: '#475569',
      width: Math.max(2.5, unit * 0.016),
      points: starPoints(width * 0.76, height * 0.3, unit * 0.095, unit * 0.042)
    },
    {
      color: '#64748b',
      width: Math.max(2.5, unit * 0.018),
      points: circlePoints(width * 0.74, height * 0.68, unit * 0.13)
    },
    {
      color: '#0f172a',
      width: Math.max(2, unit * 0.012),
      points: scribblePoints(cx, height * 0.5, width * 0.34)
    }
  ]
}

function starPoints(cx, cy, outer, inner) {
  const points = []
  for (let i = 0; i <= 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius])
  }
  return points
}

function circlePoints(cx, cy, radius) {
  const points = []
  for (let i = 0; i <= 48; i += 1) {
    const angle = (i / 48) * Math.PI * 2
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius])
  }
  return points
}

function wavePoints(startX, y, span, amplitude) {
  const points = []
  const steps = 40
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    points.push([startX + t * span, y + Math.sin(t * Math.PI * 3) * amplitude])
  }
  return points
}

/**
 * A signature-like squiggle. The jitter is
 * deterministic, otherwise the line would crawl
 * on every animation frame.
 */
function scribblePoints(cx, y, span) {
  const points = []
  const steps = 48
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const jitter = Math.sin(i * 12.9898) * 0.5
    points.push([
      cx - span / 2 + t * span,
      y + Math.sin(t * Math.PI * 4) * y * 0.09 + jitter * 1.5
    ])
  }
  return points
}

/**
 * Draws a stroke up to `progress` of its length,
 * tapering the last segment so the line looks
 * like it is being pulled rather than stamped.
 */
function drawPartialStroke(context, points, stroke, progress, alpha) {
  if (points.length < 2) return

  context.save()
  context.globalAlpha = alpha
  context.strokeStyle = stroke.color
  context.lineWidth = stroke.width
  context.lineCap = 'round'
  context.lineJoin = 'round'

  const total = points.length - 1
  const upto = progress * total
  const whole = Math.floor(upto)
  const fraction = upto - whole

  context.beginPath()
  context.moveTo(points[0][0], points[0][1])
  for (let i = 1; i <= whole && i < points.length; i += 1) {
    context.lineTo(points[i][0], points[i][1])
  }
  if (whole < total && fraction > 0) {
    const [x0, y0] = points[whole]
    const [x1, y1] = points[whole + 1]
    context.lineTo(x0 + (x1 - x0) * fraction, y0 + (y1 - y0) * fraction)
  }
  context.stroke()
  context.restore()
}

export function registerHomePage(Alpine) {
  Alpine.data('homePage', HomePageComponent)
}

export const HomePageTemplate = `
<div class="page page--home">

  <!-- Hero -->
  <section class="hero" aria-labelledby="hero-title">
    <div class="container">
      <div class="hero__inner">

        <div class="hero__copy">
          <span class="hero__eyebrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 3v18M3 12h18"></path>
            </svg>
            Gratis y sin descargas
          </span>

          <h1 id="hero-title" class="hero__title">
            Crea tu muro.
            <span class="hero__title-accent">Deja que lo firmen.</span>
          </h1>

          <p class="hero__text">
            Un lienzo digital donde tus amigos dibujan, escriben y dejan su firma.
            Comparte un link y mira cómo se llena en tiempo real.
          </p>

          <div class="hero__actions">
            <button type="button" class="btn btn--primary btn--lg" @click="getStarted()"
                    x-text="$store.auth.isAuthenticated ? 'Ir a mis muros' : 'Crear mi muro gratis'">
              Crear mi muro gratis
            </button>
            <button type="button" class="btn btn--secondary btn--lg" @click="$router.navigate('/login')">
              Ya tengo cuenta
            </button>
          </div>
        </div>

        <div class="hero__preview">
          <div class="wall-preview">
            <div class="wall-preview__bar">
              <div class="wall-preview__dots" aria-hidden="true"><span></span><span></span><span></span></div>
              <span class="wall-preview__title">Lienzo compartido</span>
            </div>

            <canvas class="wall-preview__canvas" x-ref="previewCanvas"
                    role="img"
                    aria-label="Vista animada de un lienzo de miMuro con firmas dibujadas por varias personas"></canvas>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- Social Proof - real counters starting at 0 -->
  <section class="section section--muted" aria-labelledby="stats-title">
    <div class="container">
      <div class="stats" role="region" aria-label="Estadísticas en tiempo real">
        <div class="stat">
          <span class="stat__value" x-data="{ count: 0 }" x-init="setInterval(() => count = Math.min(count + 1, 0), 1000)" x-text="count"></span>
          <span class="stat__label">Personas firmando ahora</span>
        </div>
        <div class="stat">
          <span class="stat__value" x-data="{ count: 0 }" x-init="setInterval(() => count = Math.min(count + 1, 0), 1000)" x-text="count"></span>
          <span class="stat__label">Muros creados</span>
        </div>
        <div class="stat">
          <span class="stat__value" x-data="{ count: 0 }" x-init="setInterval(() => count = Math.min(count + 1, 0), 1000)" x-text="count"></span>
          <span class="stat__label">Firmas totales</span>
        </div>
      </div>
    </div>
  </section>

  <!-- How it works -->
  <section class="section" aria-labelledby="steps-title">
    <div class="container">
      <div class="section-head">
        <span class="section-head__eyebrow">Cómo funciona</span>
        <h2 id="steps-title" class="section-head__title">Tres pasos y ya está</h2>
      </div>

      <ol class="steps">
        <li class="step">
          <span class="step__marker" aria-hidden="true"></span>
          <h3 class="step__title">Crea tu muro</h3>
          <p class="step__text">Elige un título, un color de fondo y decide si es público o privado.</p>
        </li>
        <li class="step">
          <span class="step__marker" aria-hidden="true"></span>
          <h3 class="step__title">Comparte el link</h3>
          <p class="step__text">Mándalo por WhatsApp, Instagram o como quieras. No hace falta que se registren.</p>
        </li>
        <li class="step">
          <span class="step__marker" aria-hidden="true"></span>
          <h3 class="step__title">Ellos firman</h3>
          <p class="step__text">Dibujan con el dedo y ves cada trazo aparecer al instante, sin recargar.</p>
        </li>
      </ol>
    </div>
  </section>

  <!-- Features - solo título + grid, sin descripciones -->
  <section class="section section--tint" aria-label="Funcionalidades">
    <div class="container">
      <div class="section-head">
        <span class="section-head__eyebrow">Funcionalidades</span>
      </div>

      <div class="features__grid">
        <article class="feature">
          <span class="feature__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
              <path d="M2 2l7.586 7.586"></path>
            </svg>
          </span>
          <h3 class="feature__title">Dibuja con el dedo</h3>
        </article>

        <article class="feature">
          <span class="feature__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </span>
          <h3 class="feature__title">Un link, cero fricción</h3>
        </article>

        <article class="feature">
          <span class="feature__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          </span>
          <h3 class="feature__title">En tiempo real</h3>
        </article>

        <article class="feature">
          <span class="feature__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
          </span>
          <h3 class="feature__title">Móvil primero</h3>
        </article>
      </div>
    </div>
  </section>

  <!-- Closing CTA -->
  <section class="cta" aria-labelledby="cta-title">
    <div class="container">
      <div class="cta__panel">
        <h2 id="cta-title" class="cta__title">¿Listo para abrir tu muro?</h2>
        <p class="cta__text">Tarda menos de un minuto. Sin tarjeta de crédito y sin compromiso.</p>
        <div class="cta__actions">
          <button type="button" class="btn btn--lg btn--on-brand" @click="getStarted()"
                  x-text="$store.auth.isAuthenticated ? 'Ver mis muros' : 'Empezar gratis'">
            Empezar gratis
          </button>
          <button type="button" class="btn btn--lg btn--on-brand-outline" @click="$router.navigate('/login')">
            Iniciar sesión
          </button>
        </div>
      </div>
    </div>
  </section>
</div>
`
