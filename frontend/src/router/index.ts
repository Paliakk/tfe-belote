import { createRouter, createWebHistory } from 'vue-router'
import LobbyView from '@/pages/LobbyView.vue';
import BiddingView from '@/pages/BiddingView.vue';

const HomeView = () => import('../pages/HomeView.vue');


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/lobby/:lobbyId', name: 'lobby', component: LobbyView, props: true },
    { path: '/partie/:partieId/bidding', name: 'bidding', component: BiddingView, props: true },
    { path: '/regles', name: 'rules', component: () => import('@/pages/RulesView.vue') }
  ],
})

export default router
