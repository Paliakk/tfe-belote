<!-- src/components/StatsModal.vue -->
<template>
  <teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[900] bg-black/50 backdrop-blur-sm"
      @click.self="emit('close')"
    />
    <div
      v-if="open"
      class="fixed inset-0 z-[901] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="w-full max-w-6xl max-h-[90vh] overflow-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl p-4 sm:p-5"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between gap-3 sticky top-0 bg-slate-900/95 backdrop-blur-sm pb-3"
        >
          <h2 class="text-lg font-semibold">📈 Statistiques joueur</h2>
          <button
            class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 hover:bg-white/5"
            aria-label="Fermer"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
        <!-- KPIs -->
        <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div class="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
            <h3
              class="text-[12px] font-semibold tracking-wide uppercase text-slate-400 mb-1"
            >
              Parties jouées
            </h3>
            <div class="text-2xl font-bold">{{ data?.games.played ?? 0 }}</div>
            <div class="text-sm text-slate-400">
              Gagnées: <b>{{ data?.games.won ?? 0 }}</b> · Perdues:
              <b>{{ data?.games.lost ?? 0 }}</b>
            </div>
          </div>
          <div class="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
            <h3
              class="text-[12px] font-semibold tracking-wide uppercase text-slate-400 mb-1"
            >
              Taux de victoire
            </h3>
            <div class="text-2xl font-bold" :class="winRateClass">
              {{ fmtPct(data?.games.winRate) }}
            </div>
            <div class="text-sm text-slate-400">Abandonnées comptées comme défaites</div>
          </div>
          <div class="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
            <h3
              class="text-[12px] font-semibold tracking-wide uppercase text-slate-400 mb-1"
            >
              Points / Manche
            </h3>
            <div class="text-2xl font-bold">{{ fmtNum(data?.points.perMancheAvg) }}</div>
            <div class="text-sm text-slate-400">
              /Partie: <b>{{ fmtNum(data?.points.perPartieAvg) }}</b>
            </div>
          </div>
          <div class="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
            <h3
              class="text-[12px] font-semibold tracking-wide uppercase text-slate-400 mb-1"
            >
              AFK
            </h3>
            <div class="text-2xl font-bold">{{ data?.discipline.timeouts ?? 0 }}</div>
            <div class="text-sm text-slate-400">
              Abandons: <b>{{ data?.discipline.abandons ?? 0 }}</b>
            </div>
          </div>
        </section>

        <!-- Résumé + Atouts -->
        <section class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <div
            class="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-800/40 p-3"
          >
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-base font-semibold">Résumé des performances</h3>
              <span class="text-sm text-slate-400">
                {{
                  data?.range?.from || data?.range?.to
                    ? `${(data?.range?.from ?? "…").slice(0, 10)} → ${(
                        data?.range?.to ?? "…"
                      ).slice(0, 10)}`
                    : "Toutes les données"
                }}
              </span>
            </div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <h4
                  class="text-[12px] font-semibold uppercase tracking-wide text-slate-400 mb-1"
                >
                  Victoires
                </h4>
                <div class="text-xl font-bold">
                  {{ data?.games.won ?? "—" }} / {{ data?.games.played ?? "—" }}
                </div>
                <div class="text-sm text-slate-400">
                  Taux victoire: <b>{{ fmtPct(data?.games.winRate) }}</b>
                </div>
              </div>
              <div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <h4
                  class="text-[12px] font-semibold uppercase tracking-wide text-slate-400 mb-1"
                >
                  Points
                </h4>
                <div class="text-xl font-bold">
                  {{ fmtNum(data?.points.perMancheAvg) }}
                </div>
                <div class="text-sm text-slate-400">
                  Δ/manche <b>{{ fmtNum(data?.points.diffPerMancheAvg) }}</b>
                </div>
              </div>
              <div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <h4
                  class="text-[12px] font-semibold uppercase tracking-wide text-slate-400 mb-1"
                >
                  Prises
                </h4>
                <div class="text-xl font-bold">
                  {{ data?.preneur.attempted ?? "—" }} →
                  {{ data?.preneur.succeeded ?? "—" }}
                </div>
                <div class="text-sm text-slate-400">
                  Réussite: <b>{{ fmtPct(data?.preneur.successRate) }}</b>
                </div>
              </div>
              <div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <h4
                  class="text-[12px] font-semibold uppercase tracking-wide text-slate-400 mb-1"
                >
                  Discipline
                </h4>
                <div class="text-xl font-bold">
                  {{ data?.discipline.timeouts ?? "—" }}
                </div>
                <div class="text-sm text-slate-400">
                  Abandons: <b>{{ data?.discipline.abandons ?? "—" }}</b>
                </div>
              </div>
            </div>
          </div>
          <div class="mt-6">
            <RecentResults :joueurId="localJoueurId || joueurId || null" :limit="5" />
          </div>

          <section class="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
            <h3 class="text-base font-semibold mb-2">Atouts favoris & efficacité</h3>

            <div
              v-if="data?.atouts?.mostChosen"
              class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
            >
              <span class="text-lg">{{
                couleurSym(data?.atouts?.mostChosen?.couleurId)
              }}</span>
              <span>
                {{ couleurName(data?.atouts?.mostChosen?.couleurId) }}
                <span class="text-slate-400"
                  >({{ data?.atouts?.mostChosen?.count }})</span
                >
              </span>
            </div>
            <div v-else class="text-slate-400">Aucune prise enregistrée</div>
          </section>
        </section>

        <!-- Tableau + Plis/bonus -->
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
            <h3 class="text-base font-semibold mb-2">
              Efficacité par atout (quand preneur)
            </h3>
            <table class="w-full border-separate border-spacing-y-2">
              <thead>
                <tr class="text-left text-[12px] uppercase tracking-wide text-slate-400">
                  <th class="px-2">Atout</th>
                  <th class="px-2">Tentatives</th>
                  <th class="px-2">Succès</th>
                  <th class="px-2">Taux</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in data?.atouts?.successByColor || []"
                  :key="row.couleurId"
                >
                  <td class="px-2">
                    <span
                      class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-sm"
                    >
                      <b>{{ couleurSym(row.couleurId) }}</b>
                      {{ couleurName(row.couleurId) }}
                    </span>
                  </td>
                  <td class="px-2">{{ row.attempted }}</td>
                  <td class="px-2">{{ row.succeeded }}</td>
                  <td class="px-2">
                    <div
                      class="h-2 rounded-full border border-slate-700 bg-slate-900 overflow-hidden"
                    >
                      <i
                        class="block h-full bg-gradient-to-r from-teal-400 to-sky-400"
                        :style="{
                          width:
                            Math.min(100, Math.round((row.successRate || 0) * 100)) + '%',
                        }"
                      />
                    </div>
                  </td>
                </tr>
                <tr v-if="!data?.atouts?.successByColor?.length">
                  <td colspan="4" class="px-2 py-3 text-slate-400 text-sm">
                    Aucune donnée
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
            <h3 class="text-base font-semibold mb-3">Plis & Bonus</h3>
            <div class="grid sm:grid-cols-2 gap-3">
              <div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <h4
                  class="text-[12px] font-semibold uppercase tracking-wide text-slate-400 mb-1"
                >
                  Plis gagnés
                </h4>
                <div class="text-xl font-bold">{{ data?.plis.total ?? "—" }}</div>
                <div class="text-sm text-slate-400">
                  /manche <b>{{ fmtNum(data?.plis.perMancheAvg) }}</b> · 8e pli
                  <b>{{ fmtPct(data?.plis.lastTrickWonPct) }}</b>
                </div>
              </div>
              <div class="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <h4
                  class="text-[12px] font-semibold uppercase tracking-wide text-slate-400 mb-1"
                >
                  Belote
                </h4>
                <div class="text-xl font-bold">{{ data?.bonus.beloteCount ?? "—" }}</div>
                <div class="text-sm text-slate-400">
                  Capot <b>{{ data?.bonus.capotCount ?? "—" }}</b> · 10 de der
                  <b>{{ data?.bonus.dixDeDerCount ?? "—" }}</b>
                </div>
              </div>
            </div>

            <div class="mt-3 space-y-2">
              <div class="text-slate-400 text-sm">Points en tant que preneur</div>
              <div
                class="h-2 rounded-full border border-slate-700 bg-slate-900 overflow-hidden"
              >
                <i
                  class="block h-full bg-gradient-to-r from-teal-400 to-sky-400"
                  :style="{ width: barPct(data?.preneur.pointsAsPreneurAvg) }"
                />
              </div>
              <div class="text-slate-400 text-sm">Points en tant que non-preneur</div>
              <div
                class="h-2 rounded-full border border-slate-700 bg-slate-900 overflow-hidden"
              >
                <i
                  class="block h-full bg-gradient-to-r from-teal-400 to-sky-400"
                  :style="{ width: barPct(data?.preneur.pointsAsNonPreneurAvg) }"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { getToken } from "@/services/auth";
