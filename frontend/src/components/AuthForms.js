// ========================================
// miMuro - Auth Forms
//
// Validation strategy: validate a field on blur
// ("touched"), then keep validating on every
// keystroke. Errors are never silently cleared,
// and a failed submit moves focus to a summary
// so screen reader users hear what went wrong.
// ========================================

import { api } from '../services/api.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Matches what the backend already accepts. The
// strength meter pushes users towards 8+ without
// blocking anyone the API would have let through.
const MIN_PASSWORD_LENGTH = 6

function normaliseEmail(value) {
  return value.trim().toLowerCase()
}

export function LoginFormComponent() {
  return {
    email: '',
    password: '',
    remember: false,
    showPassword: false,
    loading: false,
    formError: null,
    errors: {},
    touched: {},

    init() {
      // Pre-fill the email when arriving from a
      // "confirma tu correo" style link.
      const query = this.$router.getQuery()
      if (query.get('email')) {
        this.email = query.get('email')
        this.touched.email = true
      }
    },

    get errorCount() {
      return Object.keys(this.errors).length
    },

    validateField(field) {
      const value = field === 'email' ? normaliseEmail(this.email) : this.password
      let message = ''

      if (!value) {
        message = field === 'email' ? 'Escribe tu correo electrónico' : 'Escribe tu contraseña'
      } else if (field === 'email' && !EMAIL_PATTERN.test(value)) {
        message = 'Ese correo no parece válido. Revisa que tenga @ y un dominio'
      } else if (field === 'password' && value.length < MIN_PASSWORD_LENGTH) {
        message = `Tu contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres`
      }

      if (message) {
        this.errors[field] = message
      } else {
        delete this.errors[field]
      }
      return !message
    },

    touch(field) {
      this.touched[field] = true
      this.validateField(field)
    },

    revalidate(field) {
      if (this.touched[field]) this.validateField(field)
    },

    async submit() {
      if (this.loading) return

      this.formError = null
      this.touched = { email: true, password: true }

      if (!this.validateField('email') || !this.validateField('password')) {
        this.$nextTick(() => {
          this.$refs.alert?.focus()
          this.$refs.form?.querySelector('[aria-invalid="true"]')?.focus()
        })
        return
      }

      this.loading = true

      try {
        this.email = normaliseEmail(this.email)
        const user = await this.$store.auth.login(this.email, this.password, this.remember)
        this.password = ''
        if (user) {
          this.$router.replace('/dashboard')
        } else {
          this.formError = 'Error de autenticación, inténtalo de nuevo'
        }
      } catch (error) {
        const msg = error?.message || ''
        if (msg.includes('pendiente de confirmación') || msg.includes('Revisá tu correo')) {
          this.$router.navigate(`/register?email=${encodeURIComponent(this.email)}`)
          return
        }
        this.formError = msg && msg !== 'Error de conexión' ? msg : 'No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.'
      } finally {
        this.loading = false
      }
    },

    goToRegister() {
      this.$router.navigate('/register')
    },

    goToForgotPassword() {
      // No recovery endpoint exists yet. Say so
      // plainly instead of shipping a dead link.
      this.$store.toast.info(
        'La recuperación de contraseña todavía no está disponible. Escríbenos y te ayudamos.',
        6000
      )
    }
  }
}

