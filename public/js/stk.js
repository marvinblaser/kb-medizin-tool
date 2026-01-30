// public/js/stk.js

// 1. CONFIGURATION PDF.JS
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let pdfDoc = null;
let pdfBytes = null;
let viewZoom = 1.0; 
let isTextTool = false;
let selectedEl = null;
let currentUser = null;

// Éléments DOM
const container = document.getElementById('pdf-wrapper');
const workspace = document.getElementById('workspace');
const emptyState = document.getElementById('empty-state');
const ctxMenu = document.getElementById('context-menu');

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    
    // Listeners Drag & Drop
    workspace.addEventListener('dragover', (e) => { e.preventDefault(); workspace.classList.add('drag-over'); });
    workspace.addEventListener('dragleave', () => workspace.classList.remove('drag-over'));
    workspace.addEventListener('drop', handleDrop);
    
    // Listener Input Fichier
    document.getElementById('file-input').addEventListener('change', (e) => {
        if(e.target.files[0]) loadFile(e.target.files[0]);
    });

    // Désélectionner au clic dehors
    window.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.element-wrapper') && !e.target.closest('#context-menu') && 
            !e.target.closest('.stk-toolbar') && !e.target.closest('#zoom-controls')) {
            deselectAll();
        }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    });
});

// --- AUTHENTIFICATION ---
async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) window.location.href = '/login.html';
        const d = await res.json();
        currentUser = d.user;
        document.getElementById('user-info').innerHTML = `
            <div class="user-avatar">${d.user.name[0]}</div>
            <div class="user-details">
                <strong>${escapeHtml(d.user.name)}</strong>
                <span>${d.user.role}</span>
            </div>`;
        if (d.user.role === 'admin') document.getElementById('admin-link').classList.remove('hidden');
    } catch { window.location.href = '/login.html'; }
}

// --- LOGIQUE PDF ---

async function loadFile(file) {
    document.getElementById('filename-display').innerText = file.name;
    pdfBytes = await file.arrayBuffer();
    
    const task = pdfjsLib.getDocument(pdfBytes.slice(0));
    pdfDoc = await task.promise;
    
    // On charge la page 1 (ou adapter pour multipages plus tard)
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 }); // Qualité de base

    const canvas = document.getElementById('pdf-render');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    container.style.width = viewport.width + 'px';
    container.style.height = viewport.height + 'px';

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    
    emptyState.style.display = 'none';
    container.style.display = 'block';
    
    // Reset zoom
    viewZoom = 1.0;
    updateZoom(0);
}

function updateZoom(delta) {
    viewZoom += delta;
    if(viewZoom < 0.5) viewZoom = 0.5;
    if(viewZoom > 3.0) viewZoom = 3.0;
    
    container.style.transform = `scale(${viewZoom})`;
    document.getElementById('zoom-level').innerText = Math.round(viewZoom * 100) + '%';
    
    // Mise à jour de la position du menu contextuel s'il est ouvert
    if(selectedEl) updateContextMenu();
}

// --- DRAG & DROP & ELEMENTS ---

async function handleDrop(e) {
    e.preventDefault();
    workspace.classList.remove('drag-over');
    
    // Si c'est un fichier PDF
    if (e.dataTransfer.files.length > 0 && e.dataTransfer.files[0].type === 'application/pdf') {
        loadFile(e.dataTransfer.files[0]);
        return;
    }
    
    // Si c'est une image (Signature)
    const src = e.dataTransfer.getData("src");
    if (src) {
        if(!pdfDoc) return alert("Ouvrez un PDF d'abord !");
        const rect = container.getBoundingClientRect();
        // Calcul des coordonnées relatives au PDF zoomé
        const x = (e.clientX - rect.left) / viewZoom;
        const y = (e.clientY - rect.top) / viewZoom;
        spawnImage(x, y, src);
    }
}

function handleDragStart(e) {
    e.dataTransfer.setData("src", e.target.querySelector('img').src);
}

