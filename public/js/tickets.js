let allTickets = [];
let allUsersList = []; // <-- NOUVELLE VARIABLE
let currentFilter = 'all';
let slimClient, slimAssignedNew, slimAssignedView, slimClientView;
let isModalLoading = false; 
let currentPage = 1;
let isLoadingEquipment = false;

function getItemsPerPage() {
  const rowHeight  = 52; // hauteur moyenne d'une ligne
  const tableTop   = document.getElementById('tickets-tbody')
    ?.closest('table')?.getBoundingClientRect().top || 300;
  const available  = window.innerHeight - tableTop - 120; // 120 = pagination + marges
  return Math.max(10, Math.floor(available / rowHeight));
}

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
        const response = await fetch('/api/auth/me');
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
    
        renderTickets();
    } catch (e) { console.error(e); }
}

function renderTickets() {
    const tbody = document.getElementById('tickets-tbody');
    const filteredTickets = allTickets.filter(t => {
        const assignees = t.assigned_ids ? t.assigned_ids.split(',') : [];
        if (currentFilter === 'all')        return true;
        if (currentFilter === 'mine')       return assignees.includes(String(window.currentUserId)) && t.status !== 'Clôturé';
        if (currentFilter === 'open')       return t.status === 'Ouvert';
        if (currentFilter === 'waiting')    return t.status === 'En attente';
        if (currentFilter === 'unassigned') return assignees.length === 0 && t.status !== 'Clôturé';
        if (currentFilter === 'closed')     return t.status === 'Clôturé';
        return true;
    });
 
    const totalPages  = Math.ceil(filteredTickets.length / getItemsPerPage());
    const ticketsToShow = filteredTickets.slice(
        (currentPage - 1) * getItemsPerPage(),
        currentPage * getItemsPerPage()
    );
 
    if (!ticketsToShow.length) {
        tbody.innerHTML = `
            <tr><td colspan="6" style="text-align:center;padding:4rem;color:var(--text-tertiary);">
                <i class="fas fa-inbox fa-2x" style="opacity:0.15;display:block;margin-bottom:12px;"></i>
                Aucune demande dans cette vue.
            </td></tr>`;
        if (typeof renderPagination === 'function') renderPagination(totalPages);
        return;
    }
 
    const priorityConfig = {
        'Urgente': { icon: '🔴', color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  rowClass: 'ticket-row-urgent' },
        'Haute':   { icon: '🟠', color: '#ea580c',              bg: '#ffedd5',                  rowClass: 'ticket-row-haute' },
        'Normale': { icon: '🔵', color: 'var(--color-primary)', bg: 'rgba(44,90,160,0.08)',     rowClass: 'ticket-row-normale' },
        'Basse':   { icon: '⚪', color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)',       rowClass: 'ticket-row-basse' },
    };
 
    const statusConfig = {
        'Ouvert':     { cls: 'status-open',    dot: '●' },
        'En attente': { cls: 'status-waiting', dot: '●' },
        'Clôturé':    { cls: 'status-closed',  dot: '●' },
    };
 
    tbody.innerHTML = ticketsToShow.map(t => {
        const prio    = t.priority || 'Normale';
        const pCfg    = priorityConfig[prio]  || priorityConfig['Normale'];
        const sCfg    = statusConfig[t.status] || statusConfig['Ouvert'];
 
        const urgentBadge = t.is_urgent
            ? `<span style="background:var(--color-danger-bg);color:var(--color-danger);
                font-size:10px;font-weight:700;padding:1px 6px;border-radius:2px;
                border:1px solid rgba(239,68,68,0.2);">🚨 URGENT</span>`
            : '';
 
        const prioBadge = `<span class="priority-badge"
            style="background:${pCfg.bg};color:${pCfg.color};">
            ${pCfg.icon} ${prio}
        </span>`;
 
        const assignedHtml = t.assigned_names
            ? `<span style="font-size:var(--text-xs);color:var(--text-secondary);font-weight:600;">
                <i class="fas fa-user" style="opacity:0.4;margin-right:4px;"></i>${escapeHtml(t.assigned_names)}
               </span>`
            : `<span style="font-size:var(--text-xs);color:var(--text-tertiary);font-style:italic;">Non assigné</span>`;
 
        return `
<tr onclick="openTicketDetails(${t.id})" class="${pCfg.rowClass}" style="cursor:pointer;">
    <td class="col-status">
        <span class="ticket-status-badge ${sCfg.cls}">${sCfg.dot} ${t.status}</span>
    </td>
    <td style="color:var(--text-tertiary);font-weight:700;font-size:0.85rem;width:55px;">#${t.id}</td>
    <td style="width:90px;">
        <span class="priority-badge" style="background:${pCfg.bg};color:${pCfg.color};display:inline-flex;align-items:center;gap:4px;">
            ${pCfg.icon} ${prio}
        </span>
        ${t.is_urgent ? `<span style="display:block;margin-top:3px;font-size:9px;font-weight:700;color:var(--color-danger);">🚨 URGENT</span>` : ''}
    </td>
    <td>
        <div style="font-weight:var(--font-semibold);color:var(--text-primary);
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(t.title)}
        </div>
        ${t.cabinet_name
            ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:1px;">
                <i class="fas fa-hospital" style="opacity:0.35;font-size:9px;margin-right:3px;"></i>
                ${escapeHtml(t.cabinet_name)}
               </div>`
            : ''}
    </td>
    <td style="width:150px;">
        ${t.assigned_names
            ? `<span style="font-size:var(--text-xs);color:var(--text-secondary);font-weight:600;">
                <i class="fas fa-user" style="opacity:0.4;margin-right:4px;"></i>${escapeHtml(t.assigned_names)}
               </span>`
            : `<span style="font-size:var(--text-xs);color:var(--text-tertiary);font-style:italic;">Non assigné</span>`}
    </td>
    <td style="width:140px;">   <!-- ← AJOUTE CE BLOC -->
        ${t.eq_name
            ? `<span style="font-size:11px;color:var(--text-secondary);">
                <i class="fas fa-cog" style="opacity:0.35;margin-right:3px;font-size:9px;"></i>
                ${escapeHtml(t.eq_name)}
               </span>`
            : `<span style="font-size:11px;color:var(--text-tertiary);">—</span>`}
    </td>
    <td class="col-date" style="color:var(--text-tertiary);font-size:var(--text-xs);width:95px;">
        ${parseDbDate(t.created_at).toLocaleDateString('fr-CH')}
    </td>
</tr>`;
    }).join('');
 
    if (typeof renderPagination === 'function') renderPagination(totalPages);
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

        let slimEquipView = null;

        if(slimClient) slimClient.destroy();
        if(slimClientView) slimClientView.destroy();
        if(slimAssignedNew) slimAssignedNew.destroy();
        if(slimAssignedView) slimAssignedView.destroy();

        document.getElementById('t-client').innerHTML = clientOptions;
        document.getElementById('v-client').innerHTML = clientOptions;
        document.getElementById('t-assigned').innerHTML = userOptions;
        document.getElementById('v-assigned').innerHTML = userOptions;

        slimClient = new SlimSelect({
        select: '#t-client',
        settings: { placeholderText: 'Rechercher un client...' },
        events: {
            afterChange: (newVal) => {
            loadEquipmentForClient(newVal[0]?.value || '', 't-equip');
            }
        }
        });

        slimClientView = new SlimSelect({
        select: '#v-client',
        settings: { placeholderText: 'Lier à un client...' },
        events: {
            afterChange: (newVal) => {
            if (!isModalLoading) {
                loadEquipmentForClient(newVal[0]?.value || '', 'v-equip');
            }
            }
        }
        });
        slimAssignedNew = new SlimSelect({ select: '#t-assigned', settings: { placeholderText: 'Assigner à...', closeOnSelect: false } });
        slimAssignedView = new SlimSelect({ select: '#v-assigned', settings: { placeholderText: 'Assigner à...', closeOnSelect: false } });
    } catch(e) { console.error(e); }
}

async function loadEquipmentForClient(clientId, selectId) {
    isLoadingEquipment = true;        // ← AJOUTE
    const select = document.getElementById(selectId);
    if (!clientId) {
        select.innerHTML = '<option value="">-- Choisir client d\'abord --</option>';
        isLoadingEquipment = false;   // ← AJOUTE
        return;
    }
    try {
        const res  = await fetch(`/api/clients/${clientId}/equipment`);
        const list = await res.json();
        select.innerHTML = '<option value="">-- Machine concernée --</option>' +
            list.map(e => `<option value="${e.id}">${e.brand} ${e.eq_name || e.name} (${e.serial_number})</option>`).join('');

        if (selectId === 'v-equip') {
            if (window.slimEquipView) {
                try { window.slimEquipView.destroy(); } catch {}
            }
            window.slimEquipView = new SlimSelect({
                select: '#v-equip',
                settings: { placeholderText: 'Rechercher une machine...' }
            });
        }
    } catch (e) { console.error(e); }
    finally {
        isLoadingEquipment = false;   // ← AJOUTE (dans finally = toujours exécuté)
    }
}

function openNewTicketModal() {
    document.getElementById('ticket-form').reset();
    slimClient.setSelected('');
    slimAssignedNew.setSelected([]);
    document.getElementById('t-equip').innerHTML = '<option value="">-- Choisir client d\'abord --</option>';
    document.getElementById('new-ticket-modal').classList.add('active');
}

async function saveTicket() {
    const title = document.getElementById('t-title').value.trim();
    const desc  = document.getElementById('t-desc').value.trim();
 
    if (!title || !desc) {
        if (window.toast) toast.error('Champs requis', 'Le sujet et le message sont obligatoires.');
        return;
    }
 
    const data = {
        title,
        description: desc,
        priority:     document.getElementById('t-priority').value || 'Normale',
        client_id:    document.getElementById('t-client').value   || null,
        equipment_id: document.getElementById('t-equip').value    || null,
        assigned_to:  slimAssignedNew.getSelected(),
        is_urgent:    document.getElementById('t-urgent').checked
    };
 
    try {
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            closeModal('new-ticket-modal');
            loadTickets();
            if (window.toast) toast.success('Ticket créé', title);
        } else {
            const err = await res.json();
            if (window.toast) toast.error('Erreur', err.error || 'Impossible de créer le ticket.');
        }
    } catch (e) { console.error(e); }
}

async function openTicketDetails(id) {
    isModalLoading = true;
    const res = await fetch(`/api/tickets/${id}`);
    const t   = await res.json();
 
    document.getElementById('current-ticket-id').value = t.id;
 
    // ── Titre dans le header ──────────────────────────────────────
    document.getElementById('v-title').innerHTML = `
        <span id="v-title-text" style="font-size:var(--text-lg);font-weight:var(--font-bold);
            color:var(--text-primary);">[#${t.id}] ${escapeHtml(t.title)}</span>`;
 
    // ── Métadonnées sidebar ───────────────────────────────────────
    document.getElementById('v-sidebar-meta').innerHTML = `
        <div style="margin-bottom:4px;">
            <i class="fas fa-hashtag" style="width:14px;opacity:0.4;"></i> Ticket #${t.id}
        </div>
        <div style="margin-bottom:4px;">
            <i class="fas fa-user" style="width:14px;opacity:0.4;"></i> ${escapeHtml(t.creator_name || '—')}
        </div>
        <div>
            <i class="fas fa-clock" style="width:14px;opacity:0.4;"></i>
            ${parseDbDate(t.created_at).toLocaleString('fr-CH')}
        </div>`;
 
    // ── Selects statut, priorité ──────────────────────────────────
    document.getElementById('v-status').value   = t.status;
    const vPrio = document.getElementById('v-priority');
    if (vPrio) vPrio.value = t.priority || 'Normale';
 
    // ── Urgent ────────────────────────────────────────────────────
    const urgentCheck = document.getElementById('v-urgent');
    const urgentBtn   = document.getElementById('v-urgent-btn');
    if (urgentCheck) urgentCheck.checked = !!t.is_urgent;
    updateUrgentBtnStyle(!!t.is_urgent);
 
    // ── Selects client / machine / assigné ────────────────────────
    slimClientView.setSelected(t.client_id ? String(t.client_id) : '');
    slimAssignedView.setSelected(t.assigned_to ? t.assigned_to.map(String) : []);
 
    await loadEquipmentForClient(t.client_id, 'v-equip');
    if (t.equipment_id && window.slimEquipView) {
        window.slimEquipView.setSelected(String(t.equipment_id));
    } else if (window.slimEquipView) {
        window.slimEquipView.setSelected('');
    }
 
    // ── Description ───────────────────────────────────────────────
    document.getElementById('v-meta').textContent =
        `Créé par ${t.creator_name} le ${parseDbDate(t.created_at).toLocaleString('fr-CH')}`;
    document.getElementById('v-desc').innerText = t.description;
 
    // ── Prépare la zone d'édition ─────────────────────────────────
    const editTitle = document.getElementById('v-edit-title');
    const editDesc  = document.getElementById('v-edit-desc');
    if (editTitle) editTitle.value = t.title;
    if (editDesc)  editDesc.value  = t.description;
    document.getElementById('v-edit-zone').style.display = 'none';
 
    // ── Commentaires ──────────────────────────────────────────────
    const commentsDiv = document.getElementById('v-comments');
    commentsDiv.innerHTML = t.comments.length
        ? t.comments.map(c => {
            const dt = parseDbDate(c.created_at).toLocaleString('fr-CH');
 
            if (c.is_system === 1) return `
    <div class="comment-system">
        <i class="fas fa-history" style="flex-shrink:0;"></i>
        <span>
            <strong>${escapeHtml(c.user_name)}</strong>
            ${escapeHtml(c.comment)}
        </span>
        <span style="margin-left:auto;white-space:nowrap;opacity:0.6;font-size:10px;">${dt}</span>
    </div>`;
 
            const isMe       = (c.user_id === window.currentUserId);
            const bubbleCls  = isMe ? 'chat-bubble chat-bubble-me' : 'chat-bubble chat-bubble-other';
 
            let fileHtml = '';
            if (c.file_path) {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(c.file_path);
                fileHtml = `<div style="margin-top:8px;">
                    <a href="${c.file_path}" target="_blank"
                        style="display:inline-block;${isImage ? '' : 'background:var(--bg-secondary);padding:4px 10px;border-radius:3px;text-decoration:none;color:var(--color-primary);font-size:0.85rem;border:1px solid var(--border-primary);'}">
                        ${isImage
                            ? `<img src="${c.file_path}" style="max-width:100%;max-height:180px;border-radius:3px;border:1px solid var(--border-primary);">`
                            : `<i class="fas fa-paperclip"></i> Voir la pièce jointe`}
                    </a>
                </div>`;
            }
 
            return `
                <div class="${bubbleCls}">
                    <div class="chat-bubble-header">
                        <span class="chat-bubble-author">${escapeHtml(c.user_name)}</span>
                        <span class="chat-bubble-date">${dt}</span>
                    </div>
                    <div class="chat-bubble-text">${escapeHtml(c.comment)}${fileHtml}</div>
                </div>`;
        }).join('')
        : `<div style="color:var(--text-tertiary);font-size:var(--text-sm);text-align:center;
            padding:30px;font-style:italic;">Commencez la discussion...</div>`;
 
    document.getElementById('view-ticket-modal').classList.add('active');
    scrollChatToBottom();
    setTimeout(() => { isModalLoading = false; }, 100);
}

function updateUrgentBtnStyle(isUrgent) {
    const btn   = document.getElementById('v-urgent-btn');
    const label = document.getElementById('v-urgent-label');
    if (!btn || !label) return;
    if (isUrgent) {
        btn.classList.add('active');
        label.textContent = 'Marqué comme urgent';
    } else {
        btn.classList.remove('active');
        label.textContent = 'Marquer comme urgent';
    }
}
 
window.toggleUrgentBtn = function() {
    const check = document.getElementById('v-urgent');
    if (!check) return;
    check.checked = !check.checked;
    updateUrgentBtnStyle(check.checked);
    updateTicketData();
};

async function updateTicketData() {
    if (isModalLoading || isLoadingEquipment) return;

    const id        = document.getElementById('current-ticket-id').value;
    const newStatus   = document.getElementById('v-status').value;
    const newPriority = document.getElementById('v-priority')?.value || 'Normale';
    const newUrgent   = document.getElementById('v-urgent').checked;

    const data = {
        status:       newStatus,
        priority:     newPriority,
        client_id:    document.getElementById('v-client').value    || null,
        equipment_id: document.getElementById('v-equip').value     || null,
        assigned_to:  slimAssignedView.getSelected(),
        is_urgent:    newUrgent,
    };

    const response = await fetch(`/api/tickets/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data)
    });

    if (response.ok) {
        // ❌ SUPPRIME le bloc for(const change of changes) {...}
        // Le serveur insère déjà les commentaires système dans PUT /:id

        await loadTickets(document.getElementById('ticket-search').value);
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
    if (!id) return;
 
    const ok = await confirmDelete('ce ticket et tous ses commentaires');
    if (!ok) return;
 
    try {
        const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
        if (res.ok) {
            closeModal('view-ticket-modal');
            loadTickets();
            if (window.toast) toast.success('Ticket supprimé', `Ticket #${id} supprimé.`);
        } else {
            const err = await res.json();
            if (window.toast) toast.error('Erreur', err.error || 'Suppression impossible (admin requis).');
        }
    } catch (e) { console.error(e); }
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

window.toggleEditMode = function() {
  const zone = document.getElementById('v-edit-zone');
  const main = document.querySelector('.ticket-modal-main');
  if (!zone || !main) return;

  const isVisible = zone.style.display !== 'none';

  if (isVisible) {
    // Ferme l'édition
    zone.style.display = 'none';
    main.classList.remove('is-editing');
  } else {
    // Ouvre l'édition
    const id     = document.getElementById('current-ticket-id').value;
    const ticket = allTickets.find(t => String(t.id) === String(id));
    if (ticket) {
      document.getElementById('v-edit-title').value = ticket.title;
      document.getElementById('v-edit-desc').value  = ticket.description;
    }
    zone.style.display = 'block';
    main.classList.add('is-editing');
    document.getElementById('v-edit-title').focus();
  }
};

window.cancelEditMode = function() {
  document.getElementById('v-edit-zone').style.display = 'none';
  document.querySelector('.ticket-modal-main')?.classList.remove('is-editing');
};
 
window.saveEditMode = async function() {
    const id    = document.getElementById('current-ticket-id').value;
    const title = document.getElementById('v-edit-title').value.trim();
    const desc  = document.getElementById('v-edit-desc').value.trim();
    if (!title || !desc) {
        if (window.toast) toast.error('Champs requis', 'Le titre et la description sont obligatoires.');
        return;
    }
    try {
        const res = await fetch(`/api/tickets/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                description: desc,
                status:      document.getElementById('v-status').value,
                client_id:   document.getElementById('v-client').value || null,
                equipment_id: document.getElementById('v-equip').value || null,
                assigned_to: slimAssignedView.getSelected(),
                is_urgent:   document.getElementById('v-urgent').checked,
                priority:    document.getElementById('v-priority').value,
            })
        });
        if (res.ok) {
            await loadTickets(document.getElementById('ticket-search').value);
            await openTicketDetails(id);
            if (window.toast) toast.success('Ticket modifié', title);
        }
    } catch (e) { console.error(e); }
};

window.deleteTicket    = deleteTicket;
window.saveTicket      = saveTicket;
window.openTicketDetails = openTicketDetails;