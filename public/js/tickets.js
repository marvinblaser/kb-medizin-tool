let allTickets = [];
let allUsersList = []; // <-- NOUVELLE VARIABLE
let currentFilter = 'all';
let slimClient, slimAssignedNew, slimAssignedView, slimClientView;
let isModalLoading = false; 
let currentPage = 1;
const itemsPerPage = 10; // Nombre de tickets par page (vous pouvez changer ce chiffre)

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function parseDbDate(dateStr) {
    if (!dateStr) return null;
    let isoStr = dateStr;
    if (dateStr.includes(' ') && !dateStr.includes('Z')) { isoStr = dateStr.replace(' ', 'T') + 'Z'; }
    return new Date(isoStr);
}

function scrollChatToBottom() {
    const commentsDiv = document.getElementById('v-comments');
    if (commentsDiv) setTimeout(() => { commentsDiv.scrollTop = commentsDiv.scrollHeight; }, 50);
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await populateSelects();
    await loadTickets();
    
    const searchInput = document.getElementById('ticket-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => loadTickets(e.target.value), 300));
    }
    
    document.querySelectorAll('.ticket-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.ticket-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTickets(); 
        });
    });

    document.getElementById('comment-form').addEventListener('submit', (e) => { e.preventDefault(); addComment(); });
    document.getElementById('logout-btn')?.addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login.html'; });

    // CORRECTION : Animation du trombone SANS détruire le fichier
    document.body.addEventListener('change', function(e) {
        if (e.target.id === 'comment-file') {
            const label = document.getElementById('paperclip-label');
            const icon = document.getElementById('paperclip-icon');
            if (e.target.files.length > 0) {
                label.style.background = '#dbeafe';
                label.style.color = '#2563eb';
                icon.className = 'fas fa-check';
            }
        }
    });

    // CORRECTION : Ouvrir automatiquement un ticket venant d'une notification
    const urlParams = new URLSearchParams(window.location.search);
    const openId = urlParams.get('open');
    if (openId) {
        setTimeout(() => openTicketDetails(openId), 500);
    }
});

async function checkAuth() {
    try {
        const response = await fetch('/api/me');
        if (!response.ok) { window.location.href = '/login.html'; return; }
        const data = await response.json();
        window.currentUserId = data.user.id;
        document.getElementById("user-info").innerHTML = `<div class="user-avatar">${data.user.name.charAt(0)}</div><div class="user-details"><strong>${data.user.name}</strong><span>${data.user.role}</span></div>`;
    } catch { window.location.href = '/login.html'; }
}

async function loadTickets(searchQuery = '') {
    try {
        const url = searchQuery ? `/api/tickets?search=${encodeURIComponent(searchQuery)}` : '/api/tickets';
        const res = await fetch(url);
        allTickets = await res.json();
        
        let countOpen = 0, countMine = 0, countWait = 0, countUnassigned = 0;
        allTickets.forEach(t => {
            const assignees = t.assigned_ids ? t.assigned_ids.split(',') : [];
            if (t.status === 'Ouvert') countOpen++;
            if (t.status === 'Ouvert' && assignees.includes(String(window.currentUserId))) countMine++;
            if (t.status === 'En attente') countWait++;
            if (t.status === 'Ouvert' && assignees.length === 0) countUnassigned++;
        });
        
        document.getElementById('kpi-open').innerText = countOpen;
        document.getElementById('kpi-mine').innerText = countMine;
        document.getElementById('kpi-waiting').innerText = countWait;
        document.getElementById('kpi-unassigned').innerText = countUnassigned;

        // --- MISE À JOUR DU BADGE DU MENU EN TEMPS RÉEL ---
        const badge = document.querySelector('.ticket-badge');
        const ticketLink = document.querySelector('.sidebar-nav a[href="/tickets.html"]');
        
        if (countMine > 0) {
            if (badge) {
                badge.innerText = countMine; // Met à jour le chiffre
            } else if (ticketLink) {
                // Crée le badge s'il n'existait pas
                ticketLink.insertAdjacentHTML('beforeend', `<span class="ticket-badge">${countMine}</span>`);
            }
        } else if (badge) {
            badge.remove(); // Supprime la pastille rouge si on a fini son travail !
        }

        renderTickets();
    } catch (e) { console.error(e); }
}

