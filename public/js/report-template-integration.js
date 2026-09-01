// public/js/report-template-integration.js
// Branche la bibliothèque de modèles sur l'éditeur de rapport :
//  - « Enregistrer comme modèle » : crée un modèle depuis le rapport courant
//  - « Appliquer un modèle »       : choisit un modèle et fusionne son contenu
// Fichier autonome : n'utilise que des globales déjà exposées par reports.js.
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => t == null ? '' : String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let deviceTypes = [];
  let equipmentCatalog = [];
  let materialsCatalog = [];
  let materialsById = new Map();
  let scopeSelectsReady = false;
  let slimSatDevice = null;
  let slimSatEquip = null;

  document.addEventListener('DOMContentLoaded', () => {
    const applyBtn = $('apply-template-btn');
    const saveBtn = $('save-as-template-btn');
    if (applyBtn) applyBtn.addEventListener('click', openApplyPicker);
    if (saveBtn) saveBtn.addEventListener('click', openSaveAsTemplate);
    const satSave = $('sat-save-btn');
    if (satSave) satSave.addEventListener('click', submitSaveAsTemplate);
    const aptSearch = $('apt-search');
    if (aptSearch) aptSearch.addEventListener('input', debounce(renderApplyList, 150));
    document.querySelectorAll('.apt-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.apt-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateAptModeHint();
      });
    });
    updateAptModeHint();
  });

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function currentAptMode() {
    return document.querySelector('.apt-mode-btn.active')?.dataset.mode || 'append';
  }
  function updateAptModeHint() {
    const el = $('apt-mode-hint');
    if (!el) return;
    el.textContent = currentAptMode() === 'replace'
      ? 'Vide les sections Travaux, Tests STK et Matériel du rapport, puis y place le contenu du modèle. Les textes (installation, remarques, titre) sont écrasés.'
      : 'Ajoute le contenu du modèle à ce qui est déjà saisi : les lignes vides sont remplacées, les doublons ignorés, et les types de travaux du modèle s\'ajoutent à la sélection.';
  }

  async function ensureScopeData() {
    if (scopeSelectsReady) return;
    try {
      let mats;
      [deviceTypes, equipmentCatalog, mats] = await Promise.all([
        fetch('/api/admin/device-types').then(r => r.ok ? r.json() : []),
        fetch('/api/admin/equipment').then(r => r.ok ? r.json() : []),
        fetch('/api/admin/materials').then(r => r.ok ? r.json() : []),
      ]);
      materialsCatalog = Array.isArray(mats) ? mats : (Array.isArray(mats && mats.materials) ? mats.materials : []);
      materialsById = new Map(materialsCatalog.map(m => [String(m.id), m]));
    } catch { deviceTypes = []; equipmentCatalog = []; materialsCatalog = []; }
    if (!Array.isArray(deviceTypes)) deviceTypes = [];
    if (!Array.isArray(equipmentCatalog)) equipmentCatalog = [];

    const eqLabel = (e) => [e.brand, e.model || e.name].filter(Boolean).join(' ').trim() || e.name || `#${e.id}`;
    const devOpts = '<option value="">— Indifférent —</option>' +
      deviceTypes.map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
    const eqOpts = '<option value="">— Indifférent —</option>' +
      equipmentCatalog.map(e => `<option value="${e.id}">${esc(eqLabel(e))}</option>`).join('');
    if ($('sat-device')) $('sat-device').innerHTML = devOpts;
    if ($('sat-equipment')) $('sat-equipment').innerHTML = eqOpts;
    // SlimSelect (barre de recherche intégrée) sur les 2 listes longues.
    try {
      if (typeof SlimSelect === 'function') {
        if ($('sat-device')) slimSatDevice = new SlimSelect({ select: '#sat-device', settings: { placeholderText: 'Rechercher un type de machine…', allowDeselect: true } });
        if ($('sat-equipment')) slimSatEquip = new SlimSelect({ select: '#sat-equipment', settings: { placeholderText: 'Rechercher un modèle du catalogue…', allowDeselect: true } });
      }
    } catch { /* <select> natif conservé */ }
    scopeSelectsReady = true;
  }

  // ── Lecture du rapport courant ─────────────────────────────────────────────
  function currentReportContent() {
    const workText = typeof getWorkData === 'function' ? getWorkData() : '';
    const work_lines = String(workText || '').split('\n')
      .map(s => (s.replace(/ /g, '').trim() === '') ? '' : s.trim());
    while (work_lines.length && work_lines[work_lines.length - 1] === '') work_lines.pop();
    const stk_tests = (typeof getStkTestsData === 'function' ? getStkTestsData() : []).map(t => ({
      device_name: t.device_name || '', price: t.price || 0, discount: t.discount || 0, included: !!t.included,
    }));
    const materials = (typeof getMaterialsData === 'function' ? getMaterialsData() : []).map(m => ({
      material_id: m.material_id || null, material_name: m.material_name || '', product_code: m.product_code || '',
      quantity: m.quantity || 1, unit_price: m.unit_price || 0, discount: m.discount || 0, included: !!m.included,
    }));
    const types = Array.from($('report-type')?.selectedOptions || [])
      .map(o => (o.value || o.text || '').trim()).filter(v => v && !v.includes('--'));
    return {
      work_lines, stk_tests, materials, work_types: types,
      installation_text: $('installation-text')?.value.trim() || '',
      remarks: $('remarks')?.value.trim() || '',
      suggested_title: $('report-custom-title')?.value.trim() || '',
      language: $('report-language')?.value || 'fr',
      checkedEquipment: Array.from(document.querySelectorAll('.eq-cb:checked')).map(cb => ({
        brand: (cb.dataset.brand || '').toLowerCase(), model: (cb.dataset.model || '').toLowerCase(),
      })),
    };
  }

  // ── ENREGISTRER COMME MODÈLE ──────────────────────────────────────────────
  async function openSaveAsTemplate() {
    await ensureScopeData();
    const c = currentReportContent();
    $('sat-name').value = c.suggested_title || '';
    $('sat-description').value = '';
    $('sat-lang').value = c.language || '';
    slimSatDevice ? slimSatDevice.setSelected('') : ($('sat-device').value = '');
    slimSatEquip ? slimSatEquip.setSelected('') : ($('sat-equipment').value = '');
    $('sat-shared').value = '1';
    $('sat-summary').innerHTML =
      `Sera enregistré : <strong>${c.work_lines.length}</strong> ligne(s) de travaux, ` +
      `<strong>${c.stk_tests.length}</strong> test(s) STK, <strong>${c.materials.length}</strong> pièce(s)` +
      (c.installation_text ? ', installation' : '') + (c.remarks ? ', remarques' : '') + '.' +
      (c.work_types.length ? `<br>Types repris : ${esc(c.work_types.join(', '))}.` : '');
    $('save-as-tpl-modal').classList.add('active');
    setTimeout(() => $('sat-name').focus(), 60);
  }

  async function submitSaveAsTemplate() {
    const c = currentReportContent();
    const name = $('sat-name').value.trim();
    if (!name) { if (window.toast) toast.error('Nom requis', 'Donnez un nom au modèle.'); return; }
    const payload = {
      name,
      description: $('sat-description').value.trim(),
      work_types: c.work_types,
      device_type: (slimSatDevice ? slimSatDevice.getSelected()[0] : $('sat-device').value) || null,
      equipment_catalog_id: (slimSatEquip ? slimSatEquip.getSelected()[0] : $('sat-equipment').value) || null,
      language: $('sat-lang').value || null,
      suggested_title: c.suggested_title,
      installation_text: c.installation_text,
      remarks: c.remarks,
      is_shared: $('sat-shared').value === '1',
      work_lines: c.work_lines,
      stk_tests: c.stk_tests,
      materials: c.materials,
    };
    const btn = $('sat-save-btn');
    btn.disabled = true;
    try {
      const r = await fetch('/api/report-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Enregistrement impossible.');
      if (window.toast) toast.success('Modèle créé', name);
      $('save-as-tpl-modal').classList.remove('active');
    } catch (e) {
      if (window.toast) toast.error('Erreur', e.message);
    } finally { btn.disabled = false; }
  }

  // ── APPLIQUER UN MODÈLE ──────────────────────────────────────────────────
  let aptTemplates = [];

  async function openApplyPicker() {
    $('apt-search').value = '';
    $('apt-list').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-tertiary)"><i class="fas fa-circle-notch fa-spin"></i></div>';
    $('apply-tpl-modal').classList.add('active');
    try {
      await ensureScopeData(); // charge aussi le catalogue matériel (contrôle de prix)
      // On récupère TOUS les modèles (pas de filtre langue serveur) : une langue
      // différente est signalée mais reste applicable.
      aptTemplates = await fetch('/api/report-templates').then(r => { if (!r.ok) throw new Error(); return r.json(); });
    } catch {
      $('apt-list').innerHTML = '<div style="padding:24px;text-align:center;color:var(--color-danger)">Chargement impossible.</div>';
      return;
    }
    renderApplyList();
  }

  function langMismatch(t, c) {
    return t.language && c.language && t.language !== c.language;
  }

  function scoreTemplate(t, c) {
    let s = 0;
    const tTypes = (t.work_types_list || []).map(x => x.toLowerCase());
    const rTypes = c.work_types.map(x => x.toLowerCase());
    if (tTypes.some(x => rTypes.includes(x))) s += 2;
    const eqLbl = [t.eq_brand, t.eq_model || t.eq_name].filter(Boolean).join(' ').toLowerCase();
    if (t.equipment_catalog_id && eqLbl && c.checkedEquipment.some(e =>
      (e.brand && eqLbl.includes(e.brand)) || (e.model && eqLbl.includes(e.model)))) s += 3;
    else if (t.device_type && c.checkedEquipment.some(e =>
      e.model && t.device_type.toLowerCase().split(/\s+/).some(w => w.length > 3 && e.model.includes(w)))) s += 1;
    if (t.language && c.language && t.language === c.language) s += 1;
    if (langMismatch(t, c)) s -= 2;
    s += Math.min(2, (t.usage_count || 0) / 10);
    return s;
  }

  function renderApplyList() {
    const c = currentReportContent();
    const q = $('apt-search').value.trim().toLowerCase();
    let list = aptTemplates.filter(t => !q || (t.name + ' ' + (t.description || '')).toLowerCase().includes(q));
    list = list.map(t => ({ t, score: scoreTemplate(t, c) })).sort((a, b) => b.score - a.score);

    if (!list.length) {
      $('apt-list').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-tertiary)">Aucun modèle. <a href="/report-templates.html" target="_blank">Créer un modèle</a>.</div>';
      return;
    }
    const suggested = list.filter(x => x.score >= 2);
    const others = list.filter(x => x.score < 2);
    const card = ({ t, score }) => {
      const scope = [
        ...(t.work_types_list || []).map(w => `<span class="apt-badge">${esc(w)}</span>`),
        t.equipment_catalog_id
          ? `<span class="apt-badge apt-machine">${esc([t.eq_brand, t.eq_model || t.eq_name].filter(Boolean).join(' '))}</span>`
          : (t.device_type ? `<span class="apt-badge apt-machine">${esc(t.device_type)}</span>` : ''),
      ].join('');
      const mismatch = langMismatch(t, c);
      return `
      <div class="apt-card">
        <div style="flex:1;min-width:0">
          <div style="font-weight:var(--font-semibold);color:var(--text-primary)">${esc(t.name)}
            ${score >= 5 ? '<span class="apt-badge apt-top">Pertinent</span>' : ''}
            ${mismatch ? `<span class="apt-badge" style="background:var(--color-warning-bg);color:var(--color-warning)"><i class="fas fa-triangle-exclamation"></i> Modèle en ${t.language.toUpperCase()}, rapport en ${(c.language || '').toUpperCase()}</span>` : ''}</div>
          ${t.description ? `<div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(t.description)}</div>` : ''}
          <div style="margin-top:4px">${scope || '<span class="apt-badge">Générique</span>'}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">
            ${(t.work_lines || []).length} travaux · ${(t.stk_tests || []).length} STK · ${(t.materials || []).length} pièces · par ${esc(t.author_name)} · utilisé ${t.usage_count || 0}×
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <button class="btn btn-sm btn-secondary" onclick="__aptPreview(${t.id})"><i class="fas fa-eye"></i> Aperçu</button>
          <button class="btn btn-sm btn-primary" onclick="__aptApply(${t.id})"><i class="fas fa-check"></i> Appliquer</button>
        </div>
      </div>
      <div id="apt-preview-${t.id}" class="apt-preview" style="display:none"></div>`;
    };
    $('apt-list').innerHTML =
      (suggested.length ? `<div class="apt-group">Suggérés pour ce rapport</div>${suggested.map(card).join('')}` : '') +
      (others.length ? `<div class="apt-group">Tous les modèles</div>${others.map(card).join('')}` : '');
  }

  window.__aptPreview = function (id) {
    const box = $(`apt-preview-${id}`);
    if (!box) return;
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    const t = aptTemplates.find(x => x.id === id);
    if (!t) return;
    box.innerHTML =
      ((t.work_lines || []).length ? `<strong>Travaux</strong><ul>${t.work_lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '') +
      ((t.stk_tests || []).length ? `<strong>Tests STK</strong><ul>${t.stk_tests.map(s => `<li>${esc(s.device_name)} — ${s.price} CHF${s.discount ? ` (-${s.discount}%)` : ''}${s.included ? ' · inclus' : ''}</li>`).join('')}</ul>` : '') +
      ((t.materials || []).length ? `<strong>Matériel</strong><ul>${t.materials.map(m => `<li>${esc(m.material_name)}${m.product_code ? ` [${esc(m.product_code)}]` : ''} ×${m.quantity} — ${m.unit_price} CHF</li>`).join('')}</ul>` : '') +
      (t.installation_text ? `<strong>Installation</strong><div>${esc(t.installation_text)}</div>` : '') +
      (t.remarks ? `<strong>Remarques</strong><div>${esc(t.remarks)}</div>` : '') +
      (t.suggested_title ? `<strong>Titre suggéré</strong><div>${esc(t.suggested_title)}</div>` : '');
    box.style.display = 'block';
  };

  window.__aptApply = function (id) {
    const t = aptTemplates.find(x => x.id === id);
    if (!t) return;
    const mode = currentAptMode(); // 'append' | 'replace'
    const replace = mode === 'replace';
    let added = 0;
    const priceDrift = []; // articles catalogue dont le prix a changé depuis la création du modèle
    const notes = [];

    const rowIsEmpty = (row, ...inputSels) =>
      !inputSels.some(sel => { const i = row.querySelector(sel); return i && i.value.trim() !== ''; });
    // Retire les lignes vides d'une section : la 1re ligne vide d'un rapport
    // neuf est ainsi remplacée par la 1re ligne du modèle, pas conservée.
    const dropEmptyRows = (rowSel, ...inputSels) =>
      document.querySelectorAll(rowSel).forEach(row => { if (rowIsEmpty(row, ...inputSels)) row.remove(); });

    // ── Type(s) de travaux ────────────────────────────────────────────────
    const tplTypes = t.work_types_list || [];
    if (tplTypes.length && typeof window.setSlimSelect === 'function' && $('report-type')) {
      const cur = Array.from($('report-type').selectedOptions).map(o => o.value);
      const next = replace ? [...tplTypes] : [...new Set([...cur, ...tplTypes])];
      window.setSlimSelect('report-type', next);
      const gained = next.filter(x => !cur.includes(x));
      if (gained.length) notes.push(`type(s) : ${gained.join(', ')}`);
    }

    // Travaux
    if (typeof addWorkRow === 'function') {
      if (replace) $('work-list').innerHTML = '';
      else dropEmptyRows('.work-item', '.work-line-input');
      const existing = new Set([...document.querySelectorAll('.work-line-input')].map(i => i.value.trim().toLowerCase()).filter(Boolean));
      (t.work_lines || []).forEach(l => {
        if (!replace && existing.has(l.trim().toLowerCase())) return;
        addWorkRow(l); added++;
      });
    }
    // STK
    if (typeof addStkTestRow === 'function') {
      if (replace) $('stk-tests-list').innerHTML = '';
      else dropEmptyRows('.stk-item', '.stk-name');
      const existing = new Set([...document.querySelectorAll('.stk-item .stk-name')].map(i => i.value.trim().toLowerCase()).filter(Boolean));
      (t.stk_tests || []).forEach(s => {
        if (!replace && existing.has((s.device_name || '').trim().toLowerCase())) return;
        addStkTestRow({ device_name: s.device_name, price: s.price, discount: s.discount, included: s.included });
        added++;
      });
    }
    // Matériel
    if (typeof addMaterialRow === 'function') {
      if (replace) $('materials-list').innerHTML = '';
      else dropEmptyRows('.draggable-item.grid-cols-material', '.material-name-input', '.material-code');
      {
        const existing = new Set([...document.querySelectorAll('.draggable-item.grid-cols-material .material-code')].map(i => i.value.trim().toLowerCase()).filter(Boolean));
        (t.materials || []).forEach(m => {
          if (!replace && m.product_code && existing.has(m.product_code.trim().toLowerCase())) return;
          // Contrôle de prix : si l'article est lié au catalogue et que le prix
          // catalogue diffère du prix figé dans le modèle, on applique le prix
          // catalogue actuel (facturation correcte) et on le signale.
          let unit = m.unit_price || 0;
          const cat = m.material_id ? materialsById.get(String(m.material_id)) : null;
          if (cat && cat.unit_price != null && Number(cat.unit_price) !== Number(m.unit_price || 0)) {
            priceDrift.push(`${m.material_name || m.product_code} : ${Number(m.unit_price || 0).toFixed(2)} → ${Number(cat.unit_price).toFixed(2)} CHF`);
            unit = Number(cat.unit_price);
          }
          addMaterialRow({
            material_id: m.material_id, material_name: m.material_name, product_code: m.product_code,
            quantity: m.quantity, unit_price: unit, discount: m.discount,
            total_price: unit * (m.quantity || 1) * (1 - (m.discount || 0) / 100),
            included: m.included,
          });
          added++;
        });
      }
    }
    // Textes
    const setText = (elId, val) => {
      const el = $(elId); if (!el || !val) return;
      if (replace) el.value = val;
      else el.value = el.value.trim() ? `${el.value.trim()}\n${val}` : val;
    };
    setText('installation-text', t.installation_text);
    setText('remarks', t.remarks);
    if (t.suggested_title && !$('report-custom-title').value.trim()) $('report-custom-title').value = t.suggested_title;

    if (typeof updateMaterialsTotal === 'function') { try { updateMaterialsTotal(); } catch {} }
    if (typeof calculateTotal === 'function') { try { calculateTotal(); } catch {} }
    fetch(`/api/report-templates/${id}/used`, { method: 'POST' }).catch(() => {});
    if (window.toast) {
      toast.success('Modèle appliqué', `« ${t.name} » — ${added} ligne(s) ajoutée(s)${notes.length ? ' · ' + notes.join(' · ') : ''}.`);
      if (priceDrift.length) {
        toast.warning
          ? toast.warning('Prix mis à jour depuis le catalogue', priceDrift.join(' · '))
          : toast.error('Prix mis à jour depuis le catalogue', priceDrift.join(' · '));
      }
    }
    $('apply-tpl-modal').classList.remove('active');
  };
})();
