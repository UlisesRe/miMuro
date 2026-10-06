// ========================================
// miMuro - Login Page
// ========================================

export function LoginPageComponent() {
  return {
    // The form and the brand panel live on the
    // templates store, since both are injected with
    // x-html from the shell's scope.
    loginPageTemplate: LoginPageTemplate
  }
}

export function registerLoginPage(Alpine) {
  Alpine.data('loginPage', LoginPageComponent)
}

export const LoginPageTemplate = `
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

      <header class="auth__header">
        <h1 class="auth__title">Entra a mi cuenta</h1>
        <p class="auth__subtitle">Tus muros te esperan justo donde los dejaste.</p>
      </header>

      <div x-data="loginForm">
        <div x-html="$store.templates.loginForm"></div>
      </div>
    </div>

  </div>
</div>
`
