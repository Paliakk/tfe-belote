<script setup lang="ts">
import type { Lobby } from '../lib/types';
defineProps<{ lobby: Lobby | null }>();
</script>

<template>
  <section v-if="lobby" style="margin-top:1rem;">
    <h3>Membres ({{ lobby.nbMembres ?? lobby.membres?.length ?? 0 }})</h3>
    <ul>
      <li v-for="m in (lobby.membres || [])" :key="m.id">#{{ m.id }} — {{ m.username }}</li>
    </ul>
    <p>Statut: {{ lobby.statut }}</p>
    <p v-if="lobby.partie">Partie: #{{ lobby.partie.id }} ({{ lobby.partie.statut }})</p>
  </section>
</template>
