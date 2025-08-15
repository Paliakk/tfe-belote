import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type Carte = {
    id: number,
    valeur: string,
    couleurId: number
}
type TrickCard = {
    ordre: number,
    joueurId: number,
    carte: Carte
}
type Seat = { seat: number; joueurId: number; team: 1 | 2 }

@Injectable()
export class RulesService {
    // Force des cartes HORS atout (plus grand = plus fort)
    private strengthNonAtout: Record<string, number> = {
        'As': 7, '10': 6, 'Roi': 5, 'Dame': 4, 'Valet': 3, '9': 2, '8': 1, '7': 0,
    }

    //Force des cartes ATOUT
    private strengthAtout: Record<string, number> = {
        'Valet': 7, '9': 6, 'As': 5, '10': 4, 'Roi': 3, 'Dame': 2, '8': 1, '7': 0,
    }
    /**
     * Calcule les cartes jouables pour un joueur selon les règles Belote
     */
    playableCards(params: {
        hand: Carte[],
        trickCards: TrickCard[],        // cartes déjà posées dans le pli (ordre croissant)
        atoutId: number | null,
        seats: Seat[],                  // mapping joueurs → teams + seat
        currentPlayerId: number,
    }): number[] {
        const { hand, trickCards, atoutId, seats, currentPlayerId } = params

        if (trickCards.length === 0) {
            // Premier joueur du pli → tout est jouable
            return hand.map(c => c.id);
        }

        const couleurDemandee = trickCards[0].carte.couleurId
        const cartesCouleurDemandee = hand.filter(c => c.couleurId === couleurDemandee)
        const cartesAtout = atoutId ? hand.filter(c => c.couleurId === atoutId) : []

        //Quel camp mène actuellement le pli?
        const winning = this.currentWinning(trickCards, atoutId, couleurDemandee)
        const leaderTeam = this.teamOf(seats, winning.joueurId)
        const currentTeam = this.teamOf(seats, currentPlayerId)

        //1. Si on a la couleur demandée -> obligation de fournir
        if (cartesCouleurDemandee.length > 0) {
            //Belote standard : Pas d'obligation de "monter" hors atout
            return cartesCouleurDemandee.map(c => c.id)
        }

        //2. Pas la couleur demandée, mais on a de l'atout -> obligation de couper
        if (cartesAtout.length > 0 && atoutId != null) {
            const atoutsDejaJoues = trickCards.filter(tc => tc.carte.couleurId === atoutId).map(tc => tc.carte)
            // Exception partenaire maître : si mon partenaire mène le pli, je peux NE PAS couper
            const partnerLeads = (leaderTeam === currentTeam) && (winning.joueurId !== currentPlayerId)

            if (partnerLeads) {
                // Fournir couleur impossible -> libre (défausse/atout facultatif)
                return hand.map(c => c.id)
            }
            if (atoutsDejaJoues.length === 0) {
                //Aucun atout joué -> n'importe quel atout valide
                return cartesAtout.map(c => c.id)
            }

            //Il y a déjà de l'atout : obligation de SURCOUPER si possible (adversaire mène)
            const plusFortAtout = this.strongestAtout(atoutsDejaJoues);
            const surcoupePossible = cartesAtout.some(c => this.isStrongerAtout(c, plusFortAtout))

            if (surcoupePossible) {
                return cartesAtout.filter(c => this.isStrongerAtout(c, plusFortAtout)).map(c => c.id)
            }
            //Sinon, on coupe "faible" (si on doit couper)
            return cartesAtout.map(c => c.id)
        }
        //3. Sinon -> défausse libre
        return hand.map(c => c.id)
    }
    /**
     * Vérifier si la carte choisie est dans l'ensemble des jouables
     */
    isPlayable(params: {
        cardId: number,
        hand: Carte[],
        trickCards: TrickCard[],
        atoutId: number | null,
        seats: Seat[],
        currentPlayerId: number,
    }): { valid: boolean; playableIds: number[] } {
        const playable = this.playableCards(params);
        return { valid: playable.includes(params.cardId), playableIds: playable };
    }

    /**
     * Détermine la carte gagnante actuelle du plis
     */
    currentWinning(trickCards: TrickCard[], atoutId: number | null, couleurDemandee: number) {
        let winner = trickCards[0];
        for (let i = 1; i < trickCards.length; i++) {
            const challenger = trickCards[i];
            if (this.beats(challenger.carte, winner.carte, atoutId, couleurDemandee)) {
                winner = challenger;
            }
        }
        return winner; // { ordre, joueurId, carte }
    }

    /**
     * Compare deux cartes selon les règles de force (atout-demandée,autres)
     */
    beats(candidate: Carte, current: Carte, atoutId: number | null, couleurDemandee: number): boolean {
        // Si candidate est atout et current non → candidate gagne
        if (atoutId != null && candidate.couleurId === atoutId && current.couleurId !== atoutId) {
            return true;
        }
        // Si current est atout et candidate non → candidate perd
        if (atoutId != null && current.couleurId === atoutId && candidate.couleurId !== atoutId) {
            return false;
        }
        // Si les deux sont atout → compare force atout
        if (atoutId != null && candidate.couleurId === atoutId && current.couleurId === atoutId) {
            return this.strengthAtout[candidate.valeur] > this.strengthAtout[current.valeur];
        }
        // Sinon, hors atout : seule la COULEUR DEMANDÉE peut battre la COULEUR DEMANDÉE
        if (candidate.couleurId === couleurDemandee && current.couleurId === couleurDemandee) {
            return this.strengthNonAtout[candidate.valeur] > this.strengthNonAtout[current.valeur];
        }
        // Une carte d'une autre couleur ne bat pas la demandée (hors atout)
        return false;
    }
    strongestAtout(atouts: Carte[]): Carte {
        return atouts.reduce((max, c) =>
            this.strengthAtout[c.valeur] > this.strengthAtout[max.valeur] ? c : max
            , atouts[0]);
    }
    isStrongerAtout(a: Carte, b: Carte): boolean {
        return this.strengthAtout[a.valeur] > this.strengthAtout[b.valeur];
    }

    teamOf(seats: Seat[], joueurId: number): 1 | 2 {
        const s = seats.find(x => x.joueurId === joueurId);
        return s?.team ?? 1;
    }

}