import RecentResults from "@/components/stats/RecentResults.vue"

type Stats = {
  range?: { from?: string; to?: string };
  games: { played: number; won: number; lost: number; winRate: number };
  points: { perMancheAvg: number; perPartieAvg: number; diffPerMancheAvg: number };
  preneur: {
    attempted: number;
    succeeded: number;
    successRate: number;
    pointsAsPreneurAvg: number;
    pointsAsNonPreneurAvg: number;
  };
  discipline: { timeouts: number; abandons: number };
  atouts: {
    mostChosen?: { couleurId: number; count: number };
    successByColor: {
      couleurId: number;
      attempted: number;
      succeeded: number;
      successRate: number;
    }[];
  };
  plis: { total: number; perMancheAvg: number; lastTrickWonPct: number };
  bonus: { beloteCount: number; capotCount: number; dixDeDerCount: number };
};

const COULEURS = {
  1: { sym: "♥", name: "Coeur" },
  2: { sym: "♦", name: "Carreau" },
  3: { sym: "♣", name: "Trèfle" },
  4: { sym: "♠", name: "Pique" },
} as const;

const props = defineProps<{
  open: boolean;
  joueurId: number | null;
}>();
const emit = defineEmits<{ close: [] }>();

// UI state
const localJoueurId = ref<number | null>(null);
const from = ref<string>("");
const to = ref<string>("");

