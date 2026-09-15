// Accessibility settings: high-contrast mode for glare / TV visibility

let highContrast = typeof localStorage !== 'undefined' && localStorage.getItem('monopoly.highContrast') === '1';

if (typeof document !== 'undefined' && highContrast) {
  document.documentElement.classList.add('high-contrast');
}

export function isHighContrast() {
  return highContrast;
}

export function setHighContrast(enabled: boolean) {
  highContrast = enabled;
  try {
    localStorage.setItem('monopoly.highContrast', enabled ? '1' : '0');
  } catch {
    /* noop */
  }
  if (typeof document !== 'undefined') {
    if (enabled) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  }
}