export function RegisterFormComponent() {
  return {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false,
    showPassword: false,
    showConfirmPassword: false,
    loading: false,
    formError: null,
    errors: {},
    touched: {},

    // Paso 2: código de confirmación enviado al correo
    step: 'form',
    pendingEmail: '',
    code: '',
    codeError: null,
    confirming: false,
    resending: false,
    resendIn: 0,
    _resendTimer: null,

    init() {
      const query = this.$router.getQuery()
      if (query.get('email')) {
        this.email = query.get('email')
        this.touched.email = true
      }
    },

    get errorCount() {
      return Object.keys(this.errors).length
    },

    // Minimum length is the only hard rule; the
    // rest nudges without blocking signup.
    get requirements() {
      const value = this.password
      return [
        {
          id: 'length',
          label: `Al menos ${MIN_PASSWORD_LENGTH} caracteres`,
          met: value.length >= MIN_PASSWORD_LENGTH
        },
        {
          id: 'letter',
          label: 'Incluye una letra',
          met: /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(value)
        },
        {
          id: 'number',
          label: 'Incluye un número',
          met: /\d/.test(value)
        },
        {
          id: 'symbol',
          label: 'Incluye un símbolo (recomendado)',
          met: /[^a-zA-Z0-9]/.test(value)
        }
      ]
    },

    get strength() {
      const value = this.password
      if (!value) return 0

      let score = 0
      if (value.length >= MIN_PASSWORD_LENGTH) score += 1
      if (value.length >= 10) score += 1
      if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score += 1
      if (/[^a-zA-Z0-9]/.test(value) || value.length >= 14) score += 1
      return Math.min(score, 4)
    },

    get strengthLabel() {
      return ['Sin contraseña', 'Débil', 'Aceptable', 'Buena', 'Excelente'][this.strength]
    },

    validateField(field) {
      let message = ''

      if (field === 'name') {
        const value = this.name.trim()
        if (!value) message = 'Dinos cómo te llamamos'
        else if (value.length < 2) message = 'Pon al menos 2 caracteres'
      }

      if (field === 'email') {
        const value = normaliseEmail(this.email)
        if (!value) message = 'Escribe tu correo electrónico'
        else if (!EMAIL_PATTERN.test(value)) {
          message = 'Ese correo no parece válido. Revisa que tenga @ y un dominio'
        }
      }

      if (field === 'password') {
        if (!this.password) message = 'Elige una contraseña'
        else if (this.password.length < MIN_PASSWORD_LENGTH) {
          message = `Tu contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres`
        }
      }

      if (field === 'confirmPassword') {
        if (!this.confirmPassword) message = 'Repite la contraseña'
        else if (this.confirmPassword !== this.password) {
          message = 'Las dos contraseñas no coinciden'
        }
      }

      if (field === 'acceptedTerms' && !this.acceptedTerms) {
        message = 'Necesitamos que aceptes las condiciones para continuar'
      }

      if (message) this.errors[field] = message
      else delete this.errors[field]

      return !message
    },

    touch(field) {
      this.touched[field] = true
      this.validateField(field)
    },

    revalidate(field) {
      if (this.touched[field]) this.validateField(field)
    },

    async submit() {
      if (this.loading) return

      this.formError = null
      this.touched = {
        name: true,
        email: true,
        password: true,
        confirmPassword: true,
        acceptedTerms: true
      }

      const fields = ['name', 'email', 'password', 'confirmPassword', 'acceptedTerms']
      const allValid = fields.map((field) => this.validateField(field)).every(Boolean)

      if (!allValid) {
        this.$nextTick(() => {
          this.$refs.alert?.focus()
          this.$refs.form?.querySelector('[aria-invalid="true"]')?.focus()
        })
        return
      }

      this.loading = true

      try {
        this.email = normaliseEmail(this.email)
        const data = await this.$store.auth.register(this.email, this.password, this.name.trim())

        // El registro pasa al paso del código: la sesión se
        // crea recién cuando el correo queda confirmado.
        this.pendingEmail = this.email
        this.password = ''
        this.confirmPassword = ''
        this.code = ''
        this.codeError = null
        this.step = 'code'
        this.startResendCooldown(data?.email_confirmation?.resend_cooldown_seconds ?? 60)
        this.$store.toast.info(`Código enviado a ${this.pendingEmail}`, 6000)
        this.$nextTick(() => this.$refs.codeInput?.focus())
      } catch (error) {
        this.formError =
          error?.message && error.message !== 'Error de conexión'
            ? error.message
            : 'No pudimos crear la cuenta. Inténtalo de nuevo en un momento.'
      } finally {
        this.loading = false
      }
    },

    onCodeInput() {
      this.code = String(this.code).replace(/\D/g, '').slice(0, 6)
      this.codeError = null
    },

    async confirmCode() {
      if (this.confirming) return

      const code = String(this.code).replace(/\D/g, '')
      if (code.length !== 6) {
        this.codeError = 'El código tiene 6 dígitos'
        return
      }

      this.confirming = true
      this.codeError = null

      try {
        await this.$store.auth.confirmRegistration(this.pendingEmail, code, true)
        this.stopResendCooldown()
        const name = this.$store.auth.user?.name || this.name.trim() || ''
        const message = name ? `Bienvenido/a ${name}` : 'Bienvenido/a'
        this.$store.toast.success(message)
        this.$router.navigate('/dashboard')
      } catch (error) {
        this.codeError =
          error?.message && error.message !== 'Error de conexión'
            ? error.message
            : 'No pudimos confirmar tu correo. Revisa el código e inténtalo de nuevo.'
        this.code = ''
        this.$nextTick(() => {
          this.$refs.codeAlert?.focus()
          this.$refs.codeInput?.focus()
        })
      } finally {
        this.confirming = false
      }
    },

    async resendCode() {
      if (this.resending || this.resendIn > 0) return

      this.resending = true
      this.codeError = null

      try {
        const data = await this.$store.auth.resendConfirmation(this.pendingEmail)
        this.startResendCooldown(data?.email_confirmation?.resend_cooldown_seconds ?? 60)
        this.$store.toast.success('Código reenviado')
      } catch (error) {
        const message = error?.message || 'No pudimos reenviar el código'
        // El backend responde 429 con los segundos que faltan
        const waitMatch = message.match(/(\d+)\s*segundos/)
        if (error?.status === 429 && waitMatch) {
          this.startResendCooldown(Number(waitMatch[1]))
          this.codeError = message
        } else {
          this.codeError = message
        }
      } finally {
        this.resending = false
      }
    },

    startResendCooldown(seconds) {
      this.stopResendCooldown()
      this.resendIn = Math.max(0, Number(seconds) || 0)
      if (this.resendIn <= 0) return
      this._resendTimer = setInterval(() => {
        this.resendIn -= 1
        if (this.resendIn <= 0) this.stopResendCooldown()
      }, 1000)
    },

    stopResendCooldown() {
      if (this._resendTimer) {
        clearInterval(this._resendTimer)
        this._resendTimer = null
      }
      this.resendIn = 0
    },

    backToForm() {
      this.step = 'form'
      this.code = ''
      this.codeError = null
      this.stopResendCooldown()
    },

    destroy() {
      this.stopResendCooldown()
    },

    goToLogin() {
      this.$router.navigate('/login')
    }
  }
}

