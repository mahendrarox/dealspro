/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX).
 * Handles: "2145551234", "+12145551234", "12145551234", "(214) 555-1234"
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Already has country code or unusual format — best effort
  return digits.startsWith("+") ? raw.trim() : `+${digits}`;
}
