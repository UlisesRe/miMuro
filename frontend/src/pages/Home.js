// ========================================
// miMuro - Home Page
// ========================================

import { api } from '../services/api.js'

export function HomePageComponent() {
  return {
    homePageTemplate: HomePageTemplate,

    // Live social proof (filled from /api/stats)
    stats: { members: 0 },

    init() {
      this.loadStats()
    },

    async loadStats() {
      try {
        const data = await api.stats.get()
        this.stats = { members: data?.members ?? this.stats.members }
      } catch {
        // The counter is decorative: never break the page.
      }
    },

    getStarted() {
      this.$router.navigate(this.$store.auth.isAuthenticated ? '/dashboard' : '/register')
    }
  }
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
            <span class="hero__title-main">Crea tu muro.</span>
            <span class="hero__title-accent">Haz que lo firmen.</span>
          </h1>

          <p class="hero__text">
            Un muro digital donde la gente que quieres deja su firma.
            Comparte un link y mira cómo se llena con quienes te importan.
          </p>

          <div class="hero__actions">
            <button type="button" class="btn btn--primary btn--lg" @click="getStarted()"
                    x-text="$store.auth.isAuthenticated ? 'Ir a mi muro' : 'Crear mi muro gratis'">
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
              <span class="wall-preview__title">Muro compartido</span>
            </div>

            <div class="wall-preview__demo" role="img"
                 aria-label="Vista de un muro de miMuro lleno de firmas de varias personas">
              <span class="signature signature--1">Ana</span>
              <span class="signature signature--2">¡Feliz cumple! 🎉</span>
              <span class="signature signature--3">tomás</span>
              <span class="signature signature--4">#bffs</span>
              <span class="signature signature--5">te quiero ✨</span>
              <span class="signature signature--6">Santi ★</span>
              <span class="signature signature--7">juli &amp; co.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- Social proof - live counter -->
  <section class="section section--muted" aria-label="Comunidad">
    <div class="container">
      <div class="stats stats--one">
        <div class="stat">
          <span class="stat__value" x-text="stats.members"></span>
          <span class="stat__label">personas ya tienen su muro</span>
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
          <p class="step__text">Elegí un título y un color. En segundos tenés tu link listo para compartir.</p>
        </li>
        <li class="step">
          <span class="step__marker" aria-hidden="true"></span>
          <h3 class="step__title">Comparte el link</h3>
          <p class="step__text">Mándalo por Instagram, WhatsApp o donde quieras. No hace falta que se registren.</p>
        </li>
        <li class="step">
          <span class="step__marker" aria-hidden="true"></span>
          <h3 class="step__title">Tu gente firma</h3>
          <p class="step__text">Cada persona deja su huella y tu muro se llena con la gente que te importa.</p>
        </li>
      </ol>
    </div>
  </section>

  <!-- Features - solo título + grid, sin descripciones -->
  <section class="section section--tint bubbles" aria-label="Funcionalidades">
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
          <h3 class="feature__title">Firmas que quedan</h3>
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
              <rect x="5" y="2" width="14" height="20" rx="2"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
          </span>
          <h3 class="feature__title">Móvil primero</h3>
        </article>

        <article class="feature">
          <span class="feature__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </span>
          <h3 class="feature__title">Tus reglas</h3>
        </article>
      </div>
    </div>
  </section>

  <!-- Closing CTA -->
  <section class="cta" aria-labelledby="cta-title">
    <div class="container">
      <div class="cta__panel">
        <h2 id="cta-title" class="cta__title">
          ¿Listo para abrir <span class="accent-mark accent-mark--on-dark">tu muro</span>?
        </h2>
        <p class="cta__text">Tarda menos de un minuto. Sin tarjeta de crédito y sin compromiso.</p>
        <div class="cta__actions">
          <button type="button" class="btn btn--lg btn--on-brand" @click="getStarted()"
                  x-text="$store.auth.isAuthenticated ? 'Ver mi muro' : 'Empezar gratis'">
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
