import dayjs from 'dayjs';

// Convert configurations array → {key: value} map
export function parseConfigs(configs) {
  return Object.fromEntries((configs || []).map(c => [c.key, c.value]));
}

// GST rate (%) for a stay: the rate saved on the stay at check-in, else the current config
export function stayGstPercent(log, configMap) {
  return log?.gst_percent ?? configMap?.['gst_percent'] ?? 0;
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

// Compute GST on room charges (nightly rate × nights + extra bed × nights) plus amenities
// When gst_inclusive, GST is extracted from the price (already included), not added on top.
export function computeGst(log, nights, gstPercent, amenityTotal = 0) {
  if (!log?.gst_applied || log.is_nc) return 0;
  const rate = Number(gstPercent ?? 0) / 100;
  const roomBase = (Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)) * nights;
  const base = roomBase + amenityTotal;
  if (log.gst_inclusive) {
    return Math.round(base * rate / (1 + rate));
  }
  return Math.round(base * rate);
}
