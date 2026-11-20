const KEY = 'slide-narrator-access-code';

/** The access code lives in this tab's session storage only, and is gone when the tab closes. */
export function getAccessCode(): string {
  try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

export function setAccessCode(code: string) {
  try {
    if (code) sessionStorage.setItem(KEY, code);
    else sessionStorage.removeItem(KEY);
  } catch {}
}

export function accessHeaders(): Record<string, string> {
  const code = getAccessCode();
  return code ? { 'x-access-code': code } : {};
}