export function CreateWallFormComponent() {
  return {
    title: '',
    isPublic: true,
    backgroundColor: '#ffffff',
    loading: false,
    error: null,

    get titleLength() {
      return this.title.trim().length
    },

    get canSubmit() {
      return this.titleLength >= 3 && !this.loading
    },

    async submit() {
      if (this.loading) return

      this.error = null

      if (!this.title.trim()) {
        this.error = 'Ponle un título a tu muro'
        return
      }

      this.loading = true

      try {
        const wall = await api.walls.create({
          title: this.title.trim(),
          is_public: this.isPublic,
          background_color: this.backgroundColor
        })
        this.$store.app.closeCreateWall()
        this.$store.app.wallCount += 1
        window.dispatchEvent(new CustomEvent('walls:changed'))
        this.$store.toast.success('¡Tu muro está listo!')
        // Stay on the current page (mis muros): the wall is
        // opened later from its "Editar" action or its link.
      } catch (error) {
        this.error = error?.message || 'No pudimos crear el muro'
      } finally {
        this.loading = false
      }
    },

    close() {
      this.$store.app.closeCreateWall()
    }
  }
}

export function EditWallFormComponent() {
  return {
    wall: null,
    title: '',
    isPublic: true,
    backgroundColor: '#ffffff',
    loading: false,
    error: null,

    init() {
      // Wall data is passed via $store.app.editWallData
      const data = this.$store.app.editWallData
      if (data) {
        this.wall = data
        this.title = data.title
        this.isPublic = data.is_public
        this.backgroundColor = data.background_color || '#ffffff'
      }
    },

    get titleLength() {
      return this.title.trim().length
    },

    get canSubmit() {
      return this.titleLength >= 3 && !this.loading && this.wall
    },

    async submit() {
      if (this.loading || !this.wall) return

      this.error = null

      if (!this.title.trim()) {
        this.error = 'Ponle un título a tu muro'
        return
      }

      this.loading = true

      try {
        await api.walls.update(this.wall.id, {
          title: this.title.trim(),
          is_public: this.isPublic,
          background_color: this.backgroundColor
        })
        this.$store.app.closeEditWall()
        this.$store.toast.success('Muro actualizado')
        // Reload the wall view to reflect changes
        window.dispatchEvent(new CustomEvent('wall:updated', { detail: { wallId: this.wall.id } }))
      } catch (error) {
        this.error = error?.message || 'No pudimos actualizar el muro'
      } finally {
        this.loading = false
      }
    },

    close() {
      this.$store.app.closeEditWall()
    }
  }
}

