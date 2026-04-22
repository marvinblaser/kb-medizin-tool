// public/js/rmas.js

const RMA_STAGES = [
    "Déclaration du problème", "Transit vers Xion", "Réception Xion", 
    "RMA Offre Reçu ?", "Devis au client", "Validation KB Med + Xion", 
    "En réparation", "Transit vers KB", "Attente d'installation", 
    "Livraison + Facturation", "Archives"
];

let allRmas = [];
let currentRmaId = null;

// --- VARIABLES POUR LE POPUP (TOOLTIP) ---
let hoverTimeout;
let tooltipCache = {};

document.addEventListener('DOMContentLoaded', () => {
    initBoard();
    loadRmas();
    initTooltip(); // <-- NOUVELLE LIGNE À AJOUTER
});

// Création de l'élément HTML du popup invisible au chargement de la page
function initTooltip() {
    const tooltip = document.createElement('div');
    tooltip.id = 'rma-tooltip';
    tooltip.style.cssText = `
        position: absolute; display: none; background: white; 
        border: 1px solid #e2e8f0; border-radius: 8px; 
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); 
        padding: 15px; z-index: 9999; width: 320px; font-size: 0.85rem; 
        pointer-events: none; transition: opacity 0.2s ease; opacity: 0;
    `;
    document.body.appendChild(tooltip);
}

// --- 1. INITIALISATION DU BOARD ---
function initBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    board.innerHTML = RMA_STAGES.map(stage => {
        const safeId = stage.replace(/[^a-zA-Z0-9]/g, '');
        return `
            <div class="kanban-col" data-status="${stage}">
                <div class="kanban-col-header">
                    <h3>${stage}</h3>
                    <span class="badge" id="count-${safeId}">0</span>
                </div>
                <div class="kanban-card-list" id="col-${safeId}" ondragover="evAllowDrop(event)" ondrop="evDrop(event)"></div>
            </div>
        `;
    }).join('');
}

// --- 2. CHARGEMENT ET AFFICHAGE (Le moteur du Kanban) ---
async function loadRmas() {
    try {
        const res = await fetch('/api/rmas');
        allRmas = await res.json();
        renderRmas();
    } catch (e) {
        console.error("Erreur chargement RMA:", e);
    }
}

function renderRmas() {
    // Reset de toutes les colonnes
    RMA_STAGES.forEach(s => {
        const id = s.replace(/[^a-zA-Z0-9]/g, '');
        const col = document.getElementById(`col-${id}`);
        if (col) col.innerHTML = '';
        const count = document.getElementById(`count-${id}`);
        if (count) count.innerText = '0';
    });

    allRmas.forEach(rma => {
        const stageId = rma.status.replace(/[^a-zA-Z0-9]/g, '');
        const col = document.getElementById(`col-${stageId}`);
        
        if (col) {
            const card = document.createElement('div');
            card.className = 'rma-card';
            card.draggable = true;
            card.dataset.id = rma.id;
            card.onclick = () => openRmaDetails(rma.id);
            card.ondragstart = evDrag;
            // --- NOUVEAU : LES ÉVÉNEMENTS DE SURVOL ---
            card.onmouseenter = (e) => handleCardHover(e, rma.id);
            card.onmouseleave = handleCardLeave;
            
            // LOGIQUE DE TITRE : Titre perso OU (#RMA + Équipement)
            const displayTitle = rma.title && rma.title.trim() !== "" 
                ? rma.title 
                : `#RMA-${rma.id} - ${rma.equipment_name || 'Matériel'}`;

            const tagsHtml = rma.tags && rma.tags.length > 0 
                ? `<div style="margin-top:8px; display:flex; gap:4px; flex-wrap:wrap;">` + 
                rma.tags.map(t => `<span style="background:${t.color}15; color:${t.color}; font-size:0.65rem; padding:2px 6px; border-radius:4px; font-weight:800; border: 1px solid ${t.color}50;">${escapeHtml(t.name)}</span>`).join('') + 
                `</div>`
                : '';

            card.innerHTML = `
                <div class="rma-card-id">#${rma.id} ${rma.rma_number ? ' / ' + escapeHtml(rma.rma_number) : ''}</div>
                <h4 class="rma-card-title">${escapeHtml(displayTitle)}</h4>
                <div class="rma-card-client"><i class="fas fa-hospital"></i> ${escapeHtml(rma.cabinet_name || 'Client')}</div>
                ${tagsHtml} ${rma.supplier_name ? `<div style="font-size:0.7rem; color:var(--neutral-500); margin-top:5px;"><i class="fas fa-truck"></i> ${escapeHtml(rma.supplier_name)}</div>` : ''}
            `;
            col.appendChild(card);
            
            const count = document.getElementById(`count-${stageId}`);
            count.innerText = parseInt(count.innerText) + 1;
        }
    });
}

