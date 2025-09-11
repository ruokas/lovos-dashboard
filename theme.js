(function() {
  const KEY = 'theme';
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  function apply(t) {
    root.classList.toggle('dark', t === 'dark');
    if (btn) btn.textContent = t === 'dark' ? 'Šviesi tema' : 'Tamsi tema';
  }
  const stored = localStorage.getItem(KEY) || 'light';
  apply(stored);
  if (btn) {
    btn.addEventListener('click', () => {
      const next = root.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      apply(next);
    });
  }
})();
