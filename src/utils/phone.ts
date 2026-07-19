export function normalizePhone(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) {
    return trimmed;
  }

  // US local and NANP normalization to E.164-like form.
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Convert international 00-prefix to + prefix when possible.
  if (digits.startsWith('00') && digits.length > 2) {
    return `+${digits.slice(2)}`;
  }

  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }

  // Preserve very short extension-like values; otherwise canonicalize as +digits.
  return digits.length < 7 ? trimmed : `+${digits}`;
}