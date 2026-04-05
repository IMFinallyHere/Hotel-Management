import dayjs from 'dayjs';

// Convert configurations array → {key: value} map
export function parseConfigs(configs) {
  return Object.fromEntries((configs || []).map(c => [c.key, c.value]));
}

// Compute overtime state from a stay log + configMap
export function isLogOvertime(log) {
  if (!log?.expected_checkout) return false;
  const now = dayjs();
  if (now.isBefore(dayjs(log.expected_checkout))) return false;
  if (log.grace_until && now.isBefore(dayjs(log.grace_until))) return false;
  return true;
}

// Compute overtime fee (flat = one nightly rate)
export function computeOvertimeFee(log) {
  if (!isLogOvertime(log) || log.is_nc || !log.overtime_rate) return 0;
  return Number(log.overtime_rate);
}

// Compute GST on room charges only (nightly rate × nights + extra bed × nights)
// When gst_inclusive, GST is extracted from the price (already included), not added on top.
export function computeGst(log, nights, gstPercent) {
  if (!log?.gst_applied || log.is_nc) return 0;
  const rate = Number(gstPercent ?? 0) / 100;
  const roomBase = (Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)) * nights;
  if (log.gst_inclusive) {
    return Math.round(roomBase * rate / (1 + rate));
  }
  return Math.round(roomBase * rate);
}
