<template>
  <div
    class="card"
    :class="[
      mini ? 'mini' : '',
      suitClass,
      disabled ? 'disabled' : '',
      hoverable && !disabled ? 'hoverable' : '',
    ]"
    @click="$emit('click')"
  >
    <!-- Coins -->
    <div class="corner tl">
      <div class="rank">{{ rankShort }}</div>
      <SuitIcon :id="suitId" :size="cornerSuit" />
    </div>

    <!-- note: on ROTATE tout le bloc, pas les éléments individuellement -->
    <div class="corner br rotated">
      <div class="rank">{{ rankShort }}</div>
      <SuitIcon :id="suitId" :size="cornerSuit" />
    </div>

    <!-- Centre -->
    <div class="center">
      <!-- Figures : J/Q/K -->
      <template v-if="isFace">
        <SuitIcon :id="suitId" :size="watermarkSize" class="watermark" />
        <div class="face-letter">{{ rankShort }}</div>
      </template>

      <!-- Numériques : A,7–10 -->
      <svg class="pips" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
        <g>
          <template v-for="(p, i) in pipLayout" :key="i">
            <g :transform="`translate(${p.x},${p.y})`">
              <SuitIcon :id="suitId" :size="pipSize" />
            </g>
          </template>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import SuitIcon from "./SuitIcon.vue";
type Carte = { id: number; valeur: string; couleurId: number };

const props = defineProps<{
  card: Carte;
  mini?: boolean;
  hoverable?: boolean;
  disabled?: boolean;
}>();

const valeur = props.card.valeur;
const suitId = props.card.couleurId as 1 | 2 | 3 | 4;

const suitClass = suitId === 1 || suitId === 2 ? "red" : "black";
const currentColor = ""; // placeholder (hérite via CSS)


const rankShort = (() => {
  if (valeur === "As") return "A";
  if (valeur === "Valet") return "J";
  if (valeur === "Dame") return "Q";
  if (valeur === "Roi") return "K";
  return valeur; // 7,8,9,10
})();
const isFace = ["Valet", "Dame", "Roi"].includes(valeur);

/* tailles dynamiques via CSS vars (on lit juste la logique de layout ici) */
const cornerSuit = 16;
const pipSize = 18;
const watermarkSize = 64;

/* Layout pips : coordonnées (0..100, 0..150) */
type Pt = { x: number; y: number };
const C = (x: number, y: number): Pt => ({ x, y });
const midX = 50,
  midY = 70;
const top = 18,
  upper = 40,
  lower = 100,
  bot = 122;
const left = 26,
  innerL = 40,
  innerR = 60,
  right = 74;

function layoutFor(rank: string): Pt[] {
  switch (rank) {
    case 'As': return [C(midX, midY)]
    case '7':  return [C(midX, top), C(left, upper), C(right, upper), C(midX, midY), C(left, lower), C(right, lower), C(midX, bot)]
    case '8':  return [C(left, top), C(right, top), C(left, upper), C(right, upper), C(left, lower), C(right, lower), C(left, bot), C(right, bot)]
    case '9':  return [C(left, top), C(right, top), C(left, upper), C(right, upper), C(midX, midY), C(left, lower), C(right, lower), C(left, bot), C(right, bot)]
    case '10': return [C(left, top), C(right, top), C(left, upper), C(right, upper), C(innerL, midY), C(innerR, midY), C(left, lower), C(right, lower), C(left, bot), C(right, bot)]
    default:   return []
  }
}
const pipLayout = layoutFor(valeur);
</script>

<style scoped>
.card, .rank, .face-letter { font-variant-numeric: lining-nums tabular-nums; }

.card{
  --w: var(--card-w, 78px);
  --h: var(--card-h, 114px);

  --corner-w: var(--card-corner-w, 22px);
  --rank-fs: var(--card-rank-fs, 14px);
  --face-fs: var(--card-face-fs, 38px);

  width: var(--w);
  height: var(--h);
  display: inline-block;
  vertical-align: middle;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
  position: relative;
  color: #111;
  user-select: none;
}
.card.mini{
  --w: calc(var(--card-w, 78px) * 0.82);
  --h: calc(var(--card-h, 114px) * 0.82);
  --corner-w: calc(var(--card-corner-w, 22px) * 0.85);
  --rank-fs: calc(var(--card-rank-fs, 14px) * 0.85);
  --face-fs: calc(var(--card-face-fs, 38px) * 0.78);
}

.red{ color:#b91c1c; }
.black{ color:#111; }

.card.hoverable:hover { transform: translateY(-3px); }
.card.disabled { opacity:.45; filter: grayscale(60%); pointer-events: none; }

.corner{
  position: absolute;
  width: var(--corner-w);
  text-align: center;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;       /* densité plus propre */
}
.corner.tl{ left:6px; top:6px; }
.corner.br{ right:6px; bottom:6px; }
.corner.rotated{ transform: rotate(180deg); transform-origin: center; } /* on tourne tout le bloc */

.rank{ font-size: var(--rank-fs); }


/* Centre */
.center{ position:absolute; inset:0; }

/* pips: on réduit la zone utile -> limite les collisions */
.pips{
  position:absolute; inset:10px 12px 12px 12px;
  width: calc(100% - 24px);
  height: calc(100% - 22px);
}
/* Figures */
.face-letter{
  position:absolute; left:50%; top:50%;
  transform: translate(-50%,-50%);
  font-weight: 800;
  font-size: var(--face-fs);
  opacity:.92;
}
.watermark{
  position:absolute; left:50%; top:50%;
  transform: translate(-50%,-50%);
  opacity:.10;                  /* moins présent */
  z-index: 0;
}
.face-letter{ z-index: 1; }

/* util */
.rotate-180{ transform: rotate(180deg); }
@media (max-width: 640px){
  .card{ --w:64px; --h:94px; }
}
@media (max-width: 420px){
  .card{ --w:56px; --h:84px; }
}
</style>
