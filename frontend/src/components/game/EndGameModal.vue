<script setup lang="ts">
 import { useUiStore } from '@/stores/ui'
 import { computed } from 'vue'
 const ui = useUiStore()

 type Row = { numero:number; team1:number; team2:number; bonus?: string[] | string | null }

 function toNumber(x:any){ const n = Number(x); return Number.isFinite(n) ? n : 0 }
 function normBonus(b:any): string[]|null{
   if (!b) return null
   if (Array.isArray(b)) return b.filter(Boolean).map(String)
   return String(b).trim() ? [String(b)] : null
 }
 function normalizeRounds(p:any): Row[] {
   const raw = p?.rounds ?? p?.manches ?? p?.details ?? p?.history ?? p?.roundHistory ?? []
   if (!Array.isArray(raw)) return []
   return raw.map((r:any, i:number) => {
     const num = toNumber(r?.numero ?? r?.roundNo ?? r?.round ?? r?.index ?? (i+1))
     const t1  = toNumber(r?.team1 ?? r?.equipe1 ?? r?.score1 ?? r?.t1 ?? r?.us ?? r?.A ?? r?.left)
     const t2  = toNumber(r?.team2 ?? r?.equipe2 ?? r?.score2 ?? r?.t2 ?? r?.them ?? r?.B ?? r?.right)
     const bon = normBonus(r?.bonus ?? r?.bonuses ?? r?.tags)
     return { numero: num, team1: t1, team2: t2, bonus: bon }
   })
 }

 const rows = computed<Row[]>(() => normalizeRounds(ui.endModal.payload))

 const totals = computed(() => {
   // 1) si on a des rows, on SOMME (inclut forcément la dernière manche)
   if (rows.value.length) {
     return rows.value.reduce(
       (acc, r) => ({ t1: acc.t1 + toNumber(r.team1), t2: acc.t2 + toNumber(r.team2) }),
       { t1: 0, t2: 0 }
     )
   }
   // 2) sinon, on tente les cumuls envoyés par le backend
   const p = ui.endModal.payload || {}
   // formats possibles : { cumule:{team1,team2} } | { total:{...} } | { totals:{...} } | { scoreFinal:{...} }
   const cum = p.cumule ?? p.total ?? p.totals ?? p.scoreFinal ?? null
   if (cum) {
     const t1 = toNumber(cum.team1 ?? cum.equipe1 ?? cum.t1 ?? cum.us ?? cum.A ?? cum.left)
     const t2 = toNumber(cum.team2 ?? cum.equipe2 ?? cum.t2 ?? cum.them ?? cum.B ?? cum.right)
     return { t1, t2 }
   }
   // 3) dernier recourt : champs “plats” sur payload
   return {
     t1: toNumber(p.team1 ?? p.equipe1 ?? p.t1 ?? p.us ?? p.A ?? p.left),
     t2: toNumber(p.team2 ?? p.equipe2 ?? p.t2 ?? p.them ?? p.B ?? p.right),
   }
 })

 const winnerLabel = computed(() => {
   const p = ui.endModal.payload
   const fromPayload = p?.winner ?? p?.vainqueur ?? null
   if (fromPayload) return String(fromPayload)
   if (totals.value.t1 === totals.value.t2) return 'Égalité'
   return totals.value.t1 > totals.value.t2 ? 'Equipe 1' : 'Equipe 2'
 })
</script>

<template>
  <teleport to="body">
    <div
      v-if="ui.endModal.visible"
      class="fixed inset-0 z-[1000] grid place-items-center bg-black/55"
    >
      <div
        class="w-[min(92vw,600px)] rounded-2xl bg-white text-emerald-900 p-5 shadow-2xl"
      >
        <h3 class="text-2xl font-extrabold mb-2 text-center">Partie terminée</h3>
        <p class="text-center text-lg mb-4">
          Vainqueur : <strong>{{ winnerLabel }}</strong>
        </p>

        <!-- Totaux recalculés localement -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="border rounded-xl py-3 text-center">
            <div class="text-sm font-semibold mb-1">Equipe 1</div>
            <div class="text-2xl font-extrabold">{{ totals.t1 }}</div>
          </div>
          <div class="border rounded-xl py-3 text-center">
            <div class="text-sm font-semibold mb-1">Equipe 2</div>
            <div class="text-2xl font-extrabold">{{ totals.t2 }}</div>
          </div>
        </div>

        <!-- Tableau des manches -->
        <div v-if="rows.length" class="overflow-x-auto mb-4">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-slate-100">
                <th class="border px-2 py-1 text-left">Manche</th>
                <th class="border px-2 py-1 text-right">Equipe 1</th>
                <th class="border px-2 py-1 text-right">Equipe 2</th>
                <th class="border px-2 py-1 text-left">Bonus</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.numero">
                <td class="border px-2 py-1">{{ r.numero }}</td>
                <td class="border px-2 py-1 text-right">{{ r.team1 }}</td>
                <td class="border px-2 py-1 text-right">{{ r.team2 }}</td>
                <td class="border px-2 py-1">
                  <template v-if="Array.isArray(r.bonus)">{{
                    r.bonus.join(", ")
                  }}</template>
                  <template v-else>{{ r.bonus }}</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mb-4 text-center">
          Retour au lobby dans <strong>{{ ui.endModal.secondsLeft }}s</strong>.
        </p>
        <div class="flex gap-2 justify-end">
          <button
            class="px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-100 font-semibold"
            @click="ui.closeEndModal()"
          >
            Rester à la table
          </button>
          <button
            class="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            @click="ui.gotoLobbyNow()"
          >
            Aller au lobby
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>
