<template>
  <main class="min-h-dvh bg-slate-950 text-slate-100">
    <header class="max-w-4xl mx-auto px-4 py-6">
      <button class="text-sky-400 hover:text-sky-300" @click="$router.back()">← Retour</button>
      <h1 class="text-3xl sm:text-4xl font-bold mt-2">Règles de la Belote</h1>
      <p class="text-slate-300 mt-2">Résumé des règles utilisées dans l’application.</p>
    </header>

    <section class="max-w-4xl mx-auto px-4 pb-16 space-y-10">
      <article class="prose prose-invert max-w-none">
        <h2>Jeu de cartes et distribution</h2>
        <p>
          La Belote se joue avec un paquet de <strong>32 cartes</strong> (As, 10, Roi, Dame, Valet, 9, 8, 7) dans chaque couleur.
          4 joueurs, 2 équipes fixes de 2. Répartition en général 3–2–3 (8 cartes / joueur).
        </p>

        <h2>Phase d’enchères (prise d’atout)</h2>
        <p>
          Après 5 cartes distribuées, une carte est <em>retournée</em> (proposition d’atout).
          À tour de rôle, les joueurs <strong>prennent</strong> ou <strong>passent</strong>.
          Si quelqu’un prend, la couleur retournée devient l’atout, il devient <strong>preneur</strong>,
          prend la carte retournée et reçoit 2 cartes, les autres reçoivent 3 cartes.
        </p>
        <p>
          Si tout le monde passe au 1er tour, 2ᵉ tour : chacun peut choisir une
          autre couleur d’atout (différente de la retournée). Si tout le monde passe encore,
          la donne est <strong>annulée</strong> et redistribuée (donneur suivant).
        </p>

        <h2>Déroulement du jeu (8 plis)</h2>
        <ul>
          <li>Le joueur à gauche du donneur entame le premier pli.</li>
          <li>On doit <strong>fournir</strong> la couleur demandée si possible.</li>
          <li>Sinon, on doit <strong>couper</strong> à l’atout.</li>
          <li>Si un adversaire a déjà coupé, on doit <strong>surcouper</strong> si possible.</li>
          <li>Si le partenaire gagne déjà le pli, on peut se <strong>défausser</strong>.</li>
          <li>Le pli est rem porté par la plus forte carte de la couleur demandée,
              ou par le plus fort atout s’il y en a.</li>
        </ul>

        <h2>Valeur des cartes</h2>

        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-slate-900">
                <th class="text-left p-2 border border-slate-800">Carte</th>
                <th class="text-left p-2 border border-slate-800">À l’atout</th>
                <th class="text-left p-2 border border-slate-800">Hors atout</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="p-2 border border-slate-800">Valet</td><td class="p-2 border border-slate-800">20</td><td class="p-2 border border-slate-800">2</td></tr>
              <tr><td class="p-2 border border-slate-800">9</td><td class="p-2 border border-slate-800">14</td><td class="p-2 border border-slate-800">0</td></tr>
              <tr><td class="p-2 border border-slate-800">As</td><td class="p-2 border border-slate-800">11</td><td class="p-2 border border-slate-800">11</td></tr>
              <tr><td class="p-2 border border-slate-800">10</td><td class="p-2 border border-slate-800">10</td><td class="p-2 border border-slate-800">10</td></tr>
              <tr><td class="p-2 border border-slate-800">Roi</td><td class="p-2 border border-slate-800">4</td><td class="p-2 border border-slate-800">4</td></tr>
              <tr><td class="p-2 border border-slate-800">Dame</td><td class="p-2 border border-slate-800">3</td><td class="p-2 border border-slate-800">3</td></tr>
              <tr><td class="p-2 border border-slate-800">8</td><td class="p-2 border border-slate-800">0</td><td class="p-2 border border-slate-800">0</td></tr>
              <tr><td class="p-2 border border-slate-800">7</td><td class="p-2 border border-slate-800">0</td><td class="p-2 border border-slate-800">0</td></tr>
            </tbody>
          </table>
        </div>

        <h2>Annonces et bonus</h2>
        <ul>
          <li><strong>Belote–Rebelote</strong> (Roi + Dame d’atout joués avec annonce) : +20 points.</li>
          <li><strong>Dix de der</strong> (dernier pli) : +10 points.</li>
          <li><strong>Capot</strong> (8 plis) : +90 points (total 252).</li>
        </ul>

        <h2>Calcul des scores</h2>
        <p>
          L’équipe <strong>preneuse</strong> doit atteindre <strong>82 points</strong> (hors bonus).  
          Sinon, elle marque 0 et l’adversaire prend <strong>162</strong>.  
          À 81–81, report des points sur la donne suivante.
        </p>
        <p>
          La partie se joue au cumul : première équipe au-delà de <strong>301</strong> gagne.
          En cas d’égalité au-dessus de 301, on rejoue une donne.
        </p>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
</script>
