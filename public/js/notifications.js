// public/js/notifications.js

let lastKnownNotifId = 0;
let isFirstLoad = true;

document.addEventListener('DOMContentLoaded', () => {
    injectNotificationStyles();
    initNotificationCenter();
    initToastContainer();
    setInterval(loadNotifications, 10000); 
});

// --- STYLES CSS CORRIGÉS ---
function injectNotificationStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* La cloche ne casse plus le layout ! */
        .notif-wrapper { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); z-index: 1000; }
        
        .notif-bell-btn { background: white; border: 1px solid #e2e8f0; color: #64748b; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; font-size: 1.1rem; position: relative; }
        .notif-bell-btn:hover { background: #f8fafc; color: #3b82f6; }
        .notif-bell-btn.active { background: #eff6ff; color: #3b82f6; border-color: #bfdbfe; }
        .notif-badge { position: absolute; top: -2px; right: -2px; background: #ef4444; color: white; font-size: 0.7rem; font-weight: bold; min-width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; border: 2px solid white; opacity: 0; transform: scale(0); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .notif-badge.show { opacity: 1; transform: scale(1); }
        
        /* Dropdown */
        .notif-dropdown { position: absolute; top: 50px; right: -10px; width: 340px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); z-index: 1000; display: none; flex-direction: column; overflow: hidden; animation: slideDown 0.2s ease-out; }
        .notif-dropdown.show { display: flex; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        
        /* Header Actions */
        .notif-header { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
        .notif-header h3 { margin: 0; font-size: 0.9rem; color: #334155; font-weight: 600; }
        .notif-actions-group { display: flex; gap: 12px; }
        .notif-action-link { font-size: 0.75rem; color: #3b82f6; cursor: pointer; text-decoration: none; transition: color 0.1s; }
        .notif-action-link:hover { text-decoration: underline; }
        .notif-action-link.danger { color: #ef4444; }
        
        /* Liste & Items */
        .notif-list { max-height: 350px; overflow-y: auto; }
        .notif-item { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s; display: flex; gap: 12px; align-items: flex-start; position: relative; }
        .notif-item:hover { background: #f8fafc; }
        .notif-item.unread { background: #f0f9ff; }
        .notif-icon { width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; }
        .type-info { background: #e0f2fe; color: #0369a1; }
        .type-success { background: #dcfce7; color: #15803d; }
        .type-warning { background: #fef9c3; color: #a16207; }
        .type-error { background: #fee2e2; color: #b91c1c; }
        .notif-content { flex: 1; padding-right: 25px; } /* Espace pour la poubelle */
        .notif-msg { display: block; font-size: 0.85rem; color: #334155; line-height: 1.4; margin-bottom: 2px; }
        .notif-time { display: block; font-size: 0.75rem; color: #94a3b8; }
        
        /* Boutons de suppression */
        .notif-delete-btn { position: absolute; right: 10px; top: 12px; background: none; border: none; color: #cbd5e1; cursor: pointer; padding: 5px; font-size: 0.9rem; border-radius: 4px; transition: all 0.2s; opacity: 0; }
        .notif-item:hover .notif-delete-btn { opacity: 1; }
        .notif-delete-btn:hover { color: #ef4444; background: #fee2e2; }

        /* --- TOASTS VOLANTS CORRIGÉS --- */
        #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
        .toast-popup { background: white; border-left: 4px solid #3b82f6; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-radius: 8px; padding: 15px 20px; display: flex; align-items: center; gap: 12px; min-width: 250px; max-width: 350px; transform: translateX(120%); transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: auto; }
        .toast-popup.show { transform: translateX(0); }
        .toast-popup.success { border-left-color: #10b981; }
        .toast-popup.warning { border-left-color: #f59e0b; }
        .toast-popup.error { border-left-color: #ef4444; }
        .toast-icon { font-size: 1.2rem; }
        .toast-icon.success { color: #10b981; }
        .toast-icon.warning { color: #f59e0b; }
        .toast-icon.error { color: #ef4444; }
        .toast-icon.info { color: #3b82f6; }
        .toast-text-wrap { flex: 1; cursor: pointer; }
        .toast-text { font-size: 0.9rem; color: #334155; font-weight: 500; line-height: 1.3; }
        .toast-close-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.1rem; padding: 4px; border-radius: 4px; }
        .toast-close-btn:hover { color: #ef4444; background: #f1f5f9; }
    `;
    document.head.appendChild(style);
}

// --- LOGIQUE TOAST ---
function initToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
}

function showToast(notif) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    let icon = 'fa-info-circle'; let colorClass = 'info';
    if (notif.type === 'success') { icon = 'fa-check-circle'; colorClass = 'success'; }
    if (notif.type === 'warning') { icon = 'fa-exclamation-triangle'; colorClass = 'warning'; }
    if (notif.type === 'error') { icon = 'fa-times-circle'; colorClass = 'error'; }

    const toast = document.createElement('div');
    toast.className = `toast-popup ${colorClass}`;
    toast.id = `toast-${notif.id}`;
    
    // Le texte cliqueble (Ouvre le lien), la croix (Supprime la notif)
    toast.innerHTML = `
        <i class="fas ${icon} toast-icon ${colorClass}"></i>
        <div class="toast-text-wrap" onclick="handleNotifClick(${notif.id}, '${notif.link || ''}')">
            <div class="toast-text">${escapeHtml(notif.message)}</div>
        </div>
        <button class="toast-close-btn" onclick="deleteNotif(${notif.id})" title="Fermer et supprimer">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);

    // Disparition automatique (sans la supprimer de la BDD)
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); 
    }, 5000);
}

// --- LOGIQUE CLOCHE ---
function initNotificationCenter() {
    const header = document.querySelector('.page-header');
    if (!header) return;

    // Prépare le header pour accueillir la cloche en absolute
    header.style.position = 'relative';
    // Ajoute un peu de marge à droite pour ne pas que le titre/bouton existant touche la cloche
    header.style.paddingRight = '80px'; 

    const wrapper = document.createElement('div');
    wrapper.className = 'notif-wrapper';
    wrapper.innerHTML = `
        <button class="notif-bell-btn" onclick="toggleNotifDropdown()">
            <i class="fas fa-bell"></i>
            <span class="notif-badge" id="notif-badge">0</span>
        </button>
        <div class="notif-dropdown" id="notif-dropdown">
            <div class="notif-header">
                <h3>Notifications</h3>
                <div class="notif-actions-group">
                    <span class="notif-action-link" onclick="markAllRead()"><i class="fas fa-check-double"></i> Tout lu</span>
                    <span class="notif-action-link danger" onclick="deleteAllNotifs()"><i class="fas fa-trash-alt"></i> Vider</span>
                </div>
            </div>
            <div class="notif-list" id="notif-list"></div>
        </div>
    `;

    header.appendChild(wrapper);

    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('notif-dropdown');
        const btn = document.querySelector('.notif-bell-btn');
        if (dropdown && dropdown.classList.contains('show')) {
            if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.classList.remove('show');
                btn.classList.remove('active');
            }
        }
    });

    loadNotifications();
}

async function loadNotifications() {
    try {
        const res = await fetch('/api/notifications');
        if (!res.ok) return;
        const notifications = await res.json();
        
        if (!isFirstLoad && notifications.length > 0) {
            const newNotifs = notifications.filter(n => n.id > lastKnownNotifId);
            newNotifs.forEach(n => showToast(n));
        }

        if (notifications.length > 0) {
            lastKnownNotifId = Math.max(...notifications.map(n => n.id));
        }
        isFirstLoad = false;

        renderNotifications(notifications);
        updateBadge(notifications);
    } catch (e) { console.error("Erreur notifs:", e); }
}

function renderNotifications(list) {
    const container = document.getElementById('notif-list');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: #94a3b8;"><i class="far fa-bell-slash" style="font-size:1.5rem; margin-bottom:10px; display:block; opacity:0.5;"></i>Boîte de réception vide</div>`;
        return;
    }
    container.innerHTML = list.map(n => {
        let icon = 'fa-info-circle'; let typeClass = 'type-info';
        if (n.type === 'success') { icon = 'fa-check'; typeClass = 'type-success'; }
        if (n.type === 'warning') { icon = 'fa-exclamation-triangle'; typeClass = 'type-warning'; }
        if (n.type === 'error') { icon = 'fa-times'; typeClass = 'type-error'; }
        
        const time = new Date(n.created_at).toLocaleString('fr-CH', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        const unreadClass = n.is_read ? '' : 'unread';
        
        return `
            <div class="notif-item ${unreadClass}">
                <div class="notif-icon ${typeClass}" onclick="handleNotifClick(${n.id}, '${n.link || ''}')"><i class="fas ${icon}"></i></div>
                <div class="notif-content" onclick="handleNotifClick(${n.id}, '${n.link || ''}')">
                    <span class="notif-msg">${escapeHtml(n.message)}</span>
                    <span class="notif-time">${time}</span>
                </div>
                ${!n.is_read ? '<i class="fas fa-circle" style="font-size:8px; color:#3b82f6; position:absolute; right:35px; top:24px;"></i>' : ''}
                <button class="notif-delete-btn" onclick="deleteNotif(${n.id})" title="Supprimer">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>`;
    }).join('');
}

function updateBadge(list) {
    const badge = document.getElementById('notif-badge');
    const unreadCount = list.filter(n => !n.is_read).length;
    if (unreadCount > 0) { badge.innerText = unreadCount > 99 ? '99+' : unreadCount; badge.classList.add('show'); } 
    else { badge.classList.remove('show'); }
}

// --- ACTIONS CLINIQUES ---
window.toggleNotifDropdown = function() {
    const d = document.getElementById('notif-dropdown');
    const b = document.querySelector('.notif-bell-btn');
    d.classList.toggle('show'); b.classList.toggle('active');
};

window.handleNotifClick = async function(id, link) {
    await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
    if (link && link !== 'null' && link !== '#') window.location.href = link;
    else loadNotifications(); 
};

window.markAllRead = async function() {
    await fetch('/api/notifications/read-all', { method: 'PUT' });
    loadNotifications();
};

// NOUVEAU : Supprimer une notification précise
window.deleteNotif = async function(id) {
    try {
        await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
        // Ferme le toast instantanément s'il est à l'écran
        const toast = document.getElementById(`toast-${id}`);
        if (toast) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }
        loadNotifications();
    } catch (e) { console.error("Erreur suppression:", e); }
};

// NOUVEAU : Tout vider
window.deleteAllNotifs = async function() {
    try {
        await fetch('/api/notifications/all', { method: 'DELETE' });
        loadNotifications();
    } catch (e) { console.error("Erreur vidage complet:", e); }
};

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}