// --- 3. DRAG AND DROP ---
function evAllowDrop(ev) { ev.preventDefault(); }
function evDrag(ev) { ev.dataTransfer.setData("rmaId", ev.currentTarget.dataset.id); }
async function evDrop(ev) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData("rmaId");
    const col = ev.target.closest('.kanban-col');
    if (col && id) {
        const newStatus = col.dataset.status;
        await fetch(`/api/rmas/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        loadRmas();
    }
}

// --- 4. CRÉATION D'UN NOUVEAU RMA ---
async function openNewRmaModal() {
    currentRmaId = null;
    const modal = document.getElementById('rma-modal');
    modal.classList.add('active');
    document.getElementById('delete-rma-btn').style.display = 'none';
    document.getElementById('rma-modal-title').innerHTML = "<i class='fas fa-plus-circle'></i> Déclarer un nouveau RMA";
    
    try {
        const res = await fetch('/api/clients');
        const clients = await res.json();
        const clientOptions = clients.map(c => `<option value="${c.id}">${escapeHtml(c.cabinet_name || c.name)}</option>`).join('');

        document.getElementById('rma-modal-body').innerHTML = `
            <form onsubmit="saveRma(event)">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1rem;">
                    <div>
                        <div class="form-group mb-3">
                            <label>Client <span style="color:red;">*</span></label>
                            <select id="form-client" class="form-control" required onchange="loadClientEquipment(this.value)">
                                <option value="">-- Choisir un client --</option>
                                ${clientOptions}
                            </select>
                        </div>
                        <div class="form-group mb-3">
                            <label>Équipement défectueux</label>
                            <select id="form-equipment" class="form-control" disabled>
                                <option value="">-- Sélectionnez d'abord un client --</option>
                            </select>
                        </div>
                        <div class="form-group mb-3">
                            <label>Fournisseur</label>
                            <select id="form-supplier" class="form-control">
                                <option value="Xion">Xion</option>
                                <option value="Heinemann">Heinemann</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <div class="form-group mb-3">
                            <label>N° RMA Fournisseur</label>
                            <input type="text" id="form-rma-number" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <label>Tracking Aller</label>
                            <input type="text" id="form-tracking-to" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <label>Tracking Retour</label>
                            <input type="text" id="form-tracking-from" class="form-control">
                        </div>
                    </div>
                </div>
                <div class="form-group mb-3">
                    <label>Description du problème <span style="color:red;">*</span></label>
                    <textarea id="form-desc" class="form-control" rows="3" required></textarea>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center;">Créer le RMA</button>
            </form>
        `;
    } catch (e) { alert("Erreur chargement clients"); }
}

// Cascade Client -> Équipement
async function loadClientEquipment(clientId) {
    const eqSelect = document.getElementById('form-equipment');
    if (!clientId) { eqSelect.disabled = true; return; }
    try {
        const res = await fetch(`/api/rmas/equipment/${clientId}`);
        const equipment = await res.json();
        eqSelect.innerHTML = '<option value="">-- Inconnu --</option>' + 
            equipment.map(e => `<option value="${e.id}">${escapeHtml(e.brand)} - ${escapeHtml(e.name)} (SN: ${e.serial_number})</option>`).join('');
        eqSelect.disabled = false;
    } catch (e) { console.error(e); }
}

async function saveRma(e) {
    e.preventDefault();
    const data = {
        client_id: document.getElementById('form-client').value,
        equipment_id: document.getElementById('form-equipment').value || null,
        supplier_name: document.getElementById('form-supplier').value,
        rma_number: document.getElementById('form-rma-number').value,
        tracking_to_supplier: document.getElementById('form-tracking-to').value,
        tracking_from_supplier: document.getElementById('form-tracking-from').value,
        description: document.getElementById('form-desc').value
    };
    await fetch('/api/rmas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    closeRmaModal();
    loadRmas();
}

// --- 5. DÉTAILS ET MODIFICATION ---
// A. MODE LECTURE (Par défaut)
async function openRmaDetails(id) {
    currentRmaId = id;
    const modal = document.getElementById('rma-modal');
    modal.classList.add('active');
    
    document.getElementById('delete-rma-btn').style.display = 'none'; 
    const titleHeader = document.getElementById('rma-modal-title');
    const body = document.getElementById('rma-modal-body');
    
    body.innerHTML = '<div style="text-align:center; padding:5rem;"><i class="fas fa-spinner fa-spin fa-3x" style="color:var(--color-primary);"></i></div>';

    try {
        const [rmaRes, tagsAllRes] = await Promise.all([
            fetch(`/api/rmas/${id}`),
            fetch('/api/rmas/tags/all')
        ]);
        
        const rma = await rmaRes.json();
        const allTags = await tagsAllRes.json();

        titleHeader.innerHTML = `
            <div style="display: flex; align-items: center; gap: 20px;">
                <span style="font-weight:800; letter-spacing:-0.5px;">RMA #${id}</span>
                <button class="btn btn-primary btn-sm" onclick="editRmaDetails(${id})">
                    <i class="fas fa-pen"></i> Modifier l'intervention
                </button>
            </div>
        `;

        body.innerHTML = `
            <div class="rma-details-grid" style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 30px; margin-bottom: 25px;">
                <div class="details-section">
                    <h3 style="font-size:0.75rem; text-transform:uppercase; color:var(--neutral-500); margin-bottom:15px; letter-spacing:0.1em;">Informations Générales</h3>
                    <div style="background:white; border:1px solid var(--border-color); border-radius:12px; padding:20px; box-shadow:var(--shadow-sm);">
                        <p style="margin-bottom:12px;"><strong>Titre :</strong> ${rma.title ? escapeHtml(rma.title) : '<span style="color:var(--neutral-400); font-style:italic;">Titre automatique</span>'}</p>
                        <p style="margin-bottom:12px;"><strong>Client :</strong> <span style="color:var(--color-primary); font-weight:700;">${escapeHtml(rma.cabinet_name || 'Non spécifié')}</span></p>
                        <p style="margin-bottom:12px;"><strong>Appareil :</strong> ${rma.equipment_name ? escapeHtml(rma.brand + ' - ' + rma.equipment_name) : 'Non listé'} ${rma.serial_number ? `<code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.85rem; margin-left:5px;">SN: ${escapeHtml(rma.serial_number)}</code>` : ''}</p>
                        <p style="margin-bottom:12px;"><strong>Statut :</strong> <span class="badge" style="background:var(--color-primary-light); color:var(--color-primary);">${escapeHtml(rma.status)}</span></p>
                        <div style="margin-top:15px; padding:12px; background:#f8fafc; border-radius:8px; font-size:0.9rem; line-height:1.5; color:var(--neutral-700); border-left:4px solid var(--neutral-200);">
                            ${escapeHtml(rma.description || 'Pas de description.')}
                        </div>
                    </div>
                </div>

                <div class="details-section">
                    <h3 style="font-size:0.75rem; text-transform:uppercase; color:var(--neutral-500); margin-bottom:15px; letter-spacing:0.1em;">Suivi Logistique</h3>
                    <div style="background:#f1f5f9; border-radius:12px; padding:20px; height:100%;">
                        <div style="margin-bottom:15px;">
                            <label style="display:block; font-size:0.7rem; font-weight:800; color:var(--neutral-500); text-transform:uppercase;">Fournisseur</label>
                            <span style="font-weight:700; color:var(--neutral-900);">${escapeHtml(rma.supplier_name || 'Xion')}</span>
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="display:block; font-size:0.7rem; font-weight:800; color:var(--neutral-500); text-transform:uppercase;">N° RMA Fournisseur</label>
                            <span style="font-family:monospace; font-size:1rem;">${rma.rma_number ? escapeHtml(rma.rma_number) : '---'}</span>
                        </div>
                        <div>
                            <label style="display:block; font-size:0.7rem; font-weight:800; color:var(--neutral-500); text-transform:uppercase;">Tracking Aller/Retour</label>
                            <div style="font-size:0.85rem; margin-top:5px;">
                                <i class="fas fa-arrow-right" style="width:20px; color:var(--neutral-400);"></i> ${rma.tracking_to_supplier || 'Non renseigné'}<br>
                                <i class="fas fa-arrow-left" style="width:20px; color:var(--neutral-400);"></i> ${rma.tracking_from_supplier || 'Non renseigné'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            ${renderTagsSection(rma, allTags, id)}

            <div style="margin-top:30px;">
                <h3 style="font-size:0.75rem; text-transform:uppercase; color:var(--neutral-500); margin-bottom:15px; letter-spacing:0.1em;">Historique des interventions</h3>
                <div style="max-height:250px; overflow-y:auto; background:white; border:1px solid var(--border-color); border-radius:12px; padding:15px; margin-bottom:15px;">
                    ${rma.comments.length ? rma.comments.map(c => `
                        <div style="margin-bottom:15px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <strong style="font-size:0.85rem;">${escapeHtml(c.user_name)}</strong>
                                <span style="font-size:0.75rem; color:var(--neutral-400);">${new Date(c.created_at).toLocaleString('fr-CH')}</span>
                            </div>
                            <div style="font-size:0.9rem; color:var(--neutral-700);">${escapeHtml(c.comment)}</div>
                        </div>
                    `).join('') : '<p style="text-align:center; color:var(--neutral-400); padding:20px;">Aucun commentaire.</p>'}
                </div>
                <form onsubmit="addComment(event, ${id})" style="display:flex; gap:10px; background:#f8fafc; padding:10px; border-radius:12px; border:1px solid var(--border-color);">
                    <input type="text" id="new-comment" class="form-control" placeholder="Ajouter une mise à jour..." required style="border:none; background:transparent; flex:1;">
                    <button type="submit" class="btn btn-primary" style="border-radius:10px;"><i class="fas fa-paper-plane"></i></button>
                </form>
            </div>
        `;
    } catch (e) { console.error(e); }
}

function renderTagsSection(rma, allTags, rmaId) {
    const currentTagIds = rma.tags.map(t => t.id);
    const availableTags = allTags.filter(t => !currentTagIds.includes(t.id));

    return `
        <div class="rma-tags-manager" style="margin-top:20px; padding:15px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:0.75rem; font-weight:800; text-transform:uppercase; color:var(--neutral-500);">Étiquettes (Tags)</h4>
                <button type="button" class="btn-icon" onclick="toggleTagEditor(${rmaId})" style="background:none; border:none; color:var(--neutral-400); cursor:pointer;" title="Catalogue des tags">
                    <i class="fas fa-cog"></i>
                </button>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                ${rma.tags.map(t => `
                    <div style="background:white; color:${t.color}; border:1px solid ${t.color}50; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.75rem; display:flex; align-items:center; gap:8px; box-shadow:0 2px 4px rgba(0,0,0,0.03);">
                        <span style="width:8px; height:8px; border-radius:50%; background:${t.color};"></span>
                        ${escapeHtml(t.name)}
                        <i class="fas fa-times" style="cursor:pointer; opacity:0.4; font-size:0.8em;" onclick="removeTag(${rmaId}, ${t.id})"></i>
                    </div>
                `).join('')}

                <div style="position:relative;">
                    <button type="button" onclick="toggleTagDropdown()" style="width:32px; height:32px; border-radius:50%; border:1px dashed #cbd5e1; background:white; color:#94a3b8; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                        <i class="fas fa-plus"></i>
                    </button>
                    
                    <div id="tag-quick-select" style="display:none; position:absolute; bottom:40px; left:0; background:white; border:1px solid var(--border-color); border-radius:10px; box-shadow:var(--shadow-lg); z-index:100; width:220px; padding:10px;">
                        <p style="font-size:0.65rem; font-weight:800; text-transform:uppercase; color:var(--neutral-400); margin-bottom:8px;">Assigner un tag</p>
                        <div style="max-height:150px; overflow-y:auto;">
                            ${availableTags.length ? availableTags.map(t => `
                                <div class="tag-option" onclick="assignTagQuick(${rmaId}, ${t.id})" style="padding:8px 10px; cursor:pointer; border-radius:6px; display:flex; align-items:center; gap:10px; font-size:0.8rem; font-weight:600;">
                                    <span style="width:8px; height:8px; border-radius:50%; background:${t.color};"></span>
                                    ${escapeHtml(t.name)}
                                </div>
                            `).join('') : '<p style="font-size:0.7rem; color:#94a3b8; padding:5px;">Aucun autre tag</p>'}
                        </div>
                    </div>
                </div>
            </div>

            <div id="tag-editor-zone" style="display:none; margin-top:15px; padding-top:15px; border-top:1px solid #e2e8f0;">
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <input type="text" id="new-tag-name" class="form-control form-control-sm" placeholder="Nouveau..." style="flex:1;">
                    <input type="color" id="new-tag-color" value="#3b82f6" style="width:35px; height:35px; border:none; padding:0; background:none; cursor:pointer;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="createNewTag(${rmaId})">Créer</button>
                </div>
                <div id="global-tags-list" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    </div>
            </div>
        </div>
    `;
}

// Rafraîchir les équipements dans le formulaire d'édition
async function loadClientEquipmentForEdit(clientId) {
    const eqSelect = document.getElementById('edit-equipment');
    if (!clientId) { eqSelect.innerHTML = '<option value="">-- Aucun --</option>'; return; }
    const res = await fetch(`/api/rmas/equipment/${clientId}`);
    const equipment = await res.json();
    eqSelect.innerHTML = '<option value="">-- Aucun équipement spécifié --</option>' + 
        equipment.map(e => `<option value="${e.id}">${escapeHtml(e.brand)} - ${escapeHtml(e.name)} (SN: ${e.serial_number || 'N/A'})</option>`).join('');
}

// B. MODE ÉDITION (Formulaire)
async function editRmaDetails(id) {
    const titleHeader = document.getElementById('rma-modal-title');
    const body = document.getElementById('rma-modal-body');
    document.getElementById('delete-rma-btn').style.display = 'block';

    body.innerHTML = '<div style="text-align:center; padding:5rem;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

    try {
        const [rmaRes, clientsRes, tagsAllRes] = await Promise.all([
            fetch(`/api/rmas/${id}`),
            fetch('/api/clients'),
            fetch('/api/rmas/tags/all')
        ]);
        
        const rma = await rmaRes.json();
        const clientsData = await clientsRes.json();
        const allTags = await tagsAllRes.json();
        const clients = Array.isArray(clientsData) ? clientsData : (clientsData.clients || []);

        let equipments = [];
        if (rma.client_id) {
            const eqRes = await fetch(`/api/rmas/equipment/${rma.client_id}`);
            if (eqRes.ok) equipments = await eqRes.json();
        }

        titleHeader.innerHTML = `<i class="fas fa-edit"></i> Modification RMA #${id}`;

        body.innerHTML = `
            <form onsubmit="updateRma(event, ${id})">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 25px;">
                    <div>
                        <div class="form-group mb-3">
                            <label>Titre de l'intervention</label>
                            <input type="text" id="edit-title" class="form-control" value="${escapeHtml(rma.title || '')}" placeholder="Laisse vide pour générer auto">
                        </div>
                        <div class="form-group mb-3">
                            <label>Statut du flux (Étape)</label>
                            <select id="edit-status" class="form-control" style="font-weight:700; color:var(--color-primary); border-color:var(--color-primary);">
                                ${RMA_STAGES.map(s => `<option value="${s}" ${rma.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group mb-3">
                            <label>Client</label>
                            <select id="edit-client" class="form-control" onchange="loadClientEquipmentForEdit(this.value)">
                                ${clients.map(c => `<option value="${c.id}" ${rma.client_id === c.id ? 'selected' : ''}>${escapeHtml(c.cabinet_name || c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group mb-3">
                            <label>Matériel concerné</label>
                            <select id="edit-equipment" class="form-control">
                                <option value="">-- Aucun --</option>
                                ${equipments.map(e => `<option value="${e.id}" ${rma.equipment_id === e.id ? 'selected' : ''}>${escapeHtml(e.brand)} - ${escapeHtml(e.name)} (SN: ${e.serial_number})</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div>
                        <div class="form-group mb-3">
                            <label>Fournisseur (SAV)</label>
                            <select id="edit-supplier" class="form-control">
                                <option value="Xion" ${rma.supplier_name === 'Xion' ? 'selected' : ''}>Xion</option>
                                <option value="Heinemann" ${rma.supplier_name === 'Heinemann' ? 'selected' : ''}>Heinemann</option>
                                <option value="Autre" ${rma.supplier_name === 'Autre' ? 'selected' : ''}>Autre...</option>
                            </select>
                        </div>
                        <div class="form-group mb-3">
                            <label>N° RMA Fournisseur</label>
                            <input type="text" id="edit-rma-number" class="form-control" value="${escapeHtml(rma.rma_number || '')}">
                        </div>
                        <div class="form-group mb-3">
                            <label>Tracking Envoi (Aller)</label>
                            <input type="text" id="edit-tracking-to" class="form-control" value="${escapeHtml(rma.tracking_to_supplier || '')}">
                        </div>
                        <div class="form-group mb-3">
                            <label>Tracking Retour</label>
                            <input type="text" id="edit-tracking-from" class="form-control" value="${escapeHtml(rma.tracking_from_supplier || '')}">
                        </div>
                    </div>
                </div>

                <div class="form-group mb-4">
                    <label>Description détaillée</label>
                    <textarea id="edit-desc" class="form-control" rows="4">${escapeHtml(rma.description || '')}</textarea>
                </div>

                ${renderTagsSection(rma, allTags, id)}

                <div style="display:flex; gap:10px; margin-top:30px; border-top:1px solid var(--border-color); padding-top:20px;">
                    <button type="button" class="btn btn-secondary" onclick="openRmaDetails(${id})" style="flex:1;">Annuler</button>
                    <button type="submit" class="btn btn-primary" style="flex:2; font-weight:800;">Enregistrer les changements</button>
                </div>
            </form>
        `;
    } catch (e) { console.error(e); }
}

// C. SAUVEGARDE DES MODIFICATIONS
async function updateRma(e, id) {
    e.preventDefault();
    const data = {
        title: document.getElementById('edit-title').value || null,
        status: document.getElementById('edit-status').value,
        client_id: document.getElementById('edit-client').value,
        equipment_id: document.getElementById('edit-equipment').value || null,
        supplier_name: document.getElementById('edit-supplier').value,
        rma_number: document.getElementById('edit-rma-number').value,
        tracking_to_supplier: document.getElementById('edit-tracking-to').value,
        tracking_from_supplier: document.getElementById('edit-tracking-from').value,
        description: document.getElementById('edit-desc').value
    };

    try {
        const res = await fetch(`/api/rmas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            loadRmas(); // Rafraîchit les cartes en arrière-plan
            openRmaDetails(id); // Rebascule la modale en mode lecture pour voir le résultat !
        }
    } catch (err) { alert("Erreur d'enregistrement."); }
}

async function addComment(e, id) {
    e.preventDefault();
    const comment = document.getElementById('new-comment').value;
    await fetch(`/api/rmas/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
    });
    openRmaDetails(id);
}

async function deleteRma() {
    if (!currentRmaId || !confirm("Supprimer ce RMA ?")) return;
    await fetch(`/api/rmas/${currentRmaId}`, { method: 'DELETE' });
    closeRmaModal();
    loadRmas();
}

// --- 6. GESTION DU POPUP AU SURVOL (TOOLTIP) ---

function handleCardHover(ev, rmaId) {
    const card = ev.currentTarget;
    const tooltip = document.getElementById('rma-tooltip');

    hoverTimeout = setTimeout(async () => {
        const rect = card.getBoundingClientRect();
        let top = rect.top + window.scrollY;
        let left = rect.right + 15 + window.scrollX;

        if (left + 340 > window.innerWidth) {
            left = rect.left - 355 + window.scrollX;
        }

        tooltip.style.cssText = `
            position: absolute; display: block; background: #ffffff; 
            border: 1px solid #e2e8f0; border-radius: 16px; 
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); 
            padding: 20px; z-index: 9999; width: 340px; font-size: 0.85rem; 
            pointer-events: none; transition: opacity 0.2s ease, transform 0.2s ease; 
            opacity: 0; transform: translateY(5px); font-family: 'Inter', system-ui, sans-serif;
        `;
        
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.innerHTML = '<div style="text-align:center; color:var(--kb-primary); padding:20px;"><i class="fas fa-circle-notch fa-spin fa-2x"></i></div>';
        
        setTimeout(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
        }, 10);

        try {
            let details = tooltipCache[rmaId];
            if (!details) {
                const res = await fetch(`/api/rmas/${rmaId}`);
                details = await res.json();
                tooltipCache[rmaId] = details; 
            }

            // Génération des Tags pour le Tooltip
            const tagsHtml = (details.tags && details.tags.length > 0) 
                ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:15px;">` + 
                  details.tags.map(t => `<span style="background:${t.color}15; color:${t.color}; border:1px solid ${t.color}30; padding:3px 8px; border-radius:12px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em;">${escapeHtml(t.name)}</span>`).join('') + 
                  `</div>`
                : '';

            const recentComments = details.comments.slice(-3);
            const commentsHtml = recentComments.length > 0 
                ? recentComments.map(c => `
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #f1f5f9;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <strong style="color:#334155; font-size:0.75rem;">${escapeHtml(c.user_name)}</strong>
                            <span style="color:#94a3b8; font-size:0.7rem;">${new Date(c.created_at).toLocaleDateString('fr-CH')}</span>
                        </div>
                        <div style="color:#475569; font-size:0.8rem; line-height:1.4;">${escapeHtml(c.comment)}</div>
                    </div>`).join('')
                : '<div style="margin-top: 10px; color:#94a3b8; font-style:italic; text-align:center; font-size:0.8rem;">Aucun suivi.</div>';

            const descPreview = details.description ? details.description.substring(0, 90) + '...' : 'Aucune description.';
            
            tooltip.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div>
                        <div style="font-weight: 900; color: #0f172a; font-size: 1.1rem; letter-spacing:-0.5px;">RMA #${details.id}</div>
                        <div style="color: #64748b; font-size: 0.8rem; font-weight:600;">${escapeHtml(details.equipment_name || 'Matériel non spécifié')}</div>
                    </div>
                    <span style="background:#f1f5f9; color:#475569; padding:4px 8px; border-radius:6px; font-weight:800; font-size:0.7rem;">${escapeHtml(details.supplier_name || 'Xion')}</span>
                </div>
                
                ${tagsHtml}
                
                <div style="background:#f8fafc; padding:10px; border-radius:8px; margin-bottom:15px; border:1px solid #f1f5f9;">
                    <strong style="display:block; font-size:0.7rem; text-transform:uppercase; color:#94a3b8; margin-bottom:4px;">Motif :</strong>
                    <span style="color:#334155; font-size:0.85rem; line-height:1.4;">${escapeHtml(descPreview)}</span>
                </div>
                
                <div>
                    <div style="font-weight: 800; color: #94a3b8; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;">Dernières Mises à Jour</div>
                    ${commentsHtml}
                </div>
            `;
        } catch (e) {
            tooltip.innerHTML = '<div style="color:#ef4444; text-align:center; padding:15px;"><i class="fas fa-exclamation-triangle"></i> Erreur de chargement.</div>';
        }
    }, 450); 
}

function handleCardLeave() {
    clearTimeout(hoverTimeout); // Annule l'apparition si la souris part trop vite
    const tooltip = document.getElementById('rma-tooltip');
    if (tooltip) {
        tooltip.style.opacity = '0';
        setTimeout(() => { tooltip.style.display = 'none'; }, 200); // Laisse le temps à l'animation CSS de finir
    }
}

// --- 7. FONCTIONS DE GESTION DES TAGS ---

async function assignTag(rmaId) {
    const tagId = document.getElementById('select-add-tag').value;
    if (!tagId) return;
    await fetch(`/api/rmas/${rmaId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId })
    });
    editRmaDetails(rmaId); // Recharge le formulaire avec le tag ajouté
    loadRmas(); // Met à jour la carte en arrière-plan
}

