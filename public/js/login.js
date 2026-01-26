// public/js/login.js

document.addEventListener('DOMContentLoaded', () => {
  // --- NOUVEAU : Vérification auto-login ---
  // On demande au serveur "Suis-je déjà connecté ?"
  fetch('/api/me')
    .then(response => {
      if (response.ok) {
        // Si oui, on redirige immédiatement vers le dashboard
        window.location.href = '/dashboard.html';
      }
    })
    .catch(err => console.log("Non connecté"));
  const form = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  const togglePassword = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');
  const forgotLink = document.getElementById('forgot-password-link');

  // Toggle password visibility
  togglePassword.addEventListener('click', () => {
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      togglePassword.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
      passwordInput.type = 'password';
      togglePassword.innerHTML = '<i class="fas fa-eye"></i>';
    }
  });

  // Handle forgot password link
  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    alert(
      'Fonctionnalité à venir. Contactez un administrateur pour réinitialiser votre mot de passe.'
    );
  });

  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessage.classList.add('hidden');

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnContent = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember })
      });

      const data = await response.json();

      if (response.ok) {
        // Success animation
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Connecté !';
        submitBtn.style.background = 'var(--color-success)';
        
        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 500);
      } else {
        errorText.textContent = data.error || 'Erreur de connexion';
        errorMessage.classList.remove('hidden');
        
        submitBtn.innerHTML = originalBtnContent;
        submitBtn.disabled = false;
        
        // Shake animation
        form.style.animation = 'shake 0.5s';
        setTimeout(() => {
          form.style.animation = '';
        }, 500);
      }
    } catch (error) {
      errorText.textContent = 'Erreur de connexion au serveur';
      errorMessage.classList.remove('hidden');
      
      submitBtn.innerHTML = originalBtnContent;
      submitBtn.disabled = false;
    }
  });
});

// Shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
  }
`;
document.head.appendChild(style);