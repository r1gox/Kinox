const js = require('@eslint/js');
const globals = require('globals');

// El front usa scripts clásicos que comparten funciones globales entre archivos
// (common.js -> home.js, detail.js, ...), así que no-undef y no-unused-vars se dejan
// fuera: producirían cientos de falsos positivos hasta que se migre a módulos ES.
const shared = {
  'no-undef': 'off',
  'no-unused-vars': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'off',
  eqeqeq: ['warn', 'smart'],
  // Heredados del código existente (inofensivos); se dejan como aviso para no tocar lógica sin pruebas.
  'no-useless-escape': 'warn',
  'no-redeclare': 'warn',
};

module.exports = [
  { ignores: ['node_modules/**', '.vercel/**', 'js/vendor/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, Hls: 'readonly' } },
    rules: shared,
  },
  {
    files: ['api/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.serviceworker } },
    rules: shared,
  },
  {
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: shared,
  },
];
