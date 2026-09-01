// public/js/report-templates.js — Bibliothèque de modèles de rapport (Lot 1)
'use strict';

const WORK_TYPES = [
  'Mise en marche', "Service d'entretien", 'Réparation', 'Contrôle',
  'Réparation / Garantie', 'Première validation', 'Montage', 'Instruction', 'Re-validation',
];

let ME = null;
let deviceTypes = [];
let equipmentCatalog = [];
let materialsCatalog = [];
let templates = [];
let slimTypes, slimEquip, slimDevice;

const $ = (id) => document.getElementById(id);
const esc = (t) => t == null ? '' : String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await Promise.all([loadDeviceTypes(), loadEquipmentCatalog(), loadMaterialsCatalog()]);
  buildFilterOptions();
  buildEditorScopeOptions();
  wireEvents();
  await loadTemplates();
});

async function checkAuth() {
  try {
    const r = await fetch('/api/auth/me');
    if (!r.ok) { location.href = '/login.html'; return; }
    const d = await r.json();
    ME = d.user;
    $('u-avatar').textContent = (d.user.name || '?').charAt(0).toUpperCase();
    $('u-name').textContent = d.user.name;
    $('u-role').textContent = d.user.role;
  } catch { location.href = '/login.html'; }
}

async function loadDeviceTypes() {
  try { deviceTypes = await fetch('/api/admin/device-types').then(r => r.ok ? r.json() : []); }
  catch { deviceTypes = []; }
  if (!Array.isArray(deviceTypes)) deviceTypes = [];
}
async function loadEquipmentCatalog() {
  try { equipmentCatalog = await fetch('/api/admin/equipment').then(r => r.ok ? r.json() : []); }
  catch { equipmentCatalog = []; }
  if (!Array.isArray(equipmentCatalog)) equipmentCatalog = [];
}
async function loadMaterialsCatalog() {
  try {
    const d = await fetch('/api/admin/materials').then(r => r.ok ? r.json() : []);
    materialsCatalog = Array.isArray(d) ? d : (Array.isArray(d.materials) ? d.materials : []);
  } catch { materialsCatalog = []; }
}
function matCatalogOptions(selectedId) {
  return '<option value="">— Libre (saisie manuelle) —</option>' +
    materialsCatalog.map(m =>
      `<option value="${m.id}" ${String(m.id) === String(selectedId) ? 'selected' : ''}>${esc(m.product_code ? '[' + m.product_code + '] ' : '')}${esc(m.name)}</option>`
    ).join('');
}
window.__tplMatCatChange = function (sel) {
  const row = sel.closest('.tpl-line-row');
  if (!row) return;
  row.dataset.materialId = sel.value || '';
  const m = materialsCatalog.find(x => String(x.id) === String(sel.value));
  if (!m) return;
  row.querySelector('.mt-name').value = m.name || '';
  row.querySelector('.mt-code').value = m.product_code || '';
  row.querySelector('.mt-price').value = (m.unit_price != null ? m.unit_price : 0);
};

function equipLabel(e) {
  return [e.brand, e.model || e.name].filter(Boolean).join(' ').trim() || e.name || `#${e.id}`;
}

function buildFilterOptions() {
  $('f-type').innerHTML = '<option value="">Tous les types</option>' +
    WORK_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  $('f-device').innerHTML = '<option value="">Toutes les machines (type)</option>' +
    deviceTypes.map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
}

function buildEditorScopeOptions() {
  $('e-types').innerHTML = WORK_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  $('e-device').innerHTML = '<option value="">— Indifférent —</option>' +
    deviceTypes.map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  $('e-equipment').innerHTML = '<option value="">— Indifférent —</option>' +
    equipmentCatalog.map(e => `<option value="${e.id}">${esc(equipLabel(e))}</option>`).join('');
  slimTypes = new SlimSelect({ select: '#e-types', settings: { placeholderText: 'Tous types', closeOnSelect: false } });
  slimDevice = new SlimSelect({ select: '#e-device', settings: { placeholderText: 'Rechercher un type de machine…', allowDeselect: true } });
  slimEquip = new SlimSelect({ select: '#e-equipment', settings: { placeholderText: 'Rechercher un modèle du catalogue…', allowDeselect: true } });
}

