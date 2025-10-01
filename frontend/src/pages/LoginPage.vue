<template>
  <div class="min-h-screen grid place-items-center p-6">
    <div class="card p-8 max-w-md w-full space-y-6">
      <h1 class="text-2xl font-semibold">Connexion</h1>
      <button class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500" @click="onLogin">
        Se connecter avec Auth0
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { handleRedirectCallbackIfNeeded } from "@/services/auth";
import { useSessionStore } from "@/stores/session";

const router = useRouter();
const route = useRoute();
const session = useSessionStore();

onMounted(async () => {
  // Consomme le callback si présent (code/state)
  await handleRedirectCallbackIfNeeded();

  // Si déjà authentifié, redirige vers la page cible
  if (await session.ensureAuth()) {
    const redirect = (route.query.redirect as string) || "/lobby";
    router.replace(redirect);
  }
});

async function onLogin() {
  const redirect = (route.query.redirect as string) || '/lobby';
  await session.login(redirect);
}
</script>
