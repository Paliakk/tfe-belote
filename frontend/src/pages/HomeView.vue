<script setup lang="ts">
import { ref } from 'vue';
import TileButton from '@/components/TileButton.vue';
import CreateLobbyForm from '@/components/CreateLobbyForm.vue';
import JoinLobbyForm from '@/components/JoinLobbyForm.vue';
import { useRouter } from 'vue-router';

const showPlayPanel = ref(false);
const router = useRouter();

function openPlay() { showPlayPanel.value = true; }
function goRules()  { router.push({ name: 'rules' }); }     // crée la route plus tard
function goRanks()  { /* router.push({ name: 'leaderboard' }) */ }
function goArticles(){ /* router.push({ name: 'articles' }) */ }
function goVideos() { /* router.push({ name: 'videos' }) */ }
function goFaq()    { /* router.push({ name: 'faq' }) */ }
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8">
    <!-- Hero -->
    <header class="mb-8 text-center">
      <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight">Belote — MVP</h1>
      <p class="mt-2 text-mute">Crée un lobby, rejoins un pote et lance une partie en quelques secondes.</p>
    </header>

    <!-- Grid tuiles -->
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div @click="openPlay">
        <TileButton label="Jouer" icon="🎮" color="bg-gradient-to-b from-emerald-400 to-teal-500"/>
      </div>
      <div @click="goRules">
        <TileButton label="Comment jouer" icon="📖" color="bg-gradient-to-b from-sky-400 to-indigo-500"/>
      </div>
      <div @click="goRanks">
        <TileButton label="Classements" icon="🏆" color="bg-gradient-to-b from-amber-400 to-orange-500"/>
      </div>
      <div @click="goArticles">
        <TileButton label="Articles" icon="📝" color="bg-gradient-to-b from-fuchsia-400 to-pink-500"/>
      </div>
      <div @click="goVideos">
        <TileButton label="Vidéos" icon="🎬" color="bg-gradient-to-b from-violet-400 to-purple-500"/>
      </div>
      <div @click="goFaq">
        <TileButton label="FAQ" icon="❓" color="bg-gradient-to-b from-cyan-400 to-blue-500"/>
      </div>
    </section>

    <!-- Panneau "Jouer" -->
    <section
      v-show="showPlayPanel"
      class="mt-8 grid gap-6 md:grid-cols-2"
    >
      <div class="rounded-xl2 border border-white/10 bg-card p-5 shadow-soft">
        <h2 class="mb-2 text-xl font-semibold">Créer un lobby</h2>
        <p class="mb-4 text-sm text-mute">Nom + mot de passe (optionnel). Le créateur est ajouté automatiquement.</p>
        <CreateLobbyForm />
      </div>

      <div class="rounded-xl2 border border-white/10 bg-card p-5 shadow-soft">
        <h2 class="mb-2 text-xl font-semibold">Rejoindre un lobby</h2>
        <p class="mb-4 text-sm text-mute">Saisis l’ID du lobby, ton ID joueur et le mot de passe s’il existe.</p>
        <JoinLobbyForm />
      </div>
    </section>

    <!-- note -->
    <p class="mt-8 text-center text-sm text-mute">
      (Plus tard : accès à cette page réservé aux utilisateurs connectés)
    </p>
  </main>
</template>