const data = ref<Stats | null>(null);
const apiHint = ref("");

const winRateClass = computed(() => {
  const r = data.value?.games.winRate ?? 0;
  return r >= 0.5 ? "text-emerald-400" : r >= 0.35 ? "text-amber-400" : "text-rose-400";
});

// helpers
function fmtPct(x?: number) {
  return Number.isFinite(x as number) ? `${Math.round((x as number) * 100)}%` : "—";
}
function fmtNum(x?: number, d = 1) {
  return Number(x ?? 0)
    .toFixed(d)
    .replace(".", ",");
}
function couleurSym(id?: number) {
  return COULEURS[id as 1 | 2 | 3 | 4]?.sym ?? "?";
}
function couleurName(id?: number) {
  return COULEURS[id as 1 | 2 | 3 | 4]?.name ?? "?";
}
function barPct(v?: number) {
  const max = Math.max(
    1,
    data.value?.preneur.pointsAsPreneurAvg ?? 0,
    data.value?.preneur.pointsAsNonPreneurAvg ?? 0
  );
  const n = Math.max(0, Math.min(100, Math.round(((v ?? 0) / max) * 100)));
  return `${n}%`;
}

async function load() {
  if (!localJoueurId.value) {
    alert("ID joueur manquant.");
    return;
  }
  const base = import.meta.env.VITE_API_BASE || "http://localhost:3000";
  const url = new URL(`/players/${localJoueurId.value}/stats`, base);
  if (from.value) url.searchParams.set("from", from.value);
  if (to.value) url.searchParams.set("to", to.value);
  apiHint.value = url.pathname + url.search;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tok = await getToken().catch(() => null);
  if (tok) headers.Authorization = "Bearer " + tok;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  data.value = (await res.json()) as Stats;
}

// auto-load quand la modale s'ouvre avec un joueurId
watch(
  () => props.open,
  (o) => {
    if (o) {
      localJoueurId.value = props.joueurId ?? null;
      // reset date pickers
      from.value = "";
      to.value = "";
      data.value = null;
      if (localJoueurId.value)
        load().catch((e) => alert("Erreur chargement stats: " + (e?.message || e)));
    }
  }
);
</script>