function renderTickets() {
    const tbody = document.getElementById('tickets-tbody');
    const filteredTickets = allTickets.filter(t => {
        const assignees = t.assigned_ids ? t.assigned_ids.split(',') : [];
        if (currentFilter === 'all') return true;
        if (currentFilter === 'mine') return assignees.includes(String(window.currentUserId)) && t.status !== 'Clôturé';
        if (currentFilter === 'open') return t.status === 'Ouvert';
        if (currentFilter === 'waiting') return t.status === 'En attente';
        if (currentFilter === 'unassigned') return assignees.length === 0 && t.status !== 'Clôturé';
        if (currentFilter === 'closed') return t.status === 'Clôturé';
        return true;
    });

    const totalPages = Math.ceil(filteredTickets.length / itemsPerPage);
    
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (totalPages === 0) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const ticketsToShow = filteredTickets.slice(startIndex, endIndex);

    if (ticketsToShow.length === 0) { 
        // ATTENTION : Le colspan passe à 7 à cause de la nouvelle colonne ID
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 4rem; color: #94a3b8;"><i class="fas fa-check-circle fa-2x" style="opacity:0.2; margin-bottom:10px;"></i><br>Aucune demande dans cette vue.</td></tr>'; 
        if (typeof renderPagination === 'function') renderPagination(totalPages);
        return; 
    }

    tbody.innerHTML = ticketsToShow.map(t => {
        let statusClass = t.status === 'Ouvert' ? 'status-open' : t.status === 'En attente' ? 'status-waiting' : 'status-closed';
        let urgentIcon = t.is_urgent ? '<span style="color:#dc2626; margin-right:8px; font-size:1.2rem;" title="Urgent">🚨</span>' : '';
        
        return `<tr onclick="openTicketDetails(${t.id})">
            <td class="col-status"><span class="ticket-status-badge ${statusClass}">${t.status}</span></td>
            
            <td style="color: #94a3b8; font-weight: bold; font-size: 0.85rem;">#${t.id}</td>
            
            <td style="font-weight: 700; color: #1e293b;">${urgentIcon}${escapeHtml(t.title)}</td>
            <td>${t.cabinet_name ? `<span style="font-weight:500; color:#475569;">🏢 ${escapeHtml(t.cabinet_name)}</span>` : '<span style="color:#cbd5e1;">-</span>'}</td>
            <td><small style="font-weight:600; color:#64748b;"><i class="fas fa-users-cog" style="margin-right:6px; opacity:0.5;"></i>${t.assigned_names || 'Non assigné'}</small></td>
            <td class="col-date" style="color: #64748b; font-size: 0.9rem;">${parseDbDate(t.created_at).toLocaleDateString('fr-CH')}</td>
            <td class="action-cell col-action">
                <button class="btn-outline" onclick="event.stopPropagation(); openTicketDetails(${t.id})">
                    Ouvrir <i class="fas fa-chevron-right" style="font-size: 0.7rem;"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    if (typeof renderPagination === 'function') {
        renderPagination(totalPages);
    }
}

async function populateSelects() {
    try {
        const [resUsers, resClients] = await Promise.all([fetch('/api/admin/users'), fetch('/api/clients')]);
        const users = await resUsers.json();
        allUsersList = users; // <-- SAUVEGARDE DE LA LISTE
        const clientsData = await resClients.json(); 
        const clientsArray = clientsData.clients || [];

        const userOptions = users.filter(u => u.is_active).map(u => `<option value="${u.id}">${u.name}</option>`).join('');
        const clientOptions = '<option value="">-- Aucun Client --</option>' + clientsArray.map(c => `<option value="${c.id}">${c.cabinet_name} - ${c.city}</option>`).join('');

        if(slimClient) slimClient.destroy();
        if(slimClientView) slimClientView.destroy();
        if(slimAssignedNew) slimAssignedNew.destroy();
        if(slimAssignedView) slimAssignedView.destroy();

        document.getElementById('t-client').innerHTML = clientOptions;
        document.getElementById('v-client').innerHTML = clientOptions;
        document.getElementById('t-assigned').innerHTML = userOptions;
        document.getElementById('v-assigned').innerHTML = userOptions;

        slimClient = new SlimSelect({ select: '#t-client', settings: { placeholderText: 'Rechercher un client...' } });
        slimClientView = new SlimSelect({ select: '#v-client', settings: { placeholderText: 'Lier à un client...' } });
        slimAssignedNew = new SlimSelect({ select: '#t-assigned', settings: { placeholderText: 'Assigner à...', closeOnSelect: false } });
        slimAssignedView = new SlimSelect({ select: '#v-assigned', settings: { placeholderText: 'Assigner à...', closeOnSelect: false } });
    } catch(e) { console.error(e); }
}

async function loadEquipmentForClient(clientId, selectId) {
    const select = document.getElementById(selectId);
    if (!clientId) { select.innerHTML = '<option value="">-- Choisir client d\'abord --</option>'; return; }
    try {
        const res = await fetch(`/api/clients/${clientId}/equipment`);
        const list = await res.json();
        select.innerHTML = '<option value="">-- Machine concernée --</option>' + 
            list.map(e => `<option value="${e.id}">${e.brand} ${e.eq_name || e.name} (${e.serial_number})</option>`).join('');
    } catch (e) { console.error(e); }
}

function openNewTicketModal() {
    document.getElementById('ticket-form').reset();
    slimClient.setSelected('');
    slimAssignedNew.setSelected([]);
    document.getElementById('t-equip').innerHTML = '<option value="">-- Choisir client d\'abord --</option>';
    document.getElementById('new-ticket-modal').classList.add('active');
}

async function saveTicket() {
    const title = document.getElementById('t-title').value;
    const desc = document.getElementById('t-desc').value;
    if (!title || !desc) return alert("Le sujet et le message sont obligatoires.");

    const data = { 
        title: title, description: desc, 
        client_id: document.getElementById('t-client').value || null, 
        equipment_id: document.getElementById('t-equip').value || null,
        assigned_to: slimAssignedNew.getSelected(),
        is_urgent: document.getElementById('t-urgent').checked
    };
    
    const res = await fetch('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { closeModal('new-ticket-modal'); loadTickets(); } 
}

async function openTicketDetails(id) {
    isModalLoading = true; 
    const res = await fetch(`/api/tickets/${id}`);
    const t = await res.json();
    
    document.getElementById('current-ticket-id').value = t.id;
    // On retire l'emoji du titre ici, car on utilise la vraie case à cocher
    document.getElementById('v-title').innerText = `[#${t.id}] ${t.title}`;
    document.getElementById('v-status').value = t.status;
    document.getElementById('v-urgent').checked = t.is_urgent ? true : false; // La case URGENT
    
    slimClientView.setSelected(t.client_id ? String(t.client_id) : '');
    slimAssignedView.setSelected(t.assigned_to ? t.assigned_to.map(String) : []);

    await loadEquipmentForClient(t.client_id, 'v-equip');
    document.getElementById('v-equip').value = t.equipment_id || '';

    document.getElementById('v-meta').innerHTML = `Créé par ${t.creator_name} le ${parseDbDate(t.created_at).toLocaleString('fr-CH')}`;
    document.getElementById('v-desc').innerText = t.description;

    const commentsDiv = document.getElementById('v-comments');
    commentsDiv.innerHTML = t.comments.length ? t.comments.map(c => {
        const dateLocal = parseDbDate(c.created_at).toLocaleString('fr-CH');
        if(c.is_system === 1) return `<div class="comment-system"><i class="fas fa-history"></i> <strong>${c.user_name}</strong> ${c.comment} <span style="opacity:0.6; margin-left:5px;">(${dateLocal})</span></div>`;
        
        const isMe = (c.user_id === window.currentUserId);
        const alignStyle = isMe ? 'align-self: flex-end; background-color: #f0fdf4; border-color: #bbf7d0;' : 'align-self: flex-start; background-color: white;';
        
        let fileHtml = '';
        if (c.file_path) {
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(c.file_path);
            fileHtml = `<div style="margin-top:8px;">
                <a href="${c.file_path}" target="_blank" style="display:inline-block; ${isImage ? '' : 'background:rgba(0,0,0,0.05); padding:5px 10px; border-radius:6px; text-decoration:none; color:var(--color-primary); font-size:0.85rem;'}">
                    ${isImage ? `<img src="${c.file_path}" style="max-width:100%; max-height:200px; border-radius:8px; border:1px solid #e2e8f0;">` : `<i class="fas fa-paperclip"></i> Voir la pièce jointe`}
                </a>
            </div>`;
        }
        
        return `<div class="comment-box" style="${alignStyle}"><div class="comment-header"><strong>${c.user_name}</strong> <span>${dateLocal}</span></div><div class="comment-text">${escapeHtml(c.comment)} ${fileHtml}</div></div>`;
    }).join('') : '<div style="color:#94a3b8; font-size:0.9rem; text-align:center; width:100%; margin-top:20px;">Commencez la discussion...</div>';

    document.getElementById('view-ticket-modal').classList.add('active');
    scrollChatToBottom();
    setTimeout(() => { isModalLoading = false; }, 100);
}

async function updateTicketData() {
    // Si la fenêtre est en train de se charger, on ne fait rien pour éviter les boucles
    if (isModalLoading) return;

    const id = document.getElementById('current-ticket-id').value;
    const data = { 
        status: document.getElementById('v-status').value, 
        client_id: document.getElementById('v-client').value || null,
        equipment_id: document.getElementById('v-equip').value || null,
        assigned_to: slimAssignedView.getSelected(),
        is_urgent: document.getElementById('v-urgent').checked 
    };
    
    // On attend que le serveur confirme que TOUT est enregistré
    const response = await fetch(`/api/tickets/${id}`, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(data) 
    });

    if (response.ok) {
        // On rafraîchit le tableau en arrière-plan
        await loadTickets(document.getElementById('ticket-search').value);
        // On force le rafraîchissement des détails pour voir le message du robot
        await openTicketDetails(id); 
    }
}

async function addComment() {
    const id = document.getElementById('current-ticket-id').value;
    const comment = document.getElementById('new-comment').value;
    const fileInput = document.getElementById('comment-file');
    const file = fileInput ? fileInput.files[0] : null;
    
    if (!comment && !file) return;

    const formData = new FormData();
    if (comment) formData.append('comment', comment);
    if (file) formData.append('attachment', file);

    const res = await fetch(`/api/tickets/${id}/comments`, { method: 'POST', body: formData });
    if (res.ok) { 
        document.getElementById('new-comment').value = ''; 
        if (fileInput) {
            fileInput.value = '';
            // On réinitialise l'apparence du trombone proprement
            const label = document.getElementById('paperclip-label');
            const icon = document.getElementById('paperclip-icon');
            label.style.background = '#f8fafc';
            label.style.color = '#64748b';
            icon.className = 'fas fa-paperclip';
        }
        openTicketDetails(id); 
        loadTickets(document.getElementById('ticket-search').value); 
    }
}

async function deleteTicket() {
    const id = document.getElementById('current-ticket-id').value;
    if (!id || !confirm("Voulez-vous vraiment supprimer ce ticket ?")) return;
    try {
        const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
        if (res.ok) { closeModal('view-ticket-modal'); loadTickets(); }
    } catch (e) { console.error("Erreur:", e); }
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function escapeHtml(t) { return t ? t.toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ''; }

// --- SYSTÈME DE MENTIONS DYNAMIQUES ---
document.addEventListener('DOMContentLoaded', () => {
    const commentInput = document.getElementById('new-comment');
    const mentionDropdown = document.getElementById('mention-dropdown');

    if (commentInput && mentionDropdown) {
        commentInput.addEventListener('input', function(e) {
            const val = this.value;
            const cursorPos = this.selectionStart;
            const textBeforeCursor = val.substring(0, cursorPos);
            
            // Cherche si on est en train de taper un @
            const match = textBeforeCursor.match(/@([a-zA-ZÀ-ÿ0-9_\-\.]*)$/);

            if (match) {
                const searchStr = match[1].toLowerCase();
                // On filtre les utilisateurs actifs
                const filtered = allUsersList.filter(u => u.is_active && u.name.replace(/\s+/g, '').toLowerCase().includes(searchStr));

                if (filtered.length > 0) {
                    mentionDropdown.innerHTML = filtered.map(u => 
                        `<div style="padding:10px 15px; cursor:pointer; border-bottom:1px solid #f1f5f9; font-size:0.9rem; color:#0f172a; font-weight:600; transition:0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'" onclick="insertMention('${u.name.replace(/\s+/g, '')}')">
                            <i class="fas fa-at" style="color:#cbd5e1; margin-right:6px;"></i> ${u.name}
                        </div>`
                    ).join('');
                    mentionDropdown.style.display = 'block';
                } else {
                    mentionDropdown.style.display = 'none';
                }
            } else {
                mentionDropdown.style.display = 'none';
            }
        });

        // Fermer le menu si on clique ailleurs
        document.addEventListener('click', (e) => {
            if (!commentInput.contains(e.target) && !mentionDropdown.contains(e.target)) {
                mentionDropdown.style.display = 'none';
            }
        });
    }
});

// Insérer le nom cliqué dans la zone de texte
window.insertMention = function(name) {
    const commentInput = document.getElementById('new-comment');
    const val = commentInput.value;
    const cursorPos = commentInput.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const textAfterCursor = val.substring(cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-ZÀ-ÿ0-9_\-\.]*)$/);

    if (match) {
        const startIdx = match.index;
        // On insère le nom sans espaces, suivi d'un espace pour continuer à écrire
        commentInput.value = val.substring(0, startIdx) + '@' + name + ' ' + textAfterCursor;
        document.getElementById('mention-dropdown').style.display = 'none';
        commentInput.focus();
    }
};

// --- FONCTIONS DE PAGINATION ---
function renderPagination(totalPages) {
    const container = document.getElementById('pagination-controls');
    if (!container) return;

    // S'il n'y a qu'une seule page, on cache la pagination
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // Bouton Précédent
    const prevDisabled = currentPage === 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
    html += `<button onclick="changePage(${currentPage - 1})" class="btn btn-outline" ${prevDisabled}>&laquo; Précédent</button>`;

    // Boutons des numéros de page
    for (let i = 1; i <= totalPages; i++) {
        const isActive = currentPage === i ? 'background:#2563eb; color:white; border-color:#2563eb;' : 'background:white; color:#334155;';
        html += `<button onclick="changePage(${i})" class="btn btn-outline" style="min-width: 35px; ${isActive}">${i}</button>`;
    }

    // Bouton Suivant
    const nextDisabled = currentPage === totalPages ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
    html += `<button onclick="changePage(${currentPage + 1})" class="btn btn-outline" ${nextDisabled}>Suivant &raquo;</button>`;

    container.innerHTML = html;
}

window.changePage = function(newPage) {
    currentPage = newPage;
    renderTickets(); // On recharge le tableau avec la nouvelle page
};