export function parseApiError(e, fallback = 'Something went wrong. Please try again.') {
  if (!e.response) return 'Network error. Please check your connection.';
  const { status, data } = e.response;
  if (status === 403) return 'You are not authorized to perform this action.';
  if (status === 404) return 'The requested resource was not found.';
  if (status >= 500) return 'A server error occurred. Please try again.';
  // 400 — extract Django DRF validation details
  if (data) {
    if (typeof data === 'string') return data;
    const detail = data.detail ?? data.error ?? data.non_field_errors?.[0];
    if (detail) return Array.isArray(detail) ? detail[0] : String(detail);
    const msgs = Object.values(data).flat().filter(v => typeof v === 'string');
    if (msgs.length) return msgs.join(' ');
  }
  return fallback;
}