async function removeTag(rmaId, tagId) {
    try {
        await fetch(`/api/rmas/${rmaId}/tags/${tagId}`, { method: 'DELETE' });
        openRmaDetails(rmaId); // Recharge la modale avec les infos à jour
        loadRmas(); // Rafraîchit le tableau KB Med en arrière-plan
    } catch (err) {
        console.error("Erreur retrait tag :", err);
    }
}

async function createNewTag(rmaId) {
    const name = document.getElementById('new-tag-name').value.trim();
    const color = document.getElementById('new-tag-color').value;
    if (!name) return;

    // 1. Enregistre le nouveau tag dans la base globale
    const res = await fetch('/api/rmas/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });
    const newTag = await res.json();

    // 2. L'assigne immédiatement au RMA en cours
    if (newTag.success) {
        await fetch(`/api/rmas/${rmaId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: newTag.id })
        });
        editRmaDetails(rmaId);
        loadRmas();
    }
}

async function deleteTagGlobally(tagId, rmaId) {
    if (!confirm("⚠️ Voulez-vous vraiment supprimer cette étiquette de tout le système ?")) return;

    try {
        await fetch(`/api/rmas/tags/${tagId}/global`, { method: 'DELETE' });
        
        // On ferme et on rouvre le gestionnaire de tags pour rafraîchir la liste
        document.getElementById('tag-editor-zone').style.display = 'none';
        openRmaDetails(rmaId);
        loadRmas();
    } catch (err) {
        console.error("Erreur suppression globale :", err);
    }
}

// Affiche/Masque le menu rapide
function toggleTagDropdown() {
    const dropdown = document.getElementById('tag-quick-select');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

// Affiche/Masque la zone de gestion complète
async function toggleTagEditor(rmaId) {
    const zone = document.getElementById('tag-editor-zone');
    zone.style.display = zone.style.display === 'none' ? 'block' : 'none';
    
    if (zone.style.display === 'block') {
        loadGlobalTagsForManagement(rmaId);
    }
}

// Charge les tags avec possibilité de les MODIFIER (Nom/Couleur)
async function loadGlobalTagsForManagement(rmaId) {
    const list = document.getElementById('global-tags-list');
    const res = await fetch('/api/rmas/tags/all');
    const tags = await res.json();
    
    list.innerHTML = tags.map(t => `
        <div style="display: flex; align-items: center; gap: 5px; background: white; padding: 5px; border-radius: 4px; border: 1px solid #e2e8f0;">
            <input type="color" onchange="updateTagColor(${t.id}, this.value, ${rmaId})" value="${t.color}" style="width:20px; height:20px; border:none; cursor:pointer; background:none;">
            <input type="text" onblur="updateTagName(${t.id}, this.value, ${rmaId})" value="${escapeHtml(t.name)}" style="border:none; font-size:0.75rem; flex:1; outline:none;">
            <i class="fas fa-trash-alt" style="color:#ef4444; font-size:0.7rem; cursor:pointer;" onclick="deleteTagGlobally(${t.id}, ${rmaId})"></i>
        </div>
    `).join('');
}

// Assigne un tag via le menu rapide
async function assignTagQuick(rmaId, tagId) {
    await fetch(`/api/rmas/${rmaId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId })
    });
    openRmaDetails(rmaId);
    loadRmas();
}

