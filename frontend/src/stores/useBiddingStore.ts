import { api } from '@/lib/api';
import type { ActiveManche, BiddingState, BidPayload } from '@/lib/types';
import { defineStore } from 'pinia';
import { isAxiosError } from 'axios';

function extractMessage(e: unknown): string {
    if (isAxiosError(e)) {
        const d = e.response?.data as unknown as { message?: string; activeMancheId?: number; activeMancheNumero?: number };
        return d?.message ?? e.message;
    }
    if (e instanceof Error) return e.message;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}
function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object'
}
function getNumber(o: Record<string, unknown>, key: string): number | undefined {
    const v = o[key];
    return typeof v === 'number' ? v : undefined;
}

export const useBiddingStore = defineStore('bidding', {
    state: () => ({
        active: null as ActiveManche | null,
        state: null as BiddingState | null,
        loading: false,
        error: '' as string,
    }),
    actions: {
        async fetchActive(partieId: number) {
            this.loading = true; this.error = '';
            try {
                const { data } = await api.get<ActiveManche>(`/bidding/active/${partieId}`);
                this.active = data;
                return data;
            } catch (e: unknown) {
                this.error = extractMessage(e);
                throw e;
            } finally {
                this.loading = false;
            }
        },

        async fetchState(mancheId: number) {
            this.loading = true; this.error = '';
            try {
                const { data } = await api.get<BiddingState>(`/bidding/state/${mancheId}`);
                this.state = data;
                return data;
            } catch (e: unknown) {
                this.error = extractMessage(e);
                throw e;
            } finally {
                this.loading = false;
            }
        },

        async bid(mancheId: number, payload: BidPayload) {
            this.loading = true; this.error = '';
            try {
                // payload: { joueurId, type: 'pass' | 'take_card' } | { joueurId, type:'choose_color', couleurAtoutId }
                const { data } = await api.post(`/bidding/${mancheId}/bid`, payload);

                // Si UC14 déclenche une nouvelle manche:
                if (isRecord(data)) {
                    const newId = getNumber(data, 'newMancheId');
                    if (newId !== undefined) {
                        this.active = { id: newId, numero: (this.active?.numero ?? 1) + 1 };
                        await this.fetchState(newId);
                        return data;
                    }
                }
                // Sinon on rafraîchit la manche en cours
                await this.fetchState(mancheId);
                return data;
            } catch (e: unknown) {
                const msg = extractMessage(e);
                if (isAxiosError(e) && e.response?.status === 409 && isRecord(e.response.data)) {
                    const res = e.response.data;
                    const activeMancheId = getNumber(res, 'activeMancheId');
                    const activeMancheNumero = getNumber(res, 'activeMancheNumero');
                    if (activeMancheId !== undefined) {
                        this.active = { id: activeMancheId, numero: activeMancheNumero ?? (this.active?.numero ?? 1) + 1 };
                        await this.fetchState(activeMancheId);
                    } else {
                        this.error = msg;
                    }
                } else {
                    this.error = msg;
                }
                throw e;
            } finally {
                this.loading = false;
            }
        },

        async relancerByPartie(partieId: number) {
            this.loading = true; this.error = '';
            try {
                const { data } = await api.post(`/partie/${partieId}/relancer`, {});
                if (isRecord(data)) {
                    const newId = getNumber(data, 'newMancheId');
                    if (newId !== undefined) {
                        this.active = {
                            id: newId,
                            numero: getNumber(data, 'numero') ?? (this.active?.numero ?? 1) + 1,
                        };
                        await this.fetchState(newId);
                    }
                }
                return data;
            } catch (e: unknown) {
                this.error = extractMessage(e);
                throw e;
            } finally {
                this.loading = false;
            }
        },
    },
});