// Outil Texte
function activateTextTool() {
    if(!pdfDoc) return alert("Ouvrez un rapport d'abord !");
    isTextTool = true;
    document.getElementById('btn-text').classList.add('btn-primary');
    document.getElementById('btn-text').classList.remove('btn-secondary');
    container.style.cursor = 'text';
}

container.addEventListener('mousedown', (e) => {
    if (isTextTool && e.target.id === 'pdf-render') {
        const rect = container.getBoundingClientRect();
        const x = (e.clientX - rect.left) / viewZoom;
        const y = (e.clientY - rect.top) / viewZoom;
        spawnText(x, y);
        
        isTextTool = false;
        const btn = document.getElementById('btn-text');
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        container.style.cursor = 'default';
    }
});

// Création Élément Texte
function spawnText(x, y) {
    const wrapper = document.createElement('div');
    wrapper.className = 'element-wrapper';
    wrapper.style.left = x + 'px';
    wrapper.style.top = y + 'px';
    wrapper.dataset.type = 'text';
    
    const content = document.createElement('div');
    content.className = 'text-content';
    content.innerText = "Texte";
    content.style.fontSize = "16px";
    content.style.color = "#000000";
    content.dataset.size = "16";
    
    wrapper.appendChild(content);
    container.appendChild(wrapper);
    
    setupEvents(wrapper);
    selectElement(wrapper);
    enterEditMode(wrapper);
}

// Création Élément Image
function spawnImage(x, y, src) {
    const wrapper = document.createElement('div');
    wrapper.className = 'element-wrapper image-wrapper';
    wrapper.style.width = '150px';
    wrapper.style.height = '60px';
    wrapper.style.left = (x - 75) + 'px'; // Centrer
    wrapper.style.top = (y - 30) + 'px';
    wrapper.dataset.type = 'image';
    
    const img = document.createElement('img');
    img.src = src;
    wrapper.appendChild(img);
    
    container.appendChild(wrapper);
    setupEvents(wrapper);
    selectElement(wrapper);
}

function setupEvents(el) {
    el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (el.classList.contains('editing')) return;
        selectElement(el);
        initDrag(e, el);
    });
    
    if (el.dataset.type === 'text') {
        el.addEventListener('dblclick', (e) => { 
            e.stopPropagation(); 
            enterEditMode(el); 
        });
    }
}

function selectElement(el) {
    deselectAll();
    selectedEl = el;
    el.classList.add('selected');
    updateContextMenu();
}

function deselectAll() {
    if (selectedEl && selectedEl.dataset.type === 'text') {
        const content = selectedEl.querySelector('.text-content');
        content.contentEditable = false;
        selectedEl.classList.remove('editing');
        if (content.innerText.trim() === "") selectedEl.remove();
    }
    document.querySelectorAll('.element-wrapper').forEach(e => {
        e.classList.remove('selected');
        e.classList.remove('editing');
    });
    selectedEl = null;
    ctxMenu.style.display = 'none';
}

function enterEditMode(el) {
    const content = el.querySelector('.text-content');
    content.contentEditable = true;
    el.classList.add('editing');
    el.classList.remove('selected');
    content.focus();
    
    // Sélectionner tout le texte
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(content);
    sel.removeAllRanges();
    sel.addRange(range);
    
    ctxMenu.style.display = 'none';
}

function initDrag(e, el) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = el.offsetLeft;
    const startTop = el.offsetTop;
    
    const onMove = (ev) => {
        const dx = (ev.clientX - startX) / viewZoom;
        const dy = (ev.clientY - startY) / viewZoom;
        el.style.left = (startLeft + dx) + 'px';
        el.style.top = (startTop + dy) + 'px';
        updateContextMenu();
    };
    
    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    };
    
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

// --- CONTEXT MENU & MODIFICATIONS ---