function wireEvents() {
  $('new-tpl-btn').addEventListener('click', () => openTplEditor(null));
  $('save-tpl-btn').addEventListener('click', saveTemplate);
  $('f-search').addEventListener('input', debounce(loadTemplates, 200));
  ['f-type', 'f-device', 'f-lang', 'f-mine', 'f-archived'].forEach(id =>
    $(id).addEventListener('change', loadTemplates));
  const lo = $('logout-btn');
  if (lo) lo.addEventListener('click', () => fetch('/api/auth/logout', { method: 'POST' }).finally(() => location.href = '/login.html'));
}

// ─── LISTE ───────────────────────────────────────────────────────────────────
async function loadTemplates() {
  const params = new URLSearchParams();
  const s = $('f-search').value.trim();
  if (s) params.set('search', s);
  if ($('f-type').value) params.set('work_type', $('f-type').value);
  if ($('f-device').value) params.set('device_type', $('f-device').value);
  if ($('f-lang').value) params.set('language', $('f-lang').value);
  if ($('f-mine').checked) params.set('mine', '1');
  if ($('f-archived').checked) params.set('include_archived', '1');
  try {
    templates = await fetch(`/api/report-templates?${params}`).then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    });
    renderTemplates();
  } catch {
    if (window.toast) toast.error('Erreur', 'Impossible de charger les modèles.');
  }
}

function scopeBadges(t) {
  const parts = [];
  (t.work_types_list || []).forEach(w => parts.push(`<span class="tpl-badge">${esc(w)}</span>`));
  if (t.equipment_catalog_id) {
    const lbl = [t.eq_brand, t.eq_model || t.eq_name].filter(Boolean).join(' ') || `#${t.equipment_catalog_id}`;
    parts.push(`<span class="tpl-badge machine"><i class="fas fa-microchip"></i> ${esc(lbl)}</span>`);
  } else if (t.device_type) {
    parts.push(`<span class="tpl-badge machine">${esc(t.device_type)}</span>`);
  }
  return parts.join('') || '<span class="tpl-badge">Générique</span>';
}

