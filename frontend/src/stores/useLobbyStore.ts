import { api } from '@/lib/api';
import type { CreateLobbyDto, JoinLobbyDto, Lobby, LobbyMembersDto, StartGameDto } from '@/lib/types';
import { defineStore } from 'pinia';
import { isAxiosError } from 'axios';

function extractMessage(e: unknown): string {
    if (isAxiosError(e)) {
        const d = e.response?.data as unknown as { message?: string };
        return d?.message ?? e.message;
    }
    if (e instanceof Error) return e.message;
    try {
        return JSON.stringify(e);
    } catch {
        return String(e);
    }
}

export const useLobbyStore = defineStore('lobby', {
    state: () => ({
        currentLobby: null as Lobby | null,
        loading: false,
        error: '' as string,
    }),
    actions: {
        async createLobby(dto: CreateLobbyDto) {
            this.loading = true; this.error = ''; // ← virgules ➜ points-virgules
            try {
                const { data } = await api.post<Lobby>('/lobby', dto);
                this.currentLobby = data;
                await this.fetchMembers(data.id);
                return data;
            } catch (e: unknown) {
                this.error = extractMessage(e);
                throw e;
            } finally {
                this.loading = false;
            }
        },

        async getLobby(lobbyId: number) {
            this.loading = true; this.error = '';
            try {
                const { data } = await api.get<Lobby>(`/lobby/${lobbyId}`);
                this.currentLobby = data;
                await this.fetchMembers(lobbyId);
                return data;
            } catch (e: unknown) {
                this.error = extractMessage(e);
                throw e;
            } finally {
                this.loading = false;
            }
        },

        async leaveLobby(lobbyId: number, joueurId: number) {
            this.loading = true; this.error = '';
            try {
                const { data } = await api.post<{ message: string }>(`/lobby/${lobbyId}/leave`, { joueurId });
                // Rafraîchissement
                try {
                    await this.getLobby(lobbyId);
                    await this.fetchMembers(lobbyId);
                } catch {
                    this.currentLobby = null;
                }
                return data;
            } catch (e: unknown) {
                this.error = extractMessage(e);
                throw e;
            } finally {
                this.loading = false;
            }
        },

        async startGame(lobbyId: number, dto: StartGameDto) {
            this.loading = true; this.error = '';
            try {
                // tente de lancer
                await api.post(`/lobby/${lobbyId}/start`, dto);
            } catch (e) {
                // si conflit/état invalide, on ne bloque pas : on rafraîchit l'état
                const msg = extractMessage(e);
                // Beaucoup d'implémentations renvoient 409/400 "lobby pas en attente"
                // On tente quand même de rafraîchir ensuite.
                console.warn('startGame warning:', msg);
            } finally {
                this.loading = false;
            }

            // Toujours rafraîchir l’état du lobby après tentative
            try {
                const { id } = await this.getLobby(lobbyId); // remet currentLobby à jour
                return this.currentLobby;
            } catch {
                return this.currentLobby;
            }
        },

        async joinLobby(dto: JoinLobbyDto) {
            this.loading = true; this.error = '';
            try {
                // ✅ ROUTE SANS :id — le backend lit le lobbyId depuis le body
                const { data } = await api.post<Lobby>(`/lobby/join`, {
                    lobbyId: dto.lobbyId,
                    joueurId: dto.joueurId,
                    password: dto.password || undefined,
                });
                this.currentLobby = data;
                await this.fetchMembers(dto.lobbyId);
                return data;
            } catch (e: unknown) {
                this.error = extractMessage(e);
                throw e;
            } finally {
                this.loading = false;
            }
        },
        async fetchMembers(lobbyId: number) {
            // on ne bloque pas l’UI avec loading: true; c’est un petit rafraîchissement
            try {
                const { data } = await api.get<LobbyMembersDto>(`/lobby/${lobbyId}/members`);
                // merge dans currentLobby (en le créant si nécessaire)
                if (!this.currentLobby || this.currentLobby.id !== lobbyId) {
                    this.currentLobby = { id: lobbyId, nom: '', statut: 'en_attente', membres: data.membres };
                } else {
                    this.currentLobby.membres = data.membres;
                    // si ton back ne renvoie pas statut dans /lobby/:id, on le garde tel quel
                }
                return data;
            } catch (e: unknown) {
                // ne pas écraser error globale du lobby juste pour un refresh
                console.warn('fetchMembers failed:', e);
                return null;
            }
        }

    },
});