function updateContextMenu() {
    if (!selectedEl) return;
    
    document.getElementById('ctx-text-tools').style.display = (selectedEl.dataset.type === 'text') ? 'flex' : 'none';
    document.getElementById('ctx-image-tools').style.display = (selectedEl.dataset.type === 'image') ? 'flex' : 'none';
    
    ctxMenu.style.display = 'flex';
    
    const rect = selectedEl.getBoundingClientRect();
    // Positionner le menu juste au dessus de l'élément
    ctxMenu.style.left = (rect.left + rect.width/2 - ctxMenu.offsetWidth/2) + 'px';
    ctxMenu.style.top = (rect.top - 50) + 'px';
}

window.changeFontSize = (d) => {
    if (selectedEl?.dataset.type === 'text') {
        const c = selectedEl.querySelector('.text-content');
        let s = parseInt(c.dataset.size) + d;
        if(s<8) s=8;
        c.style.fontSize = s + 'px';
        c.dataset.size = s;
        updateContextMenu();
    }
};

window.changeColor = (hex) => {
    if (selectedEl?.dataset.type === 'text') {
        selectedEl.querySelector('.text-content').style.color = hex;
    }
};

window.changeImageSize = (factor) => {
    if (selectedEl?.dataset.type === 'image') {
        const w = selectedEl.offsetWidth * factor;
        const h = selectedEl.offsetHeight * factor;
        selectedEl.style.width = w + 'px';
        selectedEl.style.height = h + 'px';
        updateContextMenu();
    }
};

window.deleteElement = () => {
    if(selectedEl) selectedEl.remove();
    deselectAll();
};

// --- SAUVEGARDE (EXPORT PDF) ---

window.savePdf = async () => {
    if(!pdfBytes) return alert("Aucun rapport à signer.");
    deselectAll();
    
    const { PDFDocument, rgb } = PDFLib;
    const doc = await PDFDocument.load(pdfBytes);
    const page = doc.getPages()[0]; // Pour l'instant page 1 seulement
    const { width, height } = page.getSize();
    
    // Dimensions affichées (CSS)
    const domW = parseFloat(container.style.width);
    const domH = parseFloat(container.style.height);
    
    // Facteurs d'échelle (PDF vs Écran)
    const scaleX = width / domW;
    const scaleY = height / domH;

    for(const el of document.querySelectorAll('.element-wrapper')) {
        const x = parseFloat(el.style.left) * scaleX;
        const elW = el.offsetWidth * scaleX;
        const elH = el.offsetHeight * scaleY;
        // En PDF, l'origine Y est en bas, en HTML en haut
        const pdfY = height - (parseFloat(el.style.top) * scaleY) - elH;

        if (el.dataset.type === 'image') {
            const img = el.querySelector('img');
            const b = await fetch(img.src).then(r => r.arrayBuffer());
            const emb = await doc.embedPng(b);
            page.drawImage(emb, { x, y: pdfY, width: elW, height: elH });
        } else {
            const c = el.querySelector('.text-content');
            const fs = parseInt(c.dataset.size) * scaleX;
            const txt = c.innerText;
            const colorHex = c.style.color || 'rgb(0, 0, 0)';
            
            // Conversion basique Hex -> RGB (à améliorer si besoin)
            let color = rgb(0,0,0);
            if(colorHex.includes('rgb')) {
                const vals = colorHex.match(/\d+/g);
                if(vals) color = rgb(vals[0]/255, vals[1]/255, vals[2]/255);
            }

            page.drawText(txt, { 
                x: x + (2*scaleX), // petit offset padding
                y: pdfY + elH - (fs*0.9), // ajustement baseline approximatif
                size: fs, 
                color: color 
            });
        }
    }
    
    const pdfBytesSaved = await doc.save();
    const originalName = document.getElementById('filename-display').innerText;
    const newName = originalName.replace('.pdf', '_signed.pdf');

    // Téléchargement
    const blob = new Blob([pdfBytesSaved], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = newName;
    link.click();
};

function escapeHtml(t){if(!t)return'';return t.toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}