export function registerAuthComponents(Alpine) {
  Alpine.data('loginForm', LoginFormComponent)
  Alpine.data('registerForm', RegisterFormComponent)
  Alpine.data('createWallForm', CreateWallFormComponent)
  Alpine.data('editWallForm', EditWallFormComponent)
}

// Shared inline icons
const ICONS = {
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17.8 17.8 0 0 1-3.2 3.9M6.6 6.6A17.9 17.9 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 5.4-1.6"></path><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"></path><path d="m2 2 20 20"></path></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>'
}

// ========================================
// Login form
// ========================================

export const LoginFormTemplate = `
<form class="auth-form" @submit.prevent="submit()" novalidate x-ref="form" :aria-busy="loading">

  <div class="auth-form__alert" x-ref="alert"
       x-show="formError || errorCount > 0" x-cloak
       role="alert" tabindex="-1">
    ${ICONS.alert}
    <span x-show="formError" x-text="formError"></span>
    <span x-show="!formError && errorCount === 1" x-cloak>
      Revisa el campo marcado antes de continuar.
    </span>
    <span x-show="!formError && errorCount > 1" x-cloak>
      Revisa los <span x-text="errorCount"></span> campos marcados antes de continuar.
    </span>
  </div>

  <div class="field">
    <label class="field__label" for="login-email">Correo electrónico</label>
    <div class="field__control">
      <span class="field__icon">${ICONS.mail}</span>
      <input class="field__input"
             id="login-email"
             type="email"
             inputmode="email"
             autocomplete="email"
             enterkeyhint="next"
             placeholder="mi email"
             x-model="email"
             x-on:blur="touch('email')"
             x-on:input="revalidate('email')"
             :aria-invalid="errors.email ? 'true' : 'false'"
             :aria-describedby="errors.email ? 'login-email-error' : 'login-email-hint'">
    </div>
    <p class="field__hint" id="login-email-hint" x-show="!errors.email">
      El correo con el que te registraste.
    </p>
    <p class="field__error" id="login-email-error" x-show="errors.email" x-cloak role="alert">
      ${ICONS.alert}<span x-text="errors.email"></span>
    </p>
  </div>

  <div class="field">
    <label class="field__label" for="login-password">Contraseña</label>
    <div class="field__control">
      <span class="field__icon">${ICONS.lock}</span>
      <input class="field__input"
             id="login-password"
             :type="showPassword ? 'text' : 'password'"
             autocomplete="current-password"
             enterkeyhint="go"
             placeholder="mi contraseña"
             x-model="password"
             x-on:blur="touch('password')"
             x-on:input="revalidate('password')"
             :aria-invalid="errors.password ? 'true' : 'false'"
             :aria-describedby="errors.password ? 'login-password-error' : 'login-password-hint'">
      <button type="button" class="field__action"
              @click="showPassword = !showPassword"
              :aria-pressed="showPassword ? 'true' : 'false'"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'">
        <span x-show="!showPassword">${ICONS.eye}</span>
        <span x-show="showPassword" x-cloak>${ICONS.eyeOff}</span>
      </button>
    </div>
    <p class="field__hint" id="login-password-hint" x-show="!errors.password">
      Al menos ${MIN_PASSWORD_LENGTH} caracteres.
    </p>
    <p class="field__error" id="login-password-error" x-show="errors.password" x-cloak role="alert">
      ${ICONS.alert}<span x-text="errors.password"></span>
    </p>
  </div>

  <div class="auth-form__row">
    <label class="checkbox">
      <input type="checkbox" x-model="remember" name="remember">
      <span class="checkbox__box">${ICONS.check}</span>
      <span>Recordarme en este dispositivo</span>
    </label>

    <button type="button" class="link-button" @click="goToForgotPassword()">
      ¿Olvidaste tu contraseña?
    </button>
  </div>

  <div class="auth-form__submit-sticky">
    <button type="submit" class="btn btn--primary btn--lg btn--block"
            :disabled="loading" :data-busy="loading ? 'true' : 'false'">
      <span class="spinner" x-show="loading" x-cloak aria-hidden="true"></span>
      <span x-text="loading ? 'Entrando...' : 'Entrar a mi cuenta'"></span>
    </button>
  </div>

  <div class="auth-form__submit-inline">
    <button type="submit" class="btn btn--primary btn--lg btn--block"
            :disabled="loading" :data-busy="loading ? 'true' : 'false'">
      <span class="spinner" x-show="loading" x-cloak aria-hidden="true"></span>
      <span x-text="loading ? 'Entrando...' : 'Entrar a mi cuenta'"></span>
    </button>
  </div>

  <p class="auth-form__footer">
    ¿Todavía no tienes cuenta?
    <a href="/register" class="auth-form__switch" @click.prevent="goToRegister()">Regístrate gratis</a>
  </p>
</form>
`