function getTagsComponentHtml(rma, allTags, rmaId) {
    const currentTagIds = rma.tags.map(t => t.id);
    const availableTags = allTags.filter(t => !currentTagIds.includes(t.id));

    return `
        <div class="tags-management-section" style="border-top:2px solid #e2e8f0; padding-top:20px; margin-bottom:20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h4 style="margin:0; font-size: 1rem; color: #1e293b; font-weight:700;">Étiquettes</h4>
                <button class="btn-icon" onclick="toggleTagEditor(${rmaId})" style="background:none; border:none; color:#94a3b8; cursor:pointer;" title="Catalogue global">
                    <i class="fas fa-cog"></i>
                </button>
            </div>
            
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                ${rma.tags.map(t => `
                    <div class="tag-pill" style="background:${t.color}15; color:${t.color}; border-color:${t.color}30;">
                        ${escapeHtml(t.name)}
                        <i class="fas fa-times" style="cursor:pointer; opacity:0.5; font-size:0.8em;" onclick="removeTag(${rmaId}, ${t.id})"></i>
                    </div>
                `).join('')}

                <div style="position: relative;">
                    <button onclick="toggleTagDropdown()" style="border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: white; color: #64748b; border: 1px dashed #cbd5e1; cursor:pointer;">
                        <i class="fas fa-plus" style="font-size:0.8rem;"></i>
                    </button>
                    
                    <div id="tag-quick-select" style="display: none; position: absolute; top: 35px; left: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 100; width: 200px; padding: 5px;">
                        <div style="max-height: 180px; overflow-y: auto;">
                            ${availableTags.length > 0 ? availableTags.map(t => `
                                <div class="tag-option" onclick="assignTagQuick(${rmaId}, ${t.id})" style="padding: 8px 12px; cursor: pointer; border-radius: 6px; display: flex; align-items: center; gap: 10px; font-size: 0.8rem; font-weight:600; color:#475569;">
                                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${t.color};"></span>
                                    ${escapeHtml(t.name)}
                                </div>
                            `).join('') : '<p style="font-size:0.7rem; color:#94a3b8; padding:10px; text-align:center;">Aucun autre tag disponible</p>'}
                        </div>
                    </div>
                </div>
            </div>

            <div id="tag-editor-zone" style="display: none; margin-top: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px;">
                <p style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:#94a3b8; margin-bottom:12px;">Nouveau Tag</p>
                <div style="display: flex; gap: 8px; margin-bottom: 15px;">
                    <input type="text" id="new-tag-name" class="form-control" placeholder="Nom..." style="font-size:0.85rem; flex:1;">
                    <input type="color" id="new-tag-color" value="#3b82f6" style="width:35px; height:35px; border:none; padding:0; background:none; cursor:pointer;">
                    <button class="btn btn-primary btn-sm" onclick="createNewTag(${rmaId})">Créer</button>
                </div>
                <p style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:#94a3b8; margin-bottom:8px;">Catalogue existant</p>
                <div id="global-tags-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;"></div>
            </div>
        </div>
    `;
}

function closeRmaModal() { document.getElementById('rma-modal').classList.remove('active'); }
function escapeHtml(t) { if (!t) return ""; const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }