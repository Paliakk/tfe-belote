import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const HomePage = () => import('./pages/HomePage.vue')
const LoginPage = () => import('./pages/LoginPage.vue')
const LobbyPage = () => import('./pages/LobbyPage.vue')
const GamePage = () => import('./pages/GamePage.vue')
const StatsPage = () => import('./pages/StatsPage.vue')
const RulesPage = () => import('./pages/RulesPage.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/rules', name: 'rules', component: RulesPage, meta: { public: true }, alias: ['/regles'] },
    { path: '/login', component: LoginPage },
    { path: '/lobby', component: LobbyPage, meta: { requiresAuth: true } },
    { path: '/game/:partieId/:mancheId?', component: GamePage, meta: { requiresAuth: true } },
    // Modal pattern via named view
    { path: '/stats/:joueurId?', components: { default: LobbyPage, modal: StatsPage }, meta: { requiresAuth: true } },
    { path: '/', redirect: '/lobby' },
    { path: '/:pathMatch(.*)*', redirect: '/lobby' },
    {
      path: "/game/:partieId",
      name: "game",
      component: () => import("@/pages/GamePage.vue"),
    }
  ]
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (to.meta.requiresAuth && !await session.ensureAuth()) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

export default router