// ========================================
// Register form
// ========================================

export const RegisterFormTemplate = `
<form class="auth-form" x-show="step === 'form'" @submit.prevent="submit()" novalidate x-ref="form" :aria-busy="loading">

  <div class="auth-form__alert" x-ref="alert"
       x-show="formError || errorCount > 0" x-cloak
       role="alert" tabindex="-1">
    ${ICONS.alert}
    <span x-show="formError" x-text="formError"></span>
    <span x-show="!formError && errorCount === 1" x-cloak>
      Revisa el campo marcado antes de continuar.
    </span>
    <span x-show="!formError && errorCount > 1" x-cloak>
      Revisa los <span x-text="errorCount"></span> campos marcados antes de continuar.
    </span>
  </div>

  <div class="field">
    <label class="field__label" for="register-name">Cómo te llamas</label>
    <div class="field__control">
      <span class="field__icon">${ICONS.user}</span>
      <input class="field__input"
             id="register-name"
             type="text"
             autocomplete="name"
             enterkeyhint="next"
             maxlength="60"
             placeholder="mi nombre"
             x-model="name"
             x-on:blur="touch('name')"
             x-on:input="revalidate('name')"
             :aria-invalid="errors.name ? 'true' : 'false'"
             :aria-describedby="errors.name ? 'register-name-error' : 'register-name-hint'">
    </div>
    <p class="field__hint" id="register-name-hint" x-show="!errors.name">
      Es el nombre que verán los que firmen tu muro.
    </p>
    <p class="field__error" id="register-name-error" x-show="errors.name" x-cloak role="alert">
      ${ICONS.alert}<span x-text="errors.name"></span>
    </p>
  </div>

  <div class="field">
    <label class="field__label" for="register-email">Correo electrónico</label>
    <div class="field__control">
      <span class="field__icon">${ICONS.mail}</span>
      <input class="field__input"
             id="register-email"
             type="email"
             inputmode="email"
             autocomplete="email"
             enterkeyhint="next"
             placeholder="mi email"
             x-model="email"
             x-on:blur="touch('email')"
             x-on:input="revalidate('email')"
             :aria-invalid="errors.email ? 'true' : 'false'"
             :aria-describedby="errors.email ? 'register-email-error' : 'register-email-hint'">
    </div>
    <p class="field__hint" id="register-email-hint" x-show="!errors.email">
      También sirve para recuperar tu cuenta si pierdes el acceso.
    </p>
    <p class="field__error" id="register-email-error" x-show="errors.email" x-cloak role="alert">
      ${ICONS.alert}<span x-text="errors.email"></span>
    </p>
  </div>

  <div class="field">
    <label class="field__label" for="register-password">Contraseña</label>
    <div class="field__control">
      <span class="field__icon">${ICONS.lock}</span>
      <input class="field__input"
             id="register-password"
             :type="showPassword ? 'text' : 'password'"
             autocomplete="new-password"
             enterkeyhint="next"
             placeholder="mi contraseña"
             x-model="password"
             x-on:blur="touch('password')"
             x-on:input="revalidate('password')"
             :aria-invalid="errors.password ? 'true' : 'false'"
             aria-describedby="register-password-strength register-password-rules">
      <button type="button" class="field__action"
              @click="showPassword = !showPassword"
              :aria-pressed="showPassword ? 'true' : 'false'"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'">
        <span x-show="!showPassword">${ICONS.eye}</span>
        <span x-show="showPassword" x-cloak>${ICONS.eyeOff}</span>
      </button>
    </div>

    <div class="strength" x-show="password" x-cloak id="register-password-strength"
         :data-level="strength" aria-live="polite">
      <div class="strength__bars" aria-hidden="true">
        <span class="strength__bar"></span>
        <span class="strength__bar"></span>
        <span class="strength__bar"></span>
        <span class="strength__bar"></span>
      </div>
      <p class="strength__label">
        Contraseña <strong x-text="strengthLabel"></strong>
      </p>
    </div>

    <ul class="requirements auth-form__requirements" id="register-password-rules">
      <template x-for="requirement in requirements" :key="requirement.id">
        <li class="requirements__item" :data-met="requirement.met ? 'true' : 'false'">
          <span x-show="requirement.met">${ICONS.check}</span>
          <span x-show="!requirement.met" x-cloak>${ICONS.circle}</span>
          <span x-text="requirement.label"></span>
        </li>
      </template>
    </ul>

    <p class="field__error" x-show="errors.password" x-cloak role="alert">
      ${ICONS.alert}<span x-text="errors.password"></span>
    </p>
  </div>

  <div class="field">
    <label class="field__label" for="register-confirm">Repite la contraseña</label>
    <div class="field__control">
      <span class="field__icon">${ICONS.lock}</span>
      <input class="field__input"
             id="register-confirm"
             :type="showConfirmPassword ? 'text' : 'password'"
             autocomplete="new-password"
             enterkeyhint="next"
             placeholder="repetir mi contraseña"
             x-model="confirmPassword"
             x-on:blur="touch('confirmPassword')"
             x-on:input="revalidate('confirmPassword')"
             :aria-invalid="errors.confirmPassword ? 'true' : 'false'"
             :aria-describedby="errors.confirmPassword ? 'register-confirm-error' : null">
      <button type="button" class="field__action"
              @click="showConfirmPassword = !showConfirmPassword"
              :aria-pressed="showConfirmPassword ? 'true' : 'false'"
              :aria-label="showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'">
        <span x-show="!showConfirmPassword">${ICONS.eye}</span>
        <span x-show="showConfirmPassword" x-cloak>${ICONS.eyeOff}</span>
      </button>
    </div>
    <p class="field__error" id="register-confirm-error" x-show="errors.confirmPassword" x-cloak role="alert">
      ${ICONS.alert}<span x-text="errors.confirmPassword"></span>
    </p>
  </div>

  <div class="field">
    <label class="checkbox" :class="{ 'text-error': errors.acceptedTerms }">
      <input type="checkbox" x-model="acceptedTerms"
             :aria-invalid="errors.acceptedTerms ? 'true' : 'false'"
             :aria-describedby="errors.acceptedTerms ? 'register-terms-error' : null">
      <span class="checkbox__box">${ICONS.check}</span>
      <span class="legal">
        Acepto los <a href="/terms" @click.prevent>términos de uso</a> y la
        <a href="/privacy" @click.prevent>política de privacidad</a>.
      </span>
    </label>
    <p class="field__error" id="register-terms-error" x-show="errors.acceptedTerms" x-cloak role="alert">
      ${ICONS.alert}<span x-text="errors.acceptedTerms"></span>
    </p>
  </div>

  <div class="auth-form__submit-sticky">
    <button type="submit" class="btn btn--primary btn--lg btn--block"
            :disabled="loading" :data-busy="loading ? 'true' : 'false'">
      <span class="spinner" x-show="loading" x-cloak aria-hidden="true"></span>
      <span x-text="loading ? 'Creando tu cuenta...' : 'Crear mi cuenta gratis'"></span>
    </button>
  </div>

  <div class="auth-form__submit-inline">
    <button type="submit" class="btn btn--primary btn--lg btn--block"
            :disabled="loading" :data-busy="loading ? 'true' : 'false'">
      <span class="spinner" x-show="loading" x-cloak aria-hidden="true"></span>
      <span x-text="loading ? 'Creando tu cuenta...' : 'Crear mi cuenta gratis'"></span>
    </button>
  </div>

  <p class="auth-form__footer">
    ¿Ya tienes cuenta?
    <a href="/login" class="auth-form__switch" @click.prevent="goToLogin()">Entra a mi cuenta</a>
  </p>
</form>

<div class="auth-form" x-show="step === 'code'" x-cloak>

  <div class="auth-form__alert" x-ref="codeAlert"
       x-show="codeError" x-cloak
       role="alert" tabindex="-1">
    ${ICONS.alert}
    <span x-text="codeError"></span>
  </div>

  <header class="auth__header">
    <h1 class="auth__title">Confirmá tu correo</h1>
    <p class="auth__subtitle">
      Enviamos un código de 6 dígitos a <strong x-text="pendingEmail"></strong>.
      Revisa tu bandeja de entrada y también el spam.
    </p>
  </header>

  <div class="field">
    <label class="field__label" for="register-code">Código de confirmación</label>
    <div class="field__control">
      <input class="field__input field__input--code"
             id="register-code"
             type="text"
             inputmode="numeric"
             autocomplete="one-time-code"
             maxlength="6"
             enterkeyhint="done"
             placeholder="000000"
             x-ref="codeInput"
             x-model="code"
             x-on:input="onCodeInput()"
             :aria-invalid="codeError ? 'true' : 'false'"
             :aria-describedby="codeError ? 'register-code-error' : 'register-code-hint'">
    </div>
    <p class="field__hint" id="register-code-hint" x-show="!codeError">
      El código vence en unos minutos. Si no lo encuentras, revisá el spam.
    </p>
    <p class="field__error" id="register-code-error" x-show="codeError" x-cloak role="alert">
      ${ICONS.alert}<span x-text="codeError"></span>
    </p>
  </div>

  <div class="auth-form__submit-sticky">
    <button type="button" class="btn btn--primary btn--lg btn--block"
            @click="confirmCode()"
            :disabled="confirming || code.length !== 6" :data-busy="confirming ? 'true' : 'false'">
      <span class="spinner" x-show="confirming" x-cloak aria-hidden="true"></span>
      <span x-text="confirming ? 'Confirmando...' : 'Confirmar y terminar'"></span>
    </button>
  </div>

  <div class="auth-form__submit-inline">
    <button type="button" class="btn btn--primary btn--lg btn--block"
            @click="confirmCode()"
            :disabled="confirming || code.length !== 6" :data-busy="confirming ? 'true' : 'false'">
      <span class="spinner" x-show="confirming" x-cloak aria-hidden="true"></span>
      <span x-text="confirming ? 'Confirmando...' : 'Confirmar y terminar'"></span>
    </button>
  </div>

  <div class="auth-form__row">
    <button type="button" class="link-button" @click="resendCode()"
            :disabled="resending || resendIn > 0"
            x-text="resendIn > 0 ? 'Reenviar en ' + resendIn + 's' : (resending ? 'Reenviando...' : 'Reenviar código')"></button>
    <button type="button" class="link-button" @click="backToForm()">Usar otro correo</button>
  </div>

  <p class="auth-form__footer">
    ¿Ya tienes cuenta?
    <a href="/login" class="auth-form__switch" @click.prevent="goToLogin()">Entra a mi cuenta</a>
  </p>
</div>
`

