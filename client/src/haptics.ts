/**
 * Tactile vibration feedback for mobile browsers.
 * Safe no-op on desktop or unsupported devices.
 */
export function haptic(pattern: number | number[] = 25) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration permissions / unsupported errors
    }
  }
}
