const KEY = 'belote.currentPlayerId'

export function getCurrentPlayerId(): number {
    const v = localStorage.getItem(KEY)
    return v ? Number(v) : 1 //1 par défaut
}

export function setCurrentPlayerId(id: number) {
    localStorage.setItem(KEY, String(id))
}