// ========================================
// Brand panel - shown next to the form on
// tablets and up. Every claim here maps to
// something the app actually does.
// ========================================

export const AuthBrandPanelTemplate = `
  <h2 class="auth__brand-title">
    Un lienzo que se llena de <span class="accent-mark">firmas</span>
  </h2>

  <p class="auth__brand-text">
    Abre tu muro, comparte el link y mira cómo tus amigos lo dibujan en tiempo real,
    desde el móvil que tengan a mano.
  </p>

  <ul class="auth__points">
    <li class="auth__point">
      <span class="auth__point-icon" aria-hidden="true">${ICONS.check}</span>
      <span>Sin descargas: se abre en el navegador de quien invite.</span>
    </li>
    <li class="auth__point">
      <span class="auth__point-icon" aria-hidden="true">${ICONS.check}</span>
      <span>Tus invitados firman sin necesidad de registrarse.</span>
    </li>
    <li class="auth__point">
      <span class="auth__point-icon" aria-hidden="true">${ICONS.check}</span>
      <span>Solo tú borras trazos o reseteas el lienzo completo.</span>
    </li>
  </ul>

  <p class="auth__proof-text">Gratis, sin anuncios y con el código abierto.</p>
</div>
`

// ========================================
// Create wall form
// ========================================

