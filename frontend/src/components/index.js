// ========================================
// miMuro - Components Index
// ========================================

import { registerAppComponent } from './App.js'
import {
  registerAuthComponents,
  LoginFormTemplate,
  RegisterFormTemplate,
  AuthBrandPanelTemplate
} from './AuthForms.js'
import AppTemplate from './AppTemplate.html?raw'

export function registerAllComponents(Alpine) {
  registerAppComponent(Alpine)
  registerAuthComponents(Alpine)

  // Markup injected with x-html is compiled by
  // Alpine, not by the template literal it came
  // from, so anything it references has to be
  // reachable from the scope. Templates are
  // therefore exposed on a store rather than as
  // Alpine.data(), which Alpine only calls when a
  // component instantiates that exact name.
  Alpine.store('templates', {
    app: AppTemplate,
    loginForm: LoginFormTemplate,
    registerForm: RegisterFormTemplate,
    authBrandPanel: AuthBrandPanelTemplate
  })
}