function renderTemplates() {
  const tb = $('tpl-list');
  if (!templates.length) {
    tb.innerHTML = `<tr><td colspan="7" class="tpl-empty"><i class="fas fa-layer-group"></i>Aucun modèle. Créez-en un, ou utilisez « Enregistrer comme modèle » depuis un rapport.</td></tr>`;
    return;
  }
  tb.innerHTML = templates.map(t => {
    const mine = t.author_id === ME.id;
    const canEdit = mine || ME.role === 'admin';
    const archived = !!t.archived_at;
    return `
    <tr>
      <td>
        <div class="tpl-name">${esc(t.name)}</div>
        ${t.description ? `<div class="tpl-desc">${esc(t.description)}</div>` : ''}
      </td>
      <td>${scopeBadges(t)}</td>
      <td>${t.language ? (t.language === 'fr' ? 'FR' : 'DE') : '—'}</td>
      <td>${esc(t.author_name)}</td>
      <td style="text-align:right">${t.usage_count || 0}</td>
      <td>
        ${archived ? '<span class="tpl-badge archived">Archivé</span>'
          : t.is_shared ? '<span class="tpl-badge">Partagé</span>' : '<span class="tpl-badge perso">Personnel</span>'}
      </td>
      <td>
        <div class="tpl-actions">
          <button class="btn-icon-sm" title="Dupliquer" onclick="duplicateTemplate(${t.id})"><i class="fas fa-copy"></i></button>
          ${canEdit ? `<button class="btn-icon-sm" title="Modifier" onclick="openTplEditor(${t.id})"><i class="fas fa-pen"></i></button>` : ''}
          ${canEdit ? `<button class="btn-icon-sm" title="${archived ? 'Restaurer' : 'Archiver'}" onclick="toggleArchive(${t.id}, ${archived ? 0 : 1})"><i class="fas fa-${archived ? 'box-open' : 'box-archive'}"></i></button>` : ''}
          ${canEdit ? `<button class="btn-icon-sm btn-icon-danger" title="Supprimer" onclick="deleteTemplate(${t.id})"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

window.duplicateTemplate = async function (id) {
  try {
    const r = await fetch(`/api/report-templates/${id}/duplicate`, { method: 'POST' });
    if (!r.ok) throw new Error();
    if (window.toast) toast.success('Modèle dupliqué', 'La copie est dans « Mes modèles » (personnelle).');
    await loadTemplates();
  } catch { if (window.toast) toast.error('Erreur', 'Duplication impossible.'); }
};

window.toggleArchive = async function (id, archive) {
  try {
    const r = await fetch(`/api/report-templates/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST' });
    if (!r.ok) throw new Error();
    await loadTemplates();
  } catch { if (window.toast) toast.error('Erreur', 'Action impossible.'); }
};

window.deleteTemplate = async function (id) {
  const ok = typeof confirmDelete === 'function'
    ? await confirmDelete('ce modèle de rapport')
    : confirm('Supprimer ce modèle ?');
  if (!ok) return;
  try {
    const r = await fetch(`/api/report-templates/${id}`, { method: 'DELETE' });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error); }
    if (window.toast) toast.success('Modèle supprimé', '');
    await loadTemplates();
  } catch (e) { if (window.toast) toast.error('Erreur', e.message || 'Suppression impossible.'); }
};

// ─── ÉDITEUR ─────────────────────────────────────────────────────────────────
window.closeTplEditor = () => $('tpl-editor').classList.remove('active');

window.openTplEditor = async function (id) {
  $('e-id').value = id || '';
  $('tpl-editor-title').textContent = id ? 'Modifier le modèle' : 'Nouveau modèle';
  $('e-name').value = ''; $('e-description').value = ''; $('e-title').value = '';
  $('e-installation').value = ''; $('e-remarks').value = '';
  $('e-lang').value = ''; $('e-shared').value = '1';
  slimTypes.setSelected([]); slimEquip.setSelected(''); slimDevice.setSelected('');
  // Détruit les SlimSelect des lignes matériel avant de vider (évite les dropdowns orphelins sur <body>)
  document.querySelectorAll('#e-mat .tpl-mini-btn').forEach(b => { try { b.__ss && b.__ss.destroy(); } catch {} });
  $('e-work').innerHTML = ''; $('e-stk').innerHTML = ''; $('e-mat').innerHTML = '';

  if (id) {
    try {
      const t = await fetch(`/api/report-templates/${id}`).then(r => { if (!r.ok) throw new Error(); return r.json(); });
      $('e-name').value = t.name || '';
      $('e-description').value = t.description || '';
      $('e-title').value = t.suggested_title || '';
      $('e-installation').value = t.installation_text || '';
      $('e-remarks').value = t.remarks || '';
      $('e-lang').value = t.language || '';
      $('e-shared').value = String(t.is_shared);
      slimDevice.setSelected(t.device_type || '');
      slimTypes.setSelected((t.work_types_list || []).map(String));
      slimEquip.setSelected(t.equipment_catalog_id ? String(t.equipment_catalog_id) : '');
      (t.work_lines || []).forEach(l => addTplWorkLine(l));
      (t.stk_tests || []).forEach(s => addTplStk(s));
      (t.materials || []).forEach(m => addTplMat(m));
    } catch {
      if (window.toast) toast.error('Erreur', 'Modèle introuvable.');
      return;
    }
  } else {
    addTplWorkLine(); addTplWorkLine(); addTplWorkLine();
  }
  $('tpl-editor').classList.add('active');
  setTimeout(() => $('e-name').focus(), 60);
};

function addTplWorkLine(text = '') {
  const row = document.createElement('div');
  row.className = 'tpl-line-row work';
  row.innerHTML = `
    <input type="text" class="wl" placeholder="Description du travail…" value="${esc(text)}">
    <button type="button" class="tpl-mini-btn" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
  $('e-work').appendChild(row);
}
window.addTplWorkLine = addTplWorkLine;

function addTplStk(d = {}) {
  const row = document.createElement('div');
  row.className = 'tpl-line-row stk';
  row.innerHTML = `
    <input type="text" class="sk-name" placeholder="Nom de l'appareil…" value="${esc(d.device_name || '')}">
    <input type="number" class="price sk-price" step="0.01" placeholder="Prix" value="${d.price != null ? d.price : 75}">
    <input type="number" class="num sk-disc" min="0" max="100" step="1" placeholder="Rab%" value="${d.discount || 0}">
    <span class="chkwrap"><input type="checkbox" class="sk-incl" ${d.included ? 'checked' : ''} title="Inclus"></span>
    <button type="button" class="tpl-mini-btn" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
  $('e-stk').appendChild(row);
}
window.addTplStk = addTplStk;

function addTplMat(d = {}) {
  const row = document.createElement('div');
  row.className = 'tpl-line-row mat';
  row.innerHTML = `
    <select class="cat mt-cat">${matCatalogOptions(d.material_id)}</select>
    <input type="text" class="mt-name" placeholder="Désignation…" value="${esc(d.material_name || '')}">
    <input type="text" class="code mt-code" placeholder="Code" value="${esc(d.product_code || '')}">
    <input type="number" class="num mt-qty" step="1" min="0" placeholder="Qté" value="${d.quantity != null ? d.quantity : 1}">
    <input type="number" class="price mt-price" step="0.01" placeholder="Prix" value="${d.unit_price != null ? d.unit_price : 0}">
    <input type="number" class="num mt-disc" min="0" max="100" step="1" placeholder="Rab%" value="${d.discount || 0}">
    <span class="chkwrap"><input type="checkbox" class="mt-incl" ${d.included ? 'checked' : ''} title="Inclus"></span>
    <button type="button" class="tpl-mini-btn" onclick="this.__ss && this.__ss.destroy && this.__ss.destroy(); this.closest('.tpl-line-row').remove()"><i class="fas fa-times"></i></button>`;
  row.dataset.materialId = d.material_id || '';
  $('e-mat').appendChild(row);
  const sel = row.querySelector('.mt-cat');
  try {
    const ss = new SlimSelect({
      select: sel,
      settings: { placeholderText: 'Article du catalogue…', allowDeselect: true },
      events: { afterChange: () => __tplMatCatChange(sel) },
    });
    row.querySelector('.tpl-mini-btn').__ss = ss;
  } catch { /* SlimSelect indispo : le <select> natif reste utilisable */ }
}
window.addTplMat = addTplMat;

function collectEditor() {
  const workLines = [...document.querySelectorAll('#e-work .wl')].map(i => i.value.trim()).filter(Boolean);
  const stkTests = [...document.querySelectorAll('#e-stk .stk')].map(r => ({
    device_name: r.querySelector('.sk-name').value.trim(),
    price: parseFloat(r.querySelector('.sk-price').value) || 0,
    discount: parseFloat(r.querySelector('.sk-disc').value) || 0,
    included: r.querySelector('.sk-incl').checked,
  })).filter(t => t.device_name);
  const materials = [...document.querySelectorAll('#e-mat .mat')].map(r => ({
    material_id: (r.querySelector('.mt-cat') && r.querySelector('.mt-cat').value) || r.dataset.materialId || null,
    material_name: r.querySelector('.mt-name').value.trim(),
    product_code: r.querySelector('.mt-code').value.trim(),
    quantity: parseFloat(r.querySelector('.mt-qty').value) || 1,
    unit_price: parseFloat(r.querySelector('.mt-price').value) || 0,
    discount: parseFloat(r.querySelector('.mt-disc').value) || 0,
    included: r.querySelector('.mt-incl').checked,
  })).filter(m => m.material_name || m.product_code);

  return {
    name: $('e-name').value.trim(),
    description: $('e-description').value.trim(),
    work_types: slimTypes.getSelected(),
    device_type: (slimDevice.getSelected()[0] || '') || null,
    equipment_catalog_id: (slimEquip.getSelected()[0] || '') || null,
    language: $('e-lang').value || null,
    suggested_title: $('e-title').value.trim(),
    installation_text: $('e-installation').value.trim(),
    remarks: $('e-remarks').value.trim(),
    is_shared: $('e-shared').value === '1',
    work_lines: workLines,
    stk_tests: stkTests,
    materials,
  };
}

async function saveTemplate() {
  const payload = collectEditor();
  if (!payload.name) { if (window.toast) toast.error('Nom requis', 'Donnez un nom au modèle.'); return; }
  const empty = !payload.work_lines.length && !payload.stk_tests.length && !payload.materials.length
    && !payload.installation_text && !payload.remarks && !payload.suggested_title;
  if (empty) { if (window.toast) toast.error('Modèle vide', 'Ajoutez au moins une ligne ou un texte.'); return; }

  const id = $('e-id').value;
  const btn = $('save-tpl-btn');
  btn.disabled = true;
  try {
    const r = await fetch(id ? `/api/report-templates/${id}` : '/api/report-templates', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Enregistrement impossible.');
    if (window.toast) toast.success('Modèle enregistré', payload.name);
    closeTplEditor();
    await loadTemplates();
  } catch (e) {
    if (window.toast) toast.error('Erreur', e.message);
  } finally {
    btn.disabled = false;
  }
}
