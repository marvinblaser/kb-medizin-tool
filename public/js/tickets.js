let allTickets = [];
let allUsersList = [];
let currentFilter = 'open';
let currentCategory = '';
let currentSearch = '';
let currentTicketId = null;
let slimClient, slimAssignedNew, slimAssignedView, slimClientView;
let isModalLoading = false;
let isLoadingEquipment = false;
let currentPage = 1;
const PER_PAGE = 50;

// Rafraîchissement auto de la liste (outil collaboratif : assignations,
// nouveaux commentaires, pastilles "non lu" doivent apparaître sans reload).
const POLL_INTERVAL = 45000;
let pollTimer = null;
let ticketsLoadFailed = false;
let lastFocusBeforeDrawer = null;

// Sélection multiple (actions groupées) — ids sous forme de chaînes.
const selectedIds = new Set();

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

function timeAgo(dateStr) {
    const d = parseDbDate(dateStr);
    if (!d) return '';
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1)   return "à l'instant";
    if (diffMin < 60)  return `il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)    return `il y a ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7)     return `il y a ${diffD} j`;
    const diffW = Math.floor(diffD / 7);
    if (diffW < 5)     return `il y a ${diffW} sem.`;
    return `il y a ${Math.floor(diffD / 30)} mois`;
}

function ageDays(dateStr) {
    const d = parseDbDate(dateStr);
    if (!d) return 0;
    return (Date.now() - d.getTime()) / 86400000;
}

function formatShortDate(d) { return d ? new Date(d).toLocaleDateString('fr-CH') : '—'; }

function scrollChatToBottom() {
    const scroller = document.querySelector('.detail-scroll');
    if (scroller) setTimeout(() => { scroller.scrollTop = scroller.scrollHeight; }, 50);
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await populateSelects();
    await loadTickets();
    setupListKeyboardNav();
    setupSortableHeaders();

    // Recherche + catégorie : filtrage 100 % côté client (toute la liste est déjà
    // chargée) → instantané, aucun rechargement réseau, aucun clignotement.
    const searchInput = document.getElementById('ticket-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            currentSearch = e.target.value;
            currentPage = 1;
            renderTicketList();
        }, 150));
    }

    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            currentCategory = e.target.value;
            currentPage = 1;
            renderTicketList();
        });
    }

    document.querySelectorAll('.ticket-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.ticket-tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentFilter = e.currentTarget.dataset.filter;
            currentPage = 1;
            renderTicketList();
        });
    });

    window.addEventListener('resize', debounce(() => renderTicketList({ keepScroll: true }), 200));

    // Rafraîchissement auto + reprise immédiate quand l'onglet redevient visible.
    startPolling();
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) quietRefresh();
    });

    document.getElementById('comment-form').addEventListener('submit', (e) => { e.preventDefault(); addComment(); });

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

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('tickets-detail-drawer').classList.contains('open')) {
            closeDrawer();
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const openId = urlParams.get('open');
    if (openId) setTimeout(() => selectTicket(openId), 500);

    const quickCreateClientId = urlParams.get('client_id');
    if (urlParams.get('new') === '1' && quickCreateClientId) {
        openNewTicketModal();
        slimClient.setSelected(String(quickCreateClientId));
        await loadEquipmentForClient(quickCreateClientId, 't-equip');
        window.history.replaceState({}, document.title, '/tickets.html');
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

function setTabCount(elId, count) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.style.display = '';
    } else {
        el.textContent = '';
        el.style.display = 'none';
    }
}

// Chargement complet de la liste (toute la donnée d'un coup — pas de pagination
// serveur). Utilisé au démarrage et après création / suppression.
async function loadTickets() {
    if (!allTickets.length) renderSkeleton();
    try {
        const res = await fetch('/api/tickets');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        allTickets = await res.json();
        ticketsLoadFailed = false;
        recomputeTabCounts();
        renderTicketList();
    } catch (e) {
        console.error(e);
        ticketsLoadFailed = true;
        if (window.toast) toast.error('Chargement impossible', 'La liste des tickets n\'a pas pu être récupérée.');
        const list = document.getElementById('tickets-list');
        if (list && !allTickets.length) {
            list.innerHTML = `<tr><td colspan="8" class="tickets-list-empty is-error">
                <i class="fas fa-triangle-exclamation fa-2x"></i>
                Impossible de charger les tickets. <button class="pg-btn" style="margin-left:8px" onclick="loadTickets()">Réessayer</button>
            </td></tr>`;
        }
    }
}

// Rafraîchissement silencieux (polling / retour d'onglet) : ne touche ni au
// scroll, ni à la page courante, ni au tri, ni aux SlimSelect du tiroir.
async function quietRefresh() {
    if (document.hidden || isModalLoading) return;
    if (document.getElementById('new-ticket-modal')?.classList.contains('active')) return;
    try {
        const res = await fetch('/api/tickets');
        if (!res.ok) return;
        allTickets = await res.json();
        ticketsLoadFailed = false;
        recomputeTabCounts();
        renderTicketList({ keepScroll: true });
        if (document.getElementById('tickets-detail-drawer').classList.contains('open') && currentTicketId) {
            refreshOpenTicket(currentTicketId, { reports: true });
        }
    } catch (e) { /* silencieux : on retentera au prochain tick */ }
}

function startPolling() {
    stopPolling();
    pollTimer = setInterval(quietRefresh, POLL_INTERVAL);
}
function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function recomputeTabCounts() {
    let countOpen = 0, countMine = 0, countWait = 0, countUnassigned = 0;
    allTickets.forEach(t => {
        const assignees = t.assigned_ids ? t.assigned_ids.split(',') : [];
        const notClosed = t.status !== 'Clôturé';
        if (t.status === 'Ouvert') countOpen++;
        if (notClosed && assignees.includes(String(window.currentUserId))) countMine++;
        if (t.status === 'Bloqué') countWait++;
        if (notClosed && assignees.length === 0) countUnassigned++;
    });
    setTabCount('tab-count-open', countOpen);
    setTabCount('tab-count-mine', countMine);
    setTabCount('tab-count-waiting', countWait);
    setTabCount('tab-count-unassigned', countUnassigned);
}

function renderSkeleton() {
    const list = document.getElementById('tickets-list');
    if (!list) return;
    const widths = ['60%','40%','80%','55%','70%','45%','65%','50%'];
    list.innerHTML = widths.map(w => `
        <tr class="sk-row">
            <td class="col-check"></td>
            <td class="col-status"><div class="sk-bar" style="width:64px"></div></td>
            <td class="col-priority"><div class="sk-bar" style="width:56px"></div></td>
            <td class="col-title"><div class="sk-bar" style="width:${w}"></div></td>
            <td class="col-category"><div class="sk-bar" style="width:40px"></div></td>
            <td class="col-client"><div class="sk-bar" style="width:120px"></div></td>
            <td class="col-owner"><div class="sk-bar" style="width:90px"></div></td>
            <td class="col-age"><div class="sk-bar" style="width:48px"></div></td>
        </tr>`).join('');
}

const PRIORITY_CONFIG = {
    'Urgente': { icon: '🔴', color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)' },
    'Haute':   { icon: '🟠', color: '#ea580c',              bg: '#ffedd5' },
    'Normale': { icon: '🔵', color: 'var(--color-primary)', bg: 'var(--color-info-bg)' },
    'Basse':   { icon: '⚪', color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)' },
};
const STATUS_DOT_CLASS = { 'Ouvert': 'st-open', 'Bloqué': 'st-waiting', 'Clôturé': 'st-closed' };
const PRIORITY_ROW_CLASS = { 'Urgente': 'prio-Urgente', 'Haute': 'prio-Haute', 'Normale': 'prio-Normale', 'Basse': 'prio-Basse' };

const SORT_ACCESSORS = {
    status:   t => ({ 'Ouvert': 1, 'Bloqué': 2, 'Clôturé': 3 })[t.status] || 9,
    priority: t => ({ 'Urgente': 1, 'Haute': 2, 'Normale': 3, 'Basse': 4 })[t.priority] || 9,
    title:    t => (t.title || '').toLowerCase(),
    category: t => (t.category || '￿').toLowerCase(),
    client:   t => (t.cabinet_name || '￿').toLowerCase(),
    owner:    t => (t.owner_name || (t.assigned_names ? t.assigned_names.split(',')[0] : '') || '￿').toLowerCase(),
    age:      t => { const d = parseDbDate(t.created_at); return d ? d.getTime() : 0; },
};
let currentSort = { key: 'priority', dir: 'asc' };

function ticketMatchesSearch(t, q) {
    if (!q) return true;
    q = q.trim().toLowerCase();
    if (!q) return true;
    return (t.title || '').toLowerCase().includes(q)
        || (t.description || '').toLowerCase().includes(q)
        || (t.cabinet_name || '').toLowerCase().includes(q)
        || ('#' + t.id) === q;
}

function ticketMatchesCategory(t) {
    if (!currentCategory) return true;
    if (currentCategory === 'none') return !t.category;
    return t.category === currentCategory;
}

function ticketMatchesTab(t) {
    const assignees = t.assigned_ids ? t.assigned_ids.split(',') : [];
    if (currentFilter === 'all')        return true;
    if (currentFilter === 'mine')       return assignees.includes(String(window.currentUserId)) && t.status !== 'Clôturé';
    if (currentFilter === 'open')       return t.status === 'Ouvert';
    if (currentFilter === 'waiting')    return t.status === 'Bloqué';
    if (currentFilter === 'unassigned') return assignees.length === 0 && t.status !== 'Clôturé';
    if (currentFilter === 'closed')     return t.status === 'Clôturé';
    return true;
}

// Source unique de vérité pour "les tickets actuellement affichés, triés".
// Réutilisée par le rendu, la navigation ⇅ du tiroir et le polling.
function getFilteredSortedTickets() {
    const accessor = SORT_ACCESSORS[currentSort.key] || SORT_ACCESSORS.priority;
    const ageOf = SORT_ACCESSORS.age;
    const dir = currentSort.dir === 'desc' ? -1 : 1;
    return allTickets
        .filter(t => ticketMatchesSearch(t, currentSearch) && ticketMatchesCategory(t) && ticketMatchesTab(t))
        .sort((a, b) => {
            const av = accessor(a), bv = accessor(b);
            if (av < bv) return -1 * dir;
            if (av > bv) return  1 * dir;
            // Tri secondaire stable : à valeur égale, le plus récent d'abord.
            return ageOf(b) - ageOf(a);
        });
}

function renderTicketList(opts = {}) {
    const list = document.getElementById('tickets-list');
    if (!list) return;
    const wrapper = document.querySelector('.tickets-table-wrapper');
    const prevScroll = wrapper ? wrapper.scrollTop : 0;

    const filtered = getFilteredSortedTickets();

    if (!filtered.length) {
        list.innerHTML = `
            <tr><td colspan="8" class="tickets-list-empty">
                <i class="fas fa-inbox fa-2x"></i>
                ${currentSearch || currentCategory ? 'Aucun ticket ne correspond à ces filtres.' : 'Aucune demande dans cette vue.'}
            </td></tr>`;
        renderPagination(0, 0);
        updateNavButtonsState();
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * PER_PAGE;
    const pageItems = filtered.slice(start, start + PER_PAGE);
    list.innerHTML = pageItems.map(t => generateTicketRow(t)).join('');

    if (wrapper) wrapper.scrollTop = opts.keepScroll ? prevScroll : 0;

    renderPagination(totalPages, filtered.length);
    updateNavButtonsState();
    syncSelectionUI();
}

/* ══════════════ SÉLECTION MULTIPLE / ACTIONS GROUPÉES ══════════════ */

window.toggleRowSelect = function(id, checked) {
    id = String(id);
    if (checked) selectedIds.add(id); else selectedIds.delete(id);
    const tr = document.querySelector(`#tickets-list tr[data-id="${id}"]`);
    if (tr) tr.classList.toggle('is-selected', checked);
    syncSelectAllCheckbox();
    updateBulkBar();
};

window.toggleSelectAll = function(checked) {
    document.querySelectorAll('#tickets-list tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        if (checked) selectedIds.add(id); else selectedIds.delete(id);
        const cb = tr.querySelector('.row-check');
        if (cb) cb.checked = checked;
        tr.classList.toggle('is-selected', checked);
    });
    updateBulkBar();
};

function syncSelectAllCheckbox() {
    const sa = document.getElementById('select-all-tickets');
    if (!sa) return;
    const boxes = [...document.querySelectorAll('#tickets-list .row-check')];
    const checked = boxes.filter(b => b.checked).length;
    sa.checked = boxes.length > 0 && checked === boxes.length;
    sa.indeterminate = checked > 0 && checked < boxes.length;
}

function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    const n = selectedIds.size;
    const label = document.getElementById('bulk-count');
    if (label) label.textContent = `${n} sélectionné${n > 1 ? 's' : ''}`;
    bar.classList.toggle('open', n > 0);
}

// Appelé après chaque rendu de liste : purge les ids disparus, resynchronise l'UI.
function syncSelectionUI() {
    const known = new Set(allTickets.map(t => String(t.id)));
    for (const id of [...selectedIds]) if (!known.has(id)) selectedIds.delete(id);
    syncSelectAllCheckbox();
    updateBulkBar();
}

