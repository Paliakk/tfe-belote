class NotificationManager {
    constructor(socket) {
        this.socket = socket;
        this.unreadCount = 0;
        this.notifications = [];
        this.setupSocketListeners();
        this.loadNotifications();
    }

    setupSocketListeners() {
        // Écouter les nouvelles notifications en temps réel
        this.socket.on('notification:new', (notification) => {
            this.addNotification(notification);
            this.showToast(notification.message);
            this.updateBadge();
        });

        // Compatibilité avec l'ancien système
        this.socket.on('friend:request', (request) => {
            this.showFriendRequestToast(request);
        });
    }

    async loadNotifications() {
        try {
            const token = sessionStorage.getItem('auth_token');
            const response = await fetch('http://localhost:3000/notifications', {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (response.ok) {
                this.notifications = await response.json();
                this.renderNotifications();
                this.updateBadge();
            }
        } catch (error) {
            console.error('Erreur chargement notifications:', error);
        }
    }

    addNotification(notification) {
        this.notifications.unshift(notification);
        this.renderNotifications();
    }

    renderNotifications() {
        const container = document.getElementById('notifications-container');
        if (!container) return;

        container.innerHTML = this.notifications.map(notif => `
            <div class="notification ${notif.read ? 'read' : 'unread'}" data-id="${notif.id}">
                <div class="notification-content">${notif.message}</div>
                <div class="notification-time">${this.formatDate(notif.createdAt)}</div>
                ${!notif.read ? `
                    <button class="btn btn-small" onclick="notificationManager.markAsRead(${notif.id})">
                        Marquer lu
                    </button>
                ` : ''}
            </div>
        `).join('');
    }

    async markAsRead(notificationId) {
        try {
            const token = sessionStorage.getItem('auth_token');
            const response = await fetch(`http://localhost:3000/notifications/${notificationId}/read`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (response.ok) {
                const notif = this.notifications.find(n => n.id === notificationId);
                if (notif) notif.read = true;
                this.renderNotifications();
                this.updateBadge();
            }
        } catch (error) {
            console.error('Erreur marquer comme lu:', error);
        }
    }

    async markAllAsRead() {
        try {
            const token = sessionStorage.getItem('auth_token');
            const response = await fetch('http://localhost:3000/notifications/read-all', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (response.ok) {
                this.notifications.forEach(notif => notif.read = true);
                this.renderNotifications();
                this.updateBadge();
            }
        } catch (error) {
            console.error('Erreur tout marquer comme lu:', error);
        }
    }

    updateBadge() {
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        const badge = document.getElementById('notification-badge');
        if (badge) {
            badge.textContent = this.unreadCount > 0 ? this.unreadCount : '';
            badge.style.display = this.unreadCount > 0 ? 'block' : 'none';
        }
    }

    showToast(message, duration = 3000) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    showFriendRequestToast(request) {
        this.showToast(`Nouvelle demande d'ami de ${request.fromUsername}`);
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'À l\'instant';
        if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
        if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)} h`;
        
        return date.toLocaleDateString();
    }

    togglePanel() {
        const panel = document.getElementById('notifications-panel');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            this.loadNotifications();
        } else {
            panel.style.display = 'none';
        }
    }
}

// Variable globale
let notificationManager;

// Fonction d'initialisation
function initNotifications(socket) {
    notificationManager = new NotificationManager(socket);
    return notificationManager;
}