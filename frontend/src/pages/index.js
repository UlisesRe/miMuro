// ========================================
// miMuro - Pages Index
//
// main.js registers each page directly so there is a
// single registration point. This barrel only
// re-exports for convenience.
// ========================================

export { registerHomePage, HomePageTemplate } from './Home.js'
export { registerLoginPage, LoginPageTemplate } from './Login.js'
export { registerRegisterPage, RegisterPageTemplate } from './Register.js'
export { registerDashboardPage, DashboardPageTemplate } from './Dashboard.js'
export { registerPublicWallPage, PublicWallTemplate } from './PublicWall.js'

export function registerAllPages(Alpine) {
  registerHomePage(Alpine)
  registerLoginPage(Alpine)
  registerRegisterPage(Alpine)
  registerDashboardPage(Alpine)
  registerPublicWallPage(Alpine)
}
