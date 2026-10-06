// ========================================
// miMuro - Components Index
// ========================================

import { registerToolbarComponent, ToolbarTemplate } from './Toolbar.js'
import {
  registerAuthComponents,
  LoginFormTemplate,
  RegisterFormTemplate,
  CreateWallFormTemplate,
  AuthBrandPanelTemplate
} from './AuthForms.js'
import { registerWallCardComponent, WallCardTemplate } from './WallCard.js'
import { registerAppComponent } from './App.js'
import AppTemplate from './AppTemplate.html?raw'

export function registerAllComponents(Alpine) {
  // Canvas.js is not registered: it duplicated
  // services/ws.js and the wall pages drive
  // useCanvas directly.
  registerToolbarComponent(Alpine)
  registerAuthComponents(Alpine)
  registerWallCardComponent(Alpine)
  registerAppComponent(Alpine)

  // Markup injected with x-html is compiled by
  // Alpine, not by the template literal it came
  // from, so anything it references has to be
  // reachable from the scope. Templates are
  // therefore exposed on a store rather than as
  // Alpine.data(), which Alpine only calls when a
  // component instantiates that exact name.
  Alpine.store('templates', {
    app: AppTemplate,
    toolbar: ToolbarTemplate,
    wallCard: WallCardTemplate,
    loginForm: LoginFormTemplate,
    registerForm: RegisterFormTemplate,
    createWallForm: CreateWallFormTemplate,
    authBrandPanel: AuthBrandPanelTemplate
  })
}
