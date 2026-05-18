// public/js/theme-switcher.js
// KB Med Design System - Theme Switcher (Dark/Light Mode)

class ThemeSwitcher {
  constructor() {
    this.theme = this.getStoredTheme() || this.getPreferredTheme();
    this.init();
  }

  init() {
    // Applique le thème au chargement
    this.applyTheme(this.theme);

    // Écoute les changements de préférence système
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  getPreferredTheme() {
    // Détecte la préférence système
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  getStoredTheme() {
    // Récupère le thème sauvegardé
    return localStorage.getItem('theme');
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.theme = theme;
    this.updateToggleButton();
  }

  toggle() {
    const newTheme = this.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  }

  updateToggleButton() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    const icon = toggleBtn.querySelector('i');
    if (!icon) return;

    if (this.theme === 'dark') {
      icon.className = 'fas fa-sun';
      toggleBtn.setAttribute('aria-label', 'Activer le mode clair');
      toggleBtn.setAttribute('title', 'Mode clair');
    } else {
      icon.className = 'fas fa-moon';
      toggleBtn.setAttribute('aria-label', 'Activer le mode sombre');
      toggleBtn.setAttribute('title', 'Mode sombre');
    }
  }

  setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') {
      console.error('Theme must be "dark" or "light"');
      return;
    }
    this.applyTheme(theme);
    localStorage.setItem('theme', theme);
  }
}

// Instance globale
window.themeSwitcher = new ThemeSwitcher();

// Helper pour toggle depuis n'importe où
window.toggleTheme = () => window.themeSwitcher.toggle();