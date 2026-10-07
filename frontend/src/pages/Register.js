// ========================================
// miMuro - Register Page
// ========================================

export function RegisterPageComponent() {
  return {
    // The form and the brand panel live on the
    // templates store, since both are injected with
    // x-html from the shell's scope.
    registerPageTemplate: RegisterPageTemplate
  }
}

export function registerRegisterPage(Alpine) {
  Alpine.data('registerPage', RegisterPageComponent)
}

export const RegisterPageTemplate = `
<div class="page page--auth">
  <div class="container auth__inner">

    <section class="auth__brand" aria-label="Sobre miMuro">
      <div x-html="$store.templates.authBrandPanel"></div>
    </section>

    <div class="auth__panel">
      <a href="/" class="auth__back" @click.prevent="$router.navigate('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        Volver al inicio
      </a>

      <div x-data="registerForm">
        <header class="auth__header" x-show="step === 'form'">
          <h1 class="auth__title">Crea tu cuenta gratis</h1>
          <p class="auth__subtitle">Sin tarjeta de crédito y en menos de un minuto.</p>
        </header>

        <div x-html="$store.templates.registerForm"></div>
      </div>
    </div>

  </div>
</div>
`
