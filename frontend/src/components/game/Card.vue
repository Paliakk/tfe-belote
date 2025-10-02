<script setup lang="ts">
type Carte = { id: number; valeur: string; couleurId: 1|2|3|4 }

const props = defineProps<{
  card: Carte
  mini?: boolean
  hoverable?: boolean
  disabled?: boolean
}>()

const rank = (() => {
  switch (props.card.valeur) {
    case 'Valet': return 'J'
    case 'Dame':  return 'Q'
    case 'Roi':   return 'K'
    case 'As':    return 'A'
    default:      return props.card.valeur   // 7,8,9,10
  }
})()

const suitId = props.card.couleurId
const suit = ({1:'♥',2:'♦',3:'♣',4:'♠'} as const)[suitId]
const suitClass = (suitId === 1 || suitId === 2) ? 'red' : 'black'
</script>

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
    <!-- coins -->
    <div class="corner tl">
      <div class="rank">{{ rank }}</div>
      <div class="suit">{{ suit }}</div>
    </div>
    <div class="corner br rotated">
      <div class="rank">{{ rank }}</div>
      <div class="suit">{{ suit }}</div>
    </div>

    <!-- centre : bloc unique -->
    <div class="center">
      <div class="center-wrap">
        <div class="center-rank">{{ rank }}</div>
        <div class="center-suit">{{ suit }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card, .rank { font-variant-numeric: lining-nums tabular-nums; }

.card{
  --w: var(--card-w, 78px);
  --h: var(--card-h, 114px);
  --corner-w: var(--card-corner-w, 22px);

  width: var(--w); height: var(--h);
  border-radius: 12px; background: #fff; color:#0f172a;
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
  position: relative; user-select: none;
}
.card.mini{
  --w: calc(var(--card-w, 78px) * 0.82);
  --h: calc(var(--card-h, 114px) * 0.82);
  --corner-w: calc(var(--card-corner-w, 22px) * 0.85);
}

/* couleurs */
.red  { color:#c81e1e; }
.black{ color:#0f172a; }

/* interactivité */
.card.hoverable:hover { transform: translateY(-3px); }
.card.disabled { filter:none; opacity:.55; }
.card.disabled::after{
  content:""; position:absolute; inset:0; border-radius:12px;
  background: rgba(0,0,0,.18);
}

/* coins */
.corner{
  position:absolute; width:var(--corner-w); text-align:center; line-height:1;
  font-weight: 800; letter-spacing: -0.02em;
}
.corner.tl{ left:6px; top:6px; }
.corner.br{ right:6px; bottom:6px; }
.corner.rotated{ transform: rotate(180deg); transform-origin: center; }
.rank { font-size: 14px; }
.suit { font-size: 16px; }

.center{ position:absolute; inset:0; display:grid; place-items:center; }
.center-wrap{ text-align:center; line-height:1; }
.center-rank{ font-weight:900; font-size:44px; letter-spacing:-0.02em; }
.center-suit{ font-size:32px; margin-top:4px; }

@media (max-width: 640px){
  .card{ --w:64px; --h:94px; }
  .center-rank{ font-size:38px; }
  .center-suit{ font-size:28px; }
}
@media (max-width: 420px){
  .card{ --w:56px; --h:84px; }
  .center-rank{ font-size:34px; }
  .center-suit{ font-size:26px; }
}
</style>