export const WALL_AVAILABLE_COLORS = [
  { value: '#ffffff', label: 'Blanco' },
  { value: '#e0f2fe', label: 'Cielo' },
  { value: '#bbf7d0', label: 'Menta' },
  { value: '#fde047', label: 'Limón' },
  { value: '#fdba74', label: 'Melocotón' },
  { value: '#f9a8d4', label: 'Flamingo' },
  { value: '#c4b5fd', label: 'Lila' },
  { value: '#e2e8f0', label: 'Nubes' }
]

// Emitted as a JS array literal with single quotes:
// double quotes would terminate the x-for attribute.
const COLORS_LITERAL = WALL_AVAILABLE_COLORS
  .map((color) => `{ value: '${color.value}', label: '${color.label}' }`)
  .join(', ')

export const CreateWallFormTemplate = `
<form class="auth-form" @submit.prevent="submit()" novalidate :aria-busy="loading">

  <div class="field">
    <label class="field__label" for="wall-title">
      Título del muro
      <span class="field__optional" x-text="titleLength + '/40'"></span>
    </label>
    <div class="field__control">
      <span class="field__icon">${ICONS.user}</span>
      <input class="field__input"
             id="wall-title"
             type="text"
             maxlength="40"
             enterkeyhint="done"
             placeholder="Mi mural de firmas"
             x-model="title"
             :aria-describedby="'wall-title-hint'">
    </div>
    <p class="field__hint" id="wall-title-hint">
      Así lo verán tus amigos. Puedes cambiarlo después.
    </p>
  </div>

  <fieldset class="field">
    <legend class="field__label">Color del lienzo</legend>
    <div class="color-swatches" role="group" aria-label="Color del lienzo">
      <template x-for="color in [${COLORS_LITERAL}]" :key="color.value">
        <button type="button"
                class="color-swatch"
                :style="'background-color: ' + color.value"
                :aria-pressed="backgroundColor === color.value ? 'true' : 'false'"
                :aria-label="color.label"
                @click="backgroundColor = color.value"></button>
      </template>
    </div>
  </fieldset>

  <div class="field">
    <label class="checkbox">
      <input type="checkbox" x-model="isPublic">
      <span class="checkbox__box">${ICONS.check}</span>
      <span>
        <strong>Muro público.</strong>
        <span class="text-muted">Cualquiera con el link podrá firmar, sin registrarse.
        Si lo desmarcas, solo tú podrás entrar.</span>
      </span>
    </label>
  </div>

  <div class="auth-form__alert" x-show="error" x-cloak role="alert">
    ${ICONS.alert}
    <span x-text="error"></span>
  </div>
</form>
`