window.bulkClearSelection = function() {
    selectedIds.clear();
    document.querySelectorAll('#tickets-list .row-check').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('#tickets-list tr.is-selected').forEach(tr => tr.classList.remove('is-selected'));
    syncSelectAllCheckbox();
    updateBulkBar();
};

window.bulkSetOwner = async function(v) {
    if (!v || !selectedIds.size) return;
    const ownerId = v === '__none__' ? null : v;
    const who = ownerId ? (userNameById(ownerId) || 'ce responsable') : 'aucun responsable';
    await bulkApply({ owner_id: ownerId }, `Responsable : ${who}`);
};

window.bulkSetStatus = async function(v) {
    if (!v || !selectedIds.size) return;
    if (v === 'Clôturé') {
        document.getElementById('bulk-closing-count').textContent = selectedIds.size;
        document.getElementById('bulk-closing-text').value = '';
        document.getElementById('bulk-closing-modal').classList.add('active');
        setTimeout(() => document.getElementById('bulk-closing-text').focus(), 50);
        return;
    }
    await bulkApply({ status: v }, `Statut : ${v}`);
};

window.confirmBulkClose = async function() {
    const note = document.getElementById('bulk-closing-text').value.trim();
    if (!note) {
        if (window.toast) toast.error('Note requise', 'Décrivez comment ces tickets ont été résolus.');
        return;
    }
    closeModal('bulk-closing-modal');
    await bulkApply({ status: 'Clôturé', closing_note: note }, 'Clôture groupée');
};

// Applique un patch (owner_id / status / …) à tous les tickets sélectionnés.
// Le PUT du serveur exige l'objet ticket complet → on le reconstruit depuis
// l'entrée locale (la liste porte t.* : title, description, FK, etc.).
async function bulkApply(patch, label) {
    const ids = [...selectedIds];
    if (!ids.length) return;

    const bar = document.getElementById('bulk-bar');
    const spinner = document.getElementById('bulk-spinner');
    bar?.classList.add('is-busy');
    if (spinner) spinner.style.display = '';

    const results = await Promise.allSettled(ids.map(id => {
        const t = allTickets.find(x => String(x.id) === String(id));
        if (!t) return Promise.reject(new Error('introuvable'));
        const body = {
            title:          t.title,
            description:    t.description,
            status:         t.status,
            priority:       t.priority || 'Normale',
            category:       t.category || null,
            owner_id:       t.owner_id || null,
            client_id:      t.client_id || null,
            equipment_id:   t.equipment_id || null,
            blocked_reason: t.blocked_reason || null,
            assigned_to:    t.assigned_ids ? t.assigned_ids.split(',').map(Number).filter(Boolean) : [],
            ...patch,
        };
        return fetch(`/api/tickets/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }).then(r => {
            if (r.ok) return;
            return r.json().catch(() => ({})).then(e => Promise.reject(new Error(e.error || ('HTTP ' + r.status))));
        });
    }));

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const fail = results.length - ok;

    bar?.classList.remove('is-busy');
    if (spinner) spinner.style.display = 'none';
    selectedIds.clear();

    await loadTickets();                       // refresh complet : noms/ordre garantis
    if (currentTicketId && document.getElementById('tickets-detail-drawer').classList.contains('open')) {
        selectTicket(currentTicketId);         // resynchronise le tiroir si le ticket ouvert était dans le lot
    }

    if (window.toast) {
        if (fail === 0) toast.success('Action groupée', `${label} — ${ok} ticket${ok > 1 ? 's' : ''} mis à jour.`);
        else if (ok === 0) toast.error('Action groupée', `Échec sur les ${fail} tickets.`);
        else toast.warning?.('Action groupée partielle', `${ok} réussi(s), ${fail} en échec.`)
            || toast.error('Action groupée partielle', `${ok} réussi(s), ${fail} en échec.`);
    }
}

// Remplace UNE ligne du tableau sans re-rendre toute la liste (feedback optimiste).
function renderSingleRow(id) {
    const row = document.querySelector(`#tickets-list tr[data-id="${id}"]`);
    const t = allTickets.find(x => String(x.id) === String(id));
    if (!row || !t) return;
    // Si le ticket ne passe plus le filtre courant, on retombe sur un rendu complet.
    if (!(ticketMatchesSearch(t, currentSearch) && ticketMatchesCategory(t) && ticketMatchesTab(t))) {
        renderTicketList({ keepScroll: true });
        return;
    }
    const tmp = document.createElement('tbody');
    tmp.innerHTML = generateTicketRow(t);
    const fresh = tmp.firstElementChild;
    row.replaceWith(fresh);
    fresh.classList.add('row-flash');
    setTimeout(() => fresh.classList.remove('row-flash'), 1000);
}

// Applique localement les champs modifiés à l'entrée de allTickets (évite un
// rechargement complet après une modification faite dans le tiroir).
function patchLocalTicket(id, patch) {
    const t = allTickets.find(x => String(x.id) === String(id));
    if (!t) return;
    Object.assign(t, patch);
}

function userNameById(uid) {
    if (!uid) return null;
    const u = allUsersList.find(x => String(x.id) === String(uid));
    return u ? u.name : null;
}

function clientNameFromViewSelect(clientId) {
    if (!clientId) return null;
    const opt = document.querySelector(`#v-client option[value="${clientId}"]`);
    if (!opt) return null;
    return opt.textContent.replace(/\s+-\s+[^-]*$/, '').trim();
}

function renderPagination(totalPages, totalCount) {
    const container = document.getElementById('ticket-pagination');
    if (!container) return;
    if (!totalCount) { container.innerHTML = ''; return; }

    const from = (currentPage - 1) * PER_PAGE + 1;
    const to = Math.min(currentPage * PER_PAGE, totalCount);
    const info = `<span class="pg-info">${from}–${to} sur ${totalCount}</span>`;

    if (totalPages <= 1) { container.innerHTML = info; return; }

    let html = info + `<button class="pg-btn" onclick="changeTicketPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} aria-label="Page précédente"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="pg-btn ${i === currentPage ? 'active' : ''}" onclick="changeTicketPage(${i})">${i}</button>`;
    }
    html += `<button class="pg-btn" onclick="changeTicketPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Page suivante"><i class="fas fa-chevron-right"></i></button>`;
    container.innerHTML = html;
}

window.changeTicketPage = function(page) {
    currentPage = page;
    renderTicketList();
};

function generateTicketRow(t) {
    const prio     = t.priority || 'Normale';
    const pCfg     = PRIORITY_CONFIG[prio] || PRIORITY_CONFIG['Normale'];
    const stDot    = STATUS_DOT_CLASS[t.status] || 'st-open';
    const rowPrio  = PRIORITY_ROW_CLASS[prio] || '';
    const isActive = String(t.id) === String(currentTicketId);
    const isUnread = !!t.has_unread;
    const isSelected = selectedIds.has(String(t.id));

    let ageCls = '';
    if (t.status !== 'Clôturé') {
        const d = ageDays(t.created_at);
        if (d >= 3) ageCls = 'age-danger';
        else if (d >= 1) ageCls = 'age-warn';
    }

    const primaryName = t.owner_name || (t.assigned_names ? t.assigned_names.split(',')[0] : null);
    const ownerHtml = primaryName
        ? `<span class="avatar-chip" title="${escapeHtml(t.owner_name ? 'Responsable : ' + t.owner_name : t.assigned_names)}">${escapeHtml(getInitials(primaryName))}</span>${escapeHtml(primaryName)}`
        : `<span class="unassigned-chip">Non assigné</span>`;

    return `
<tr class="ticket-row ${rowPrio} ${isActive ? 'active' : ''} ${isUnread ? 'is-unread' : ''} ${isSelected ? 'is-selected' : ''}"
    data-id="${t.id}" tabindex="0" role="button"
    onclick="selectTicket(${t.id})" onkeydown="if(event.key==='Enter')selectTicket(${t.id})">
    <td class="col-check" onclick="event.stopPropagation()">
        <input type="checkbox" class="row-check" ${isSelected ? 'checked' : ''}
            aria-label="Sélectionner le ticket #${t.id}"
            onchange="toggleRowSelect('${t.id}', this.checked)">
    </td>
    <td class="col-status">
        <span class="status-badge ${stDot}"><span class="status-dot ${stDot}"></span>${escapeHtml(t.status)}</span>${t.status === 'Bloqué' && t.blocked_reason ? `<span class="blocked-reason-chip">${escapeHtml(t.blocked_reason)}</span>` : ''}
    </td>
    <td class="col-priority"><span class="priority-badge" style="background:${pCfg.bg};color:${pCfg.color};">${pCfg.icon} ${prio}</span></td>
    <td class="col-title">
        <div class="ticket-title-cell">
            <span class="ticket-id-chip">#${t.id}</span>
            ${isUnread ? '<span class="unread-dot" title="Non lu"></span>' : ''}
            <span class="ticket-title-text">${escapeHtml(t.title)}</span>
        </div>
    </td>
    <td class="col-category">${t.category ? `<span class="category-chip">${escapeHtml(t.category)}</span>` : '—'}</td>
    <td class="col-client">${t.cabinet_name ? escapeHtml(t.cabinet_name) : '—'}</td>
    <td class="col-owner"><span class="owner-cell">${ownerHtml}</span></td>
    <td class="col-age age-cell ${ageCls}">${timeAgo(t.created_at)}</td>
</tr>`;
}

function setupSortableHeaders() {
    document.querySelectorAll('.tickets-table th[data-sort]').forEach(th => {
        const activate = () => {
            const key = th.dataset.sort;
            if (currentSort.key === key) currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
            else { currentSort.key = key; currentSort.dir = 'asc'; }
            currentPage = 1;
            updateSortIndicators();
            renderTicketList();
        };
        th.addEventListener('click', activate);
        th.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        });
    });
    updateSortIndicators();
}

function updateSortIndicators() {
    document.querySelectorAll('.tickets-table th[data-sort]').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        const isActive = th.dataset.sort === currentSort.key;
        th.classList.toggle('sorted', isActive);
        th.setAttribute('aria-sort', isActive ? (currentSort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
        if (icon) icon.className = 'fas sort-icon ' + (isActive ? (currentSort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort');
    });
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function setupListKeyboardNav() {
    const list = document.getElementById('tickets-list');
    list.addEventListener('keydown', (e) => {
        const activeRow = document.activeElement?.classList?.contains('ticket-row') ? document.activeElement : null;

        // Espace sur une ligne focalisée → coche / décoche (sélection multiple).
        if (e.key === ' ' && activeRow) {
            e.preventDefault();
            const cb = activeRow.querySelector('.row-check');
            if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); }
            return;
        }

        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const rows = Array.from(list.querySelectorAll('.ticket-row'));
        if (!rows.length) return;
        const idx = rows.indexOf(document.activeElement);
        e.preventDefault();
        if (e.key === 'ArrowDown') (rows[idx + 1] || rows[0]).focus();
        else (rows[idx - 1] || rows[rows.length - 1]).focus();
    });
}

async function populateSelects() {
    try {
        const [resUsers, resClients, resCategories] = await Promise.all([
            fetch('/api/admin/users'), fetch('/api/clients'), fetch('/api/admin/ticket-categories')
        ]);
        if (!resUsers.ok || !resClients.ok || !resCategories.ok) throw new Error('Réponse non OK');
        // Coercition défensive : sur session expirée l'API renvoie un objet
        // d'erreur, pas un tableau → on évite un "x.filter is not a function".
        const users = await resUsers.json();
        allUsersList = Array.isArray(users) ? users : [];
        const clientsData = await resClients.json();
        const clientsArray = Array.isArray(clientsData.clients) ? clientsData.clients : [];
        const categoriesRaw = await resCategories.json();
        const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

        const userOptions = users.filter(u => u.is_active).map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
        const ownerOptions = '<option value="">-- Aucun --</option>' + userOptions;
        const clientOptions = '<option value="">-- Aucun Client --</option>' + clientsArray.map(c => `<option value="${c.id}">${escapeHtml(c.cabinet_name)} - ${escapeHtml(c.city)}</option>`).join('');
        const categoryOptions = categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');

        if (slimClient) slimClient.destroy();
        if (slimClientView) slimClientView.destroy();
        if (slimAssignedNew) slimAssignedNew.destroy();
        if (slimAssignedView) slimAssignedView.destroy();

        document.getElementById('t-client').innerHTML = clientOptions;
        document.getElementById('v-client').innerHTML = clientOptions;
        document.getElementById('t-assigned').innerHTML = userOptions;
        document.getElementById('v-assigned').innerHTML = userOptions;
        document.getElementById('t-owner').innerHTML = ownerOptions;
        document.getElementById('v-owner').innerHTML = ownerOptions;
        const bulkOwner = document.getElementById('bulk-owner');
        if (bulkOwner) bulkOwner.innerHTML =
            '<option value="">— Choisir —</option><option value="__none__">— Aucun (retirer) —</option>' + userOptions;
        document.getElementById('t-category').innerHTML = '<option value="">-- Aucune --</option>' + categoryOptions;
        document.getElementById('v-category').innerHTML = '<option value="">Aucune</option>' + categoryOptions;
        document.getElementById('category-filter').innerHTML =
            '<option value="">Toutes catégories</option>' + categoryOptions + '<option value="none">Sans catégorie</option>';

        slimClient = new SlimSelect({
            select: '#t-client',
            settings: { placeholderText: 'Rechercher un client...' },
            events: { afterChange: (newVal) => loadEquipmentForClient(newVal[0]?.value || '', 't-equip') }
        });

        slimClientView = new SlimSelect({
            select: '#v-client',
            settings: { placeholderText: 'Lier à un client...' },
            events: {
                afterChange: (newVal) => {
                    if (!isModalLoading) loadEquipmentForClient(newVal[0]?.value || '', 'v-equip');
                }
            }
        });
        slimAssignedNew  = new SlimSelect({ select: '#t-assigned', settings: { placeholderText: 'Assigner à...', closeOnSelect: false } });
        slimAssignedView = new SlimSelect({ select: '#v-assigned', settings: { placeholderText: 'Assigner à...', closeOnSelect: false } });
    } catch (e) {
        console.error(e);
        if (window.toast) toast.error('Chargement partiel', 'Les listes (clients, utilisateurs, catégories) n\'ont pas pu être chargées.');
    }
}

async function loadEquipmentForClient(clientId, selectId) {
    isLoadingEquipment = true;
    const select = document.getElementById(selectId);
    if (!clientId) {
        select.innerHTML = '<option value="">-- Choisir client d\'abord --</option>';
        isLoadingEquipment = false;
        return;
    }
    try {
        const res  = await fetch(`/api/clients/${clientId}/equipment`);
        const list = await res.json();
        select.innerHTML = '<option value="">-- Machine concernée --</option>' +
            list.map(e => `<option value="${e.id}">${e.brand} ${e.eq_name || e.name} (${e.serial_number})</option>`).join('');

        if (selectId === 'v-equip') {
            if (window.slimEquipView) { try { window.slimEquipView.destroy(); } catch {} }
            window.slimEquipView = new SlimSelect({ select: '#v-equip', settings: { placeholderText: 'Rechercher une machine...' } });
        }
    } catch (e) { console.error(e); }
    finally { isLoadingEquipment = false; }
}

function openNewTicketModal() {
    document.getElementById('ticket-form').reset();
    document.getElementById('t-category').value = '';
    document.getElementById('t-owner').value = '';
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
        description:  desc,
        priority:     document.getElementById('t-priority').value || 'Normale',
        category:     document.getElementById('t-category').value || null,
        owner_id:     document.getElementById('t-owner').value    || null,
        client_id:    document.getElementById('t-client').value   || null,
        equipment_id: document.getElementById('t-equip').value    || null,
        assigned_to:  slimAssignedNew.getSelected(),
    };

    try {
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            closeModal('new-ticket-modal');
            await loadTickets();
            if (window.toast) toast.success('Ticket créé', title);
        } else {
            const err = await res.json().catch(() => ({}));
            if (window.toast) toast.error('Erreur', err.error || 'Impossible de créer le ticket.');
        }
    } catch (e) {
        console.error(e);
        if (window.toast) toast.error('Erreur réseau', 'Le ticket n\'a pas pu être créé.');
    }
}

async function selectTicket(id) {
    const drawer = document.getElementById('tickets-detail-drawer');
    const wasOpen = drawer.classList.contains('open');
    if (!wasOpen) lastFocusBeforeDrawer = document.activeElement;

    isModalLoading = true;
    currentTicketId = id;

    drawer.classList.add('open', 'is-loading');
    document.getElementById('drawer-backdrop').classList.add('open');

    let t;
    try {
        const res = await fetch(`/api/tickets/${id}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        t = await res.json();
    } catch (e) {
        console.error(e);
        drawer.classList.remove('is-loading');
        isModalLoading = false;
        if (window.toast) toast.error('Erreur', 'Impossible d\'ouvrir ce ticket.');
        if (!wasOpen) closeDrawer();
        return;
    }

    document.getElementById('current-ticket-id').value = t.id;

    document.getElementById('v-id-badge').textContent = `#${t.id}`;
    document.getElementById('v-title').innerText = t.title;
    updateNavButtonsState();

    document.getElementById('v-status').value   = t.status;
    document.getElementById('v-priority').value = t.priority || 'Normale';
    document.getElementById('v-category').value = t.category || '';
    document.getElementById('v-owner').value    = t.owner_id || '';
    document.getElementById('v-blocked-reason').value = t.blocked_reason || '';
    document.getElementById('v-reason-field').style.display = t.status === 'Bloqué' ? 'flex' : 'none';

    slimClientView.setSelected(t.client_id ? String(t.client_id) : '');
    slimAssignedView.setSelected(t.assigned_to ? t.assigned_to.map(String) : []);

    await loadEquipmentForClient(t.client_id, 'v-equip');
    if (t.equipment_id && window.slimEquipView) window.slimEquipView.setSelected(String(t.equipment_id));
    else if (window.slimEquipView) window.slimEquipView.setSelected('');

    document.getElementById('v-meta').textContent =
        `Créé par ${t.creator_name || '—'} le ${parseDbDate(t.created_at).toLocaleString('fr-CH')} (${timeAgo(t.created_at)})`;
    document.getElementById('v-desc').innerText = t.description;

    document.getElementById('v-edit-title').value = t.title;
    document.getElementById('v-edit-desc').value  = t.description;
    document.getElementById('v-edit-zone').style.display = 'none';

    renderComments(t.comments || []);
    loadTicketClientHistory(t.client_id);
    renderLinkedReports(t.linked_reports || []);
    loadReportOptionsForTicket(t.client_id, t.linked_reports || []);

    // Marque comme lu + retire le point "non lu" localement sans recharger toute la liste
    fetch(`/api/tickets/${id}/read`, { method: 'POST' }).catch(() => {});
    const row = document.querySelector(`.ticket-row[data-id="${id}"]`);
    document.querySelectorAll('.ticket-row.active').forEach(r => r.classList.remove('active'));
    if (row) { row.classList.add('active'); row.classList.remove('is-unread'); row.querySelector('.unread-dot')?.remove(); }
    const cached = allTickets.find(x => String(x.id) === String(id));
    if (cached) cached.has_unread = false;

    document.getElementById('tickets-detail-drawer').classList.remove('is-loading');
    // Déplace le focus dans le tiroir (accessibilité) sans voler le focus si
    // l'utilisateur est déjà en train d'écrire dans un champ du tiroir.
    if (!document.getElementById('detail-content').contains(document.activeElement)) {
        document.querySelector('.detail-header .icon-btn')?.focus();
    }

    scrollChatToBottom();
    setTimeout(() => { isModalLoading = false; }, 100);
}

// Rafraîchit UNIQUEMENT le fil (titre, méta, description, commentaires) du ticket
// déjà ouvert — sans reconstruire les SlimSelect ni recharger machines/historique.
async function refreshOpenTicket(id, { reports = false } = {}) {
    const drawer = document.getElementById('tickets-detail-drawer');
    if (!drawer.classList.contains('open')) return;
    if (String(id) !== String(currentTicketId)) return;
    try {
        const res = await fetch(`/api/tickets/${id}`);
        if (!res.ok) return;
        const t = await res.json();
        if (String(id) !== String(currentTicketId)) return; // l'utilisateur a changé de ticket entre-temps

        document.getElementById('v-title').innerText = t.title;
        document.getElementById('v-id-badge').textContent = `#${t.id}`;
        document.getElementById('v-meta').textContent =
            `Créé par ${t.creator_name || '—'} le ${parseDbDate(t.created_at).toLocaleString('fr-CH')} (${timeAgo(t.created_at)})`;
        if (document.getElementById('v-edit-zone').style.display === 'none') {
            document.getElementById('v-desc').innerText = t.description;
        }

        // Préserve la position de lecture : ne recolle en bas que si l'utilisateur
        // y était déjà (nouveau message), sinon on restaure son scroll.
        const scroller = document.querySelector('.detail-scroll');
        const prevTop = scroller ? scroller.scrollTop : 0;
        const atBottom = scroller && (scroller.scrollHeight - prevTop - scroller.clientHeight < 80);
        renderComments(t.comments || []);
        if (scroller) scroller.scrollTop = atBottom ? scroller.scrollHeight : prevTop;

        if (reports) {
            renderLinkedReports(t.linked_reports || []);
            loadReportOptionsForTicket(t.client_id, t.linked_reports || []);
        }
    } catch (e) { /* silencieux */ }
}

function renderComments(comments) {
    const commentsDiv = document.getElementById('v-comments');
    commentsDiv.innerHTML = comments.length
        ? comments.map(c => {
            const dt = parseDbDate(c.created_at).toLocaleString('fr-CH');

            if (c.is_system === 1) return `
    <div class="comment-system">
        <i class="fas fa-history"></i>
        <span><strong>${escapeHtml(c.user_name)}</strong> ${escapeHtml(c.comment)}</span>
        <span style="margin-left:auto;white-space:nowrap;opacity:0.6;font-size:10px;">${dt}</span>
    </div>`;

            const isMe = (c.user_id === window.currentUserId);
            const bubbleCls = isMe ? 'chat-bubble chat-bubble-me' : 'chat-bubble chat-bubble-other';

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
        : `<div style="color:var(--text-tertiary);font-size:var(--text-sm);text-align:center;padding:30px;font-style:italic;">Commencez la discussion...</div>`;
}

const HISTORY_CFG = {
    rdv:     { icon: 'fa-calendar-check',      color: '#3b82f6' },
    rapport: { icon: 'fa-file-alt',             color: '#10b981' },
    ticket:  { icon: 'fa-ticket-alt',           color: '#f59e0b' },
    rma:     { icon: 'fa-tools',                color: '#8b5cf6' },
    pret:    { icon: 'fa-hand-holding-medical', color: '#06b6d4' },
};
const HISTORY_STATUS_MAP = {
    draft:      { label: 'Brouillon',  bg: '#f1f5f9', color: '#64748b' },
    pending:    { label: 'En attente', bg: '#fef3c7', color: '#d97706' },
    validated:  { label: 'Validé',     bg: '#f0fdf4', color: '#16a34a' },
    archived:   { label: 'Archivé',    bg: '#f5f3ff', color: '#7c3aed' },
    'Ouvert':   { label: 'Ouvert',     bg: '#fef3c7', color: '#d97706' },
    'Clôturé':  { label: 'Clôturé',    bg: '#f0fdf4', color: '#16a34a' },
    'En cours': { label: 'En cours',   bg: '#e0f2fe', color: '#0284c7' },
    'Retourné': { label: 'Retourné',   bg: '#f0fdf4', color: '#16a34a' },
    'En retard':{ label: 'En retard',  bg: '#fef2f2', color: '#dc2626' },
};

window.openHistoryItem = function(type, linkId) {
    const map = {
        rapport: `/report-view.html?id=${linkId}`,
        ticket:  `/tickets.html?open=${linkId}`,
        rma:     `/rmas.html?open=${linkId}`,
        pret:    `/loans.html?open=${linkId}`,
    };
    const url = map[type];
    if (!url) return;
    if (type === 'rapport') window.open(url, '_blank');
    else window.location.href = url;
};

function renderLinkedReports(reports) {
    const list = document.getElementById('v-linked-reports-list');
    if (!reports.length) {
        list.innerHTML = '<div class="linked-report-empty">Aucun rapport lié.</div>';
        return;
    }
    list.innerHTML = reports.map((r) => `
        <div class="linked-report-item">
            <span class="lr-desc" onclick="openHistoryItem('rapport', ${r.id})" title="Ouvrir le rapport">
                ${escapeHtml(r.report_number || ('#' + r.id))} — ${escapeHtml(r.work_type || '')}
            </span>
            <span class="lr-meta">${formatShortDate(r.created_at)}</span>
            <button type="button" class="icon-btn" onclick="removeLinkedReport(${r.id})" title="Retirer" aria-label="Retirer ce rapport">
                <i class="fas fa-times"></i>
            </button>
        </div>`).join('');
}

async function loadReportOptionsForTicket(clientId, linkedReports) {
    const select = document.getElementById('v-add-report-select');
    if (!clientId) {
        select.innerHTML = '<option value="">-- Lier un client d\'abord --</option>';
        select.disabled = true;
        return;
    }
    select.disabled = false;
    try {
        const res = await fetch(`/api/reports?client_id=${clientId}&limit=200`);
        const data = await res.json();
        const linkedIds = new Set((linkedReports || []).map((r) => String(r.id)));
        const options = (data.reports || [])
            .filter((r) => !linkedIds.has(String(r.id)))
            .map((r) => `<option value="${r.id}">${escapeHtml(r.report_number || ('#' + r.id))} — ${escapeHtml(r.work_type || '')} (${formatShortDate(r.created_at)})</option>`)
            .join('');
        select.innerHTML = '<option value="">-- Ajouter un rapport --</option>' + options;
    } catch (e) {
        select.innerHTML = '<option value="">Erreur de chargement</option>';
    }
}

function previewSelectedReport() {
    const reportId = document.getElementById('v-add-report-select').value;
    if (!reportId) {
        if (window.toast) toast.error('Aucun rapport sélectionné', 'Choisissez d\'abord un rapport dans la liste.');
        return;
    }
    openHistoryItem('rapport', reportId);
}

async function addLinkedReport() {
    const select = document.getElementById('v-add-report-select');
    const reportId = select.value;
    if (!reportId) return;
    const id = document.getElementById('current-ticket-id').value;
    try {
        const res = await fetch(`/api/tickets/${id}/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report_id: reportId })
        });
        if (!res.ok) throw new Error();
        await refreshOpenTicket(id, { reports: true });
    } catch { if (window.toast) toast.error('Erreur', "Impossible d'ajouter ce rapport."); }
}

async function removeLinkedReport(reportId) {
    const id = document.getElementById('current-ticket-id').value;
    try {
        const res = await fetch(`/api/tickets/${id}/reports/${reportId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        await refreshOpenTicket(id, { reports: true });
    } catch { if (window.toast) toast.error('Erreur', 'Impossible de retirer ce rapport.'); }
}

async function loadTicketClientHistory(clientId) {
    const body = document.getElementById('v-history-body');
    document.getElementById('v-history-section').classList.remove('history-open');

    if (!clientId) {
        body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;font-style:italic;">Aucun client lié à ce ticket.</div>';
        return;
    }

    body.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-tertiary);"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const res  = await fetch(`/api/clients/${clientId}/history`);
        const list = await res.json();
        const currentId = document.getElementById('current-ticket-id').value;
        const items = list
            .filter(it => !(it.type === 'ticket' && String(it.link_id) === String(currentId)))
            .slice(0, 8);

        if (!items.length) {
            body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;font-style:italic;">Aucun historique pour ce client.</div>';
            return;
        }

        body.innerHTML = items.map(it => {
            const c  = HISTORY_CFG[it.type] || HISTORY_CFG.rdv;
            const sc = it.status ? HISTORY_STATUS_MAP[it.status] : null;
            return `
                <div class="history-item" onclick="openHistoryItem('${it.type}', ${it.link_id})">
                    <div class="history-icon" style="background:${c.color}20;color:${c.color};"><i class="fas ${c.icon}"></i></div>
                    <div style="flex:1;min-width:0;">
                        <div class="history-item-desc">${escapeHtml(it.description || '—')}</div>
                        <div class="history-item-meta">
                            ${it.ref ? '#' + escapeHtml(String(it.ref)) + ' · ' : ''}${formatShortDate(it.date)}
                            ${sc ? `<span style="margin-left:6px;padding:1px 5px;border-radius:2px;background:${sc.bg};color:${sc.color};font-weight:700;">${sc.label}</span>` : ''}
                        </div>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        body.innerHTML = '<div style="color:var(--color-danger);font-size:12px;">Erreur de chargement.</div>';
    }
}

function toggleHistorySection() {
    document.getElementById('v-history-section').classList.toggle('history-open');
}

function closeDrawer() {
    document.getElementById('tickets-detail-drawer').classList.remove('open', 'is-loading');
    document.getElementById('drawer-backdrop').classList.remove('open');
    // Rend le focus à l'élément qui a ouvert le tiroir (accessibilité clavier).
    if (lastFocusBeforeDrawer && document.contains(lastFocusBeforeDrawer)) {
        try { lastFocusBeforeDrawer.focus(); } catch {}
    }
    lastFocusBeforeDrawer = null;
}

function getVisibleTicketIds() {
    return Array.from(document.querySelectorAll('#tickets-list tr[data-id]')).map(tr => tr.dataset.id);
}

function navigateTicket(delta) {
    const ids = getVisibleTicketIds();
    const idx = ids.indexOf(String(currentTicketId));

    // Cas simple : le ticket voisin est sur la page affichée.
    if (idx !== -1) {
        const nextIdx = idx + delta;
        if (nextIdx >= 0 && nextIdx < ids.length) { selectTicket(ids[nextIdx]); return; }
    }

    // Sinon on franchit la limite de page : on se replace sur la bonne page.
    const all = getFilteredSortedTickets();
    const gIdx = all.findIndex(t => String(t.id) === String(currentTicketId));
    if (gIdx === -1) return;
    const target = all[gIdx + delta];
    if (!target) return;
    currentPage = Math.floor((gIdx + delta) / PER_PAGE) + 1;
    renderTicketList();
    selectTicket(target.id);
}

function updateNavButtonsState() {
    const ids = getVisibleTicketIds();
    const idx = ids.indexOf(String(currentTicketId));
    const prevBtn = document.getElementById('v-nav-prev');
    const nextBtn = document.getElementById('v-nav-next');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx === -1 || idx >= ids.length - 1;
}

async function updateTicketData(extra = {}) {
    if (isModalLoading || isLoadingEquipment) return;

    const id = document.getElementById('current-ticket-id').value;
    const assignees = slimAssignedView.getSelected().filter(Boolean); // ignore l'option vide
    const data = {
        status:         document.getElementById('v-status').value,
        priority:       document.getElementById('v-priority')?.value || 'Normale',
        category:       document.getElementById('v-category')?.value || null,
        owner_id:       document.getElementById('v-owner')?.value    || null,
        blocked_reason: document.getElementById('v-blocked-reason')?.value || null,
        client_id:      document.getElementById('v-client').value    || null,
        equipment_id:   document.getElementById('v-equip').value     || null,
        assigned_to:    assignees,
        ...extra,
    };

    let response;
    try {
        response = await fetch(`/api/tickets/${id}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data)
        });
    } catch {
        if (window.toast) toast.error('Erreur réseau', 'La modification n\'a pas pu être envoyée.');
        await selectTicket(id);
        return;
    }

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (window.toast) toast.error('Erreur', err.error || 'Impossible de mettre à jour le ticket.');
        await selectTicket(id); // resynchronise l'affichage avec l'état réel du ticket
        return;
    }

    // Succès : on met à jour la ligne concernée EN LOCAL (pas de rechargement de
    // toute la liste, pas de reconstruction des SlimSelect du tiroir).
    const t = allTickets.find(x => String(x.id) === String(id));
    if (t) {
        const ownerId = toIntOrNull(data.owner_id);
        const names = assignees.map(uid => userNameById(uid)).filter(Boolean);
        patchLocalTicket(id, {
            status:         data.status,
            priority:       data.priority,
            category:       data.category || null,
            blocked_reason: data.status === 'Bloqué' ? (data.blocked_reason || null) : null,
            owner_id:       ownerId,
            owner_name:     userNameById(ownerId),
            client_id:      toIntOrNull(data.client_id),
            cabinet_name:   data.client_id ? (clientNameFromViewSelect(data.client_id) || t.cabinet_name) : null,
            equipment_id:   toIntOrNull(data.equipment_id),
            assigned_ids:   assignees.join(',') || null,
            assigned_names: names.join(', ') || null,
        });
        renderSingleRow(id);
        recomputeTabCounts();
        updateNavButtonsState();
    }

    // Le serveur ajoute un commentaire système ("a changé la priorité…", note de
    // clôture…) : on rafraîchit juste le fil du tiroir pour le voir apparaître.
    refreshOpenTicket(id);
}

function toIntOrNull(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
}

function onStatusChange() {
    const newStatus = document.getElementById('v-status').value;
    document.getElementById('v-reason-field').style.display = newStatus === 'Bloqué' ? 'flex' : 'none';

    if (newStatus === 'Clôturé') {
        document.getElementById('closing-note-text').value = '';
        document.getElementById('closing-note-modal').classList.add('active');
        setTimeout(() => document.getElementById('closing-note-text').focus(), 50);
        return;
    }
    updateTicketData();
}

function cancelClosing() {
    closeModal('closing-note-modal');
    const id = document.getElementById('current-ticket-id').value;
    const cached = allTickets.find((x) => String(x.id) === String(id));
    const prevStatus = cached ? cached.status : 'Ouvert';
    document.getElementById('v-status').value = prevStatus;
    document.getElementById('v-reason-field').style.display = prevStatus === 'Bloqué' ? 'flex' : 'none';
}

async function confirmClosing() {
    const note = document.getElementById('closing-note-text').value.trim();
    if (!note) {
        if (window.toast) toast.error('Note requise', 'Merci de décrire comment le ticket a été résolu.');
        return;
    }
    closeModal('closing-note-modal');
    await updateTicketData({ closing_note: note });
}

async function claimTicket() {
    document.getElementById('v-owner').value = String(window.currentUserId);
    await updateTicketData();
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

    const sendBtn = document.querySelector('#comment-form button[type="submit"]');
    if (sendBtn) sendBtn.disabled = true;
    try {
        const res = await fetch(`/api/tickets/${id}/comments`, { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Envoi impossible');
        }
        document.getElementById('new-comment').value = '';
        document.getElementById('mention-dropdown').style.display = 'none';
        if (fileInput) {
            fileInput.value = '';
            const label = document.getElementById('paperclip-label');
            const icon = document.getElementById('paperclip-icon');
            label.style.background = '#f8fafc';
            label.style.color = '#64748b';
            icon.className = 'fas fa-paperclip';
        }
        // Recharge juste le fil de discussion (pas de reconstruction du tiroir).
        await refreshOpenTicket(id);
        scrollChatToBottom();
    } catch (e) {
        if (window.toast) toast.error('Erreur', e.message || 'Le message n\'a pas pu être envoyé.');
    } finally {
        if (sendBtn) sendBtn.disabled = false;
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
            currentTicketId = null;
            closeDrawer();
            allTickets = allTickets.filter(x => String(x.id) !== String(id));
            selectedIds.delete(String(id));
            recomputeTabCounts();
            renderTicketList({ keepScroll: true });
            if (window.toast) toast.success('Ticket supprimé', `Ticket #${id} supprimé.`);
        } else {
            const err = await res.json().catch(() => ({}));
            if (window.toast) toast.error('Erreur', err.error || 'Suppression impossible (admin requis).');
        }
    } catch (e) {
        console.error(e);
        if (window.toast) toast.error('Erreur réseau', 'La suppression a échoué.');
    }
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function escapeHtml(t) {
    return t == null ? '' : t.toString()
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// --- SYSTÈME DE MENTIONS DYNAMIQUES ---
document.addEventListener('DOMContentLoaded', () => {
    const commentInput = document.getElementById('new-comment');
    const mentionDropdown = document.getElementById('mention-dropdown');

    if (commentInput && mentionDropdown) {
        commentInput.addEventListener('input', function(e) {
            const val = this.value;
            const cursorPos = this.selectionStart;
            const textBeforeCursor = val.substring(0, cursorPos);
            const match = textBeforeCursor.match(/@([a-zA-ZÀ-ÿ0-9_\-\.]*)$/);

            if (match) {
                const searchStr = match[1].toLowerCase();
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

        document.addEventListener('click', (e) => {
            if (!commentInput.contains(e.target) && !mentionDropdown.contains(e.target)) {
                mentionDropdown.style.display = 'none';
            }
        });
    }
});

window.insertMention = function(name) {
    const commentInput = document.getElementById('new-comment');
    const val = commentInput.value;
    const cursorPos = commentInput.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const textAfterCursor = val.substring(cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-ZÀ-ÿ0-9_\-\.]*)$/);

    if (match) {
        const startIdx = match.index;
        commentInput.value = val.substring(0, startIdx) + '@' + name + ' ' + textAfterCursor;
        document.getElementById('mention-dropdown').style.display = 'none';
        commentInput.focus();
    }
};

window.toggleEditMode = function() {
    const zone = document.getElementById('v-edit-zone');
    if (!zone) return;
    const isVisible = zone.style.display !== 'none';
    if (isVisible) {
        zone.style.display = 'none';
    } else {
        zone.style.display = 'block';
        document.getElementById('v-edit-title').focus();
    }
};

window.cancelEditMode = function() {
    document.getElementById('v-edit-zone').style.display = 'none';
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
                description:  desc,
                status:       document.getElementById('v-status').value,
                client_id:    document.getElementById('v-client').value || null,
                equipment_id: document.getElementById('v-equip').value || null,
                assigned_to:  slimAssignedView.getSelected().filter(Boolean),
                priority:     document.getElementById('v-priority').value,
                category:     document.getElementById('v-category').value || null,
                owner_id:     document.getElementById('v-owner').value || null,
                blocked_reason: document.getElementById('v-blocked-reason').value || null,
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (window.toast) toast.error('Erreur', err.error || 'Modification impossible.');
            return;
        }
        patchLocalTicket(id, { title, description: desc });
        renderSingleRow(id);
        document.getElementById('v-title').innerText = title;
        document.getElementById('v-desc').innerText = desc;
        document.getElementById('v-edit-zone').style.display = 'none';
        refreshOpenTicket(id);
        if (window.toast) toast.success('Ticket modifié', title);
    } catch (e) {
        console.error(e);
        if (window.toast) toast.error('Erreur réseau', 'La modification n\'a pas pu être envoyée.');
    }
};

window.deleteTicket      = deleteTicket;
window.saveTicket        = saveTicket;
window.selectTicket      = selectTicket;
window.updateTicketData  = updateTicketData;
window.loadEquipmentForClient = loadEquipmentForClient;
window.openNewTicketModal = openNewTicketModal;
window.closeModal        = closeModal;
window.closeDrawer = closeDrawer;
window.toggleHistorySection = toggleHistorySection;
window.navigateTicket = navigateTicket;
window.onStatusChange = onStatusChange;
window.cancelClosing = cancelClosing;
window.confirmClosing = confirmClosing;
window.claimTicket = claimTicket;
window.addLinkedReport = addLinkedReport;
window.previewSelectedReport = previewSelectedReport;
window.removeLinkedReport = removeLinkedReport;
