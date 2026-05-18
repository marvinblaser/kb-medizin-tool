// server/utils/validators.js
// Helpers de validation réutilisables dans toutes les routes.

/** Vérifie qu'une valeur est une chaîne non vide. */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Vérifie un format email basique. */
function isValidEmail(v) {
  if (typeof v !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Convertit en entier strict (rejette NaN). */
function toInt(v, fallback = null) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Convertit en nombre flottant strict. */
function toFloat(v, fallback = null) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Convertit truthy/falsy en 0/1 pour SQLite. */
function toBoolInt(v) {
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  return 0;
}

/** Force une valeur dans une liste autorisée, sinon fallback. */
function pickFrom(value, allowed, fallback = null) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * Vérifie que tous les champs requis sont présents et non vides.
 * Retourne null si OK, sinon un message d'erreur.
 *
 * Usage : const err = requireFields(req.body, ['cabinet_name', 'city']);
 *         if (err) return res.status(400).json({ error: err });
 */
function requireFields(body, fields) {
  if (!body || typeof body !== 'object') return 'Données manquantes.';
  for (const f of fields) {
    if (!isNonEmptyString(body[f])) {
      return `Le champ "${f}" est requis.`;
    }
  }
  return null;
}

module.exports = {
  isNonEmptyString,
  isValidEmail,
  toInt,
  toFloat,
  toBoolInt,
  pickFrom,
  requireFields,
};