export const EditWallFormTemplate = `
<form class="auth-form" @submit.prevent="submit()" novalidate :aria-busy="loading">

  <div class="field">
    <label class="field__label" for="edit-wall-title">
      Título del muro
      <span class="field__optional" x-text="titleLength + '/40'"></span>
    </label>
    <div class="field__control">
      <span class="field__icon">${ICONS.user}</span>
      <input class="field__input"
             id="edit-wall-title"
             type="text"
             maxlength="40"
             enterkeyhint="done"
             placeholder="Mi mural de firmas"
             x-model="title"
             :aria-describedby="'edit-wall-title-hint'">
    </div>
    <p class="field__hint" id="edit-wall-title-hint">
      Así lo verán tus amigos.
    </p>
  </div>

  <fieldset class="field">
    <legend class="field__label">Color del lienzo</legend>
    <div class="color-swatches" role="group" aria-label="Color del lienzo">
      <template x-for="color in [${COLORS_LITERAL}]" :key="color.value">
        <button type="button"
                class="color-swatch"
                :style="'background-color: ' + color.value"
                :aria-pressed="backgroundColor === color.value ? 'true' : 'false'"
                :aria-label="color.label"
                @click="backgroundColor = color.value"></button>
      </template>
    </div>
  </fieldset>

  <div class="field">
    <label class="checkbox">
      <input type="checkbox" x-model="isPublic">
      <span class="checkbox__box">${ICONS.check}</span>
      <span>
        <strong>Muro público.</strong>
        <span class="text-muted">Cualquiera con el link podrá firmar, sin registrarse.
        Si lo desmarcas, solo tú podrás entrar.</span>
      </span>
    </label>
  </div>

  <div class="auth-form__alert" x-show="error" x-cloak role="alert">
    ${ICONS.alert}
    <span x-text="error"></span>
  </div>
</form>
`