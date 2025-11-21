document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('id');
  
  if (!reportId) {
    alert('Aucun rapport spécifié');
    window.close();
    return;
  }
  
  await loadReport(reportId);
});

async function loadReport(reportId) {
  try {
    const response = await fetch(`/api/reports/${reportId}`);
    
    if (!response.ok) {
      throw new Error('Rapport non trouvé');
    }
    
    const report = await response.json();
    renderReport(report);
    
  } catch (error) {
    console.error('Erreur chargement rapport:', error);
    alert('Erreur lors du chargement du rapport');
    window.close();
  }
}

function renderReport(report) {
  // Titre
  const titles = {
    'Mise en marche': 'Rapport de mise<br>en marche',
    'Service d\'entretien': 'Rapport de service<br>d\'entretien',
    'Montage': 'Rapport de<br>montage',
    'Réparation': 'Rapport de<br>réparation',
    'Contrôle': 'Rapport de<br>contrôle',
    'Instruction': 'Rapport<br>d\'instruction',
    'Réparation / Garantie': 'Rapport de réparation<br>/ Garantie',
    'Première validation': 'Rapport de première<br>validation EN 13060',
    'Re-validation': 'Rapport de re-validation<br>EN 13060'
  };
  
  document.getElementById('report-title-text').innerHTML = titles[report.work_type] || 'Rapport de service<br>d\'entretien';
  
  // Informations client
  document.getElementById('client-name').textContent = report.cabinet_name;
  document.getElementById('client-address').textContent = report.address;
  document.getElementById('client-city').textContent = `${report.postal_code || ''} ${report.city}`.trim();
  document.getElementById('client-interlocutor').textContent = report.interlocutor || '';
  
  // Travaux
  const workTypes = [
    'Mise en marche',
    'Réparation',
    'Réparation / Garantie',
    'Service d\'entretien',
    'Contrôle',
    'Première validation',
    'Montage',
    'Instruction',
    'Re-validation'
  ];
  
  document.getElementById('work-types').innerHTML = workTypes.map(type => `
    <div class="work-item">
      <span class="checkbox ${report.work_type === type ? 'checked' : ''}"></span>
      <span>${type}</span>
    </div>
  `).join('');
  
  // Installation
  document.getElementById('installation').textContent = report.installation || '';
  
  // Intervenants
  renderTechnicians(report.technicians || []);
  
  // Travaux réalisés
  document.getElementById('work-done').textContent = report.work_accomplished || '';
  
  // Tests STK
  renderSTK(report.stk_tests || []);
  
  // Matériel
  renderMaterials(report.materials || []);
  
  // Frais
  document.getElementById('travel-location').textContent = report.travel_location || '';
  if (report.travel_included) {
    document.getElementById('travel-incl').textContent = 'Incl.';
    document.getElementById('travel-amount').textContent = 'Incl.';
  } else {
    const cost = parseFloat(report.travel_costs) || 0;
    document.getElementById('travel-incl').textContent = 'Incl.';
    document.getElementById('travel-amount').textContent = cost > 0 ? cost.toFixed(2) : 'Incl.';
  }
  
  // Total
  const matTotal = (report.materials || []).reduce((s, m) => s + (parseFloat(m.total_price) || 0), 0);
  const stkTotal = (report.stk_tests || []).reduce((s, t) => t.included ? s : s + (parseFloat(t.price) || 0), 0);
  const travelTotal = report.travel_included ? 0 : (parseFloat(report.travel_costs) || 0);
  document.getElementById('grand-total').textContent = (matTotal + stkTotal + travelTotal).toFixed(2);
  
  // Commentaires
  document.getElementById('comments').textContent = report.remarks || '';
  
  // Signatures
  document.getElementById('tech-date').textContent = report.technician_signature_date ? formatDate(report.technician_signature_date) : '';
  document.getElementById('tech-signature').textContent = report.technician_signature || '';
  document.getElementById('client-date').textContent = report.client_signature_date ? formatDate(report.client_signature_date) : '';
  document.getElementById('client-signature').textContent = report.client_signature || '';
}

function renderTechnicians(technicians) {
  const tbody = document.getElementById('tech-tbody');
  
  if (technicians.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align: center;">Aucun intervenant</td></tr>';
    return;
  }
  
  const grouped = {};
  technicians.forEach(t => {
    if (!grouped[t.technician_name]) grouped[t.technician_name] = [];
    grouped[t.technician_name].push(t);
  });
  
  let totalNormal = 0;
  let totalExtra = 0;
  
  const rows = Object.entries(grouped).map(([name, techs]) => {
    const dates = techs.map(t => new Date(t.work_date)).sort((a, b) => a - b);
    const minDate = formatDateShort(dates[0]);
    const maxDate = formatDateShort(dates[dates.length - 1]);
    
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((_, i) => {
      const has = techs.some(t => {
        const d = new Date(t.work_date);
        return (d.getDay() + 6) % 7 === i;
      });
      return `<td>${has ? 'X' : ''}</td>`;
    }).join('');
    
    const normal = techs.reduce((s, t) => s + (parseFloat(t.hours_normal) || 0), 0);
    const extra = techs.reduce((s, t) => s + (parseFloat(t.hours_extra) || 0), 0);
    
    totalNormal += normal;
    totalExtra += extra;
    
    return `
      <tr>
        <td class="name-cell">${name}</td>
        <td>${minDate}</td>
        <td>${maxDate}</td>
        ${days}
        <td>${normal.toFixed(0)}</td>
        <td>${extra > 0 ? extra.toFixed(0) : ''}</td>
      </tr>
    `;
  }).join('');
  
  tbody.innerHTML = rows + `
    <tr class="total-row">
      <td colspan="3">TOTAL</td>
      <td colspan="7"></td>
      <td>${totalNormal.toFixed(0)}</td>
      <td>${totalExtra > 0 ? totalExtra.toFixed(2) : ''}</td>
    </tr>
  `;
}

function renderSTK(tests) {
  if (!tests || tests.length === 0) return;
  
  const table = document.getElementById('stk-table');
  const tbody = document.getElementById('stk-tbody');
  
  table.style.display = 'table';
  tbody.innerHTML = tests.map(t => {
    const price = t.included ? 'Incl.' : (parseFloat(t.price) || 0).toFixed(2);
    return `
      <tr>
        <td colspan="3">${t.test_name}</td>
        <td class="right">${price}</td>
        <td class="right">${price}</td>
      </tr>
    `;
  }).join('');
}

function renderMaterials(materials) {
  const tbody = document.getElementById('materials-tbody');
  
  if (!materials || materials.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Aucun matériel</td></tr>';
    return;
  }
  
  tbody.innerHTML = materials.map(m => {
    const total = m.included ? 'Incl.' : (parseFloat(m.total_price) || 0).toFixed(2);
    return `
      <tr>
        <td class="center">${m.quantity}x</td>
        <td>${m.product_code || ''}</td>
        <td>${m.material_name}</td>
        <td class="right">${(parseFloat(m.unit_price) || 0).toFixed(2)}</td>
        <td class="right">${total}</td>
      </tr>
    `;
  }).join('');
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatDateShort(d) {
  if (!d) return '';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function pad(n) {
  return n < 10 ? '0' + n : n;
}