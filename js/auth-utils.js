/* Utilidades puras de la pantalla de cuenta (se pueden probar sin navegador). */
function mzEmailValid(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s == null ? '' : s).trim());
}

// Nivel 0 = vacía · 1 = muy corta o muy común · 2 = aceptable · 3 = buena · 4 = fuerte
function mzPasswordStrength(pw) {
  pw = String(pw == null ? '' : pw);
  if (!pw) return { level: 0, label: '', ok: false };
  if (pw.length < 8) return { level: 1, label: 'Muy corta', ok: false };
  if (/^(12345678|123456789|1234567890|password|contraseña|contrasena|qwertyui|qwerty123|11111111|abcdefgh|iloveyou)/i.test(pw)) {
    return { level: 1, label: 'Muy común', ok: false };
  }
  var points =
    (/[a-z]/.test(pw) && /[A-Z]/.test(pw) ? 1 : 0) +
    (/\d/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0) +
    (pw.length >= 12 ? 1 : 0);
  if (points <= 1) return { level: 2, label: 'Aceptable', ok: true };
  if (points === 2) return { level: 3, label: 'Buena', ok: true };
  return { level: 4, label: 'Fuerte', ok: true };
}
