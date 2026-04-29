import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import dayjs from 'dayjs';
import SegoeUiRegular from '../assets/fonts/segoeui.ttf';
import SegoeUiBold from '../assets/fonts/segoeuib.ttf';

Font.register({
  family: 'SegoeUIPdf',
  fonts: [
    { src: SegoeUiRegular, fontWeight: 400 },
    { src: SegoeUiBold, fontWeight: 700 },
  ],
});

const NAVY   = '#1e3a6e';
const NAVY_LIGHT = '#eef2f9';
const TEXT   = '#1a1a1a';
const MUTED  = '#777777';
const BORDER = '#c8d3e8';
const RED    = '#dc2626';
const GREEN  = '#16a34a';

const B = { fontFamily: 'SegoeUIPdf', fontWeight: 700 };

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 28,
    color: TEXT,
    backgroundColor: '#ffffff',
  },

  // ── Header ──
  hotelName: { ...B, fontSize: 26, color: NAVY, textAlign: 'center', marginBottom: 5 },
  contactRow: { fontSize: 8.5, color: MUTED, textAlign: 'center', marginBottom: 2 },
  divider: { borderBottom: `1.5px solid ${BORDER}`, marginTop: 10, marginBottom: 14 },

  // ── Paid By / RECEIPT ──
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  paidByLabel: { ...B, fontSize: 9.5, color: NAVY, marginBottom: 3 },
  paidByText: { fontSize: 9.5, color: TEXT, marginBottom: 1 },
  receiptTitle: { ...B, fontSize: 22, color: NAVY, letterSpacing: 2 },

  // ── Booking Details ──
  bookingSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  bookingLeft: { flex: 1 },
  bookingLabel: { ...B, fontSize: 9.5, color: NAVY, marginBottom: 5 },
  kvRow: { flexDirection: 'row', marginBottom: 3 },
  kvKey: { width: 90, fontSize: 9, color: TEXT },
  kvVal: { flex: 1, fontSize: 9, color: TEXT },
  metaBlock: { alignItems: 'flex-end', paddingTop: 18 },
  metaRow: { flexDirection: 'row', marginBottom: 5, alignItems: 'baseline' },
  metaKey: { ...B, fontSize: 9, color: NAVY, marginRight: 8 },
  metaVal: { fontSize: 9, color: TEXT, width: 75, textAlign: 'right' },

  // ── Table wrapper ──
  tableWrap: { border: `1px solid ${BORDER}`, marginBottom: 3 },

  // Table header row
  tHead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8 },
  tHeadText: { ...B, color: '#ffffff', fontSize: 9 },
  // Qty header is left-aligned; body qty cells are right-aligned
  tHeadQty: { width: 50, paddingRight: 12 },

  // Table body rows
  tRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottom: `1px solid ${BORDER}` },
  tRowLast: { borderBottom: 'none' },

  // Column widths
  cQty:   { width: 50, textAlign: 'right', paddingRight: 12 },
  cDesc:  { flex: 1 },
  cPrice: { width: 88, textAlign: 'right', paddingRight: 12 },
  cAmt:   { width: 78, textAlign: 'right' },

  tCell: { fontSize: 9, color: TEXT },
  tMuted: { fontSize: 9, color: MUTED },

  // Summary rows (subtotal / tax / total etc.)
  sRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderBottom: `1px solid ${BORDER}` },
  sLabel: { width: 88, fontSize: 9, color: TEXT, textAlign: 'right', paddingRight: 12 },
  sValue: { width: 78, fontSize: 9, textAlign: 'right', fontFamily: 'SegoeUIPdf' },

  // Total row (highlighted)
  totalRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: NAVY_LIGHT },
  totalLabel: { ...B, width: 88, fontSize: 10, color: NAVY, textAlign: 'right', paddingRight: 12 },
  totalValue: { ...B, width: 78, fontSize: 10, color: NAVY, textAlign: 'right', fontFamily: 'SegoeUIPdf' },

  taxNote: { fontSize: 7.5, color: MUTED, textAlign: 'right', marginBottom: 14 },

  // Payments received
  payHead: { ...B, fontSize: 8.5, color: NAVY, letterSpacing: 0.5, marginBottom: 4 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: `1px solid ${BORDER}` },
  payLabel: { fontSize: 8.5, color: TEXT, flex: 4 },
  payAmt: { fontSize: 8.5, textAlign: 'right', flex: 1, fontFamily: 'SegoeUIPdf' },

  // Notes
  notesLabel: { ...B, fontSize: 9.5, color: NAVY, marginTop: 14, marginBottom: 3 },
  notesText: { fontSize: 9, color: TEXT },

  money: { fontFamily: 'SegoeUIPdf' },
});

function KV({ label, value }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kvKey}>{label}</Text>
      <Text style={s.kvVal}>{value}</Text>
    </View>
  );
}

function SRow({ label, value, isTotal, valueColor }) {
  if (isTotal) {
    return (
      <View style={s.totalRow}>
        <View style={{ flex: 1 }} />
        <Text style={s.totalLabel}>{label}</Text>
        <Text style={[s.totalValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      </View>
    );
  }
  return (
    <View style={s.sRow}>
      <View style={{ flex: 1 }} />
      <Text style={s.sLabel}>{label}</Text>
      <Text style={[s.sValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export default function InvoiceDocument({ log, roomNumber, roomTypeName, configMap, nights }) {
  const rawCurrency = String(configMap?.currency_symbol ?? '').trim();
  const blockedCurrencySymbols = new Set(['', "'", '*', '-', '.']);
  const cur = blockedCurrencySymbols.has(rawCurrency) ? '₹' : rawCurrency;

  const hotelName    = configMap?.hotel_name    || 'Hotel';
  const hotelAddress = configMap?.hotel_address || '';
  const hotelPhone   = configMap?.hotel_phone   || '';
  const hotelEmail   = configMap?.hotel_email   || '';
  const gstPercent   = Number(configMap?.gst_percent ?? 0);

  const fmt = (n) => `${cur}${Number(n).toLocaleString('en-IN')}`;

  const guests    = log.customers || [];
  const mainGuest = guests[0] || {};
  const genderMap = { male: 'Male', female: 'Female', trans: 'Trans', other: 'Other' };
  const guestGender = mainGuest.gender ? genderMap[mainGuest.gender] : null;
  const guestAge    = mainGuest.age ?? null;
  const guestAddress = [mainGuest.address, mainGuest.pincode].filter(Boolean).join(', ');

  const acLabel  = log.is_ac === true ? ' (AC)' : log.is_ac === false ? ' (Non-AC)' : '';
  const roomLabel = `${roomNumber}${acLabel}${roomTypeName ? ` | ${roomTypeName}` : ''}`;
  const checkInStr  = dayjs(log.check_in).format('dddd, MMMM D, YYYY');
  const checkOutStr = log.check_out ? dayjs(log.check_out).format('dddd, MMMM D, YYYY') : '—';
  const invoiceDate = log.check_out ? dayjs(log.check_out).format('DD-MM-YYYY') : dayjs().format('DD-MM-YYYY');
  const invoiceNum  = String(log.id).padStart(7, '0');

  // Occupants
  const occupantParts = [];
  if (log.male_count > 0)   occupantParts.push(`${log.male_count} Male`);
  if (log.female_count > 0) occupantParts.push(`${log.female_count} Female`);
  if (log.child_count > 0)  occupantParts.push(`${log.child_count} Child${log.child_count > 1 ? 'ren' : ''}`);
  // fallback: count by guest list
  const guestCountStr = occupantParts.length > 0
    ? occupantParts.join(', ')
    : guests.length > 0 ? `${guests.length} guest${guests.length > 1 ? 's' : ''}` : '—';

  // Contact line
  const contactParts = [
    hotelAddress,
    hotelPhone ? `Tel: ${hotelPhone}` : null,
    hotelEmail  ? `Email: ${hotelEmail}` : null,
  ].filter(Boolean);

  // Charge calculations
  const roomChargeTotal = Number(log.price) * nights;
  const extraBedTotal   = log.extra_bed * Number(log.extra_per_bed_price) * nights;
  const amenities       = log.amenities || [];
  const amenityRows     = amenities.map(a => ({
    name: a.name,
    isPerNight: a.charge_type === 'per_night',
    qty: a.quantity,
    rate: Number(a.price),
    total: Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1),
  }));
  const amenityTotal = amenityRows.reduce((sum, a) => sum + a.total, 0);
  const subtotal     = log.is_nc ? 0 : (roomChargeTotal + extraBedTotal + amenityTotal);

  let gstAmount = 0;
  let gstLabel  = '';
  if (log.gst_applied && !log.is_nc && gstPercent > 0) {
    if (log.gst_inclusive) {
      gstAmount = Math.round(subtotal - subtotal / (1 + gstPercent / 100));
      gstLabel  = `GST (${gstPercent}%, incl.)`;
    } else {
      gstAmount = Math.round(subtotal * gstPercent / 100);
      gstLabel  = `GST (${gstPercent}%)`;
    }
  }

  const grandTotal = log.is_nc ? 0 : (log.gst_inclusive ? subtotal : subtotal + gstAmount);
  const totalPaid  = (log.payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const balance    = grandTotal - totalPaid;

  // Line items
  const lineItems = log.is_nc ? [] : [
    {
      qty: `${nights}`,
      desc: `Room ${roomNumber} — per night`,
      rate: fmt(log.price),
      amount: fmt(roomChargeTotal),
    },
    ...(log.extra_bed > 0 ? [{
      qty: `${log.extra_bed * nights}`,
      desc: `Extra Bed × ${log.extra_bed} — per night`,
      rate: fmt(log.extra_per_bed_price),
      amount: fmt(extraBedTotal),
    }] : []),
    ...amenityRows.map(a => ({
      qty: a.isPerNight ? `${a.qty * nights}` : `${a.qty}`,
      desc: `${a.name}${a.isPerNight ? ' (per night)' : ' (flat)'}`,
      rate: fmt(a.rate),
      amount: fmt(a.total),
    })),
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Hotel Name ── */}
        <Text style={s.hotelName}>{hotelName}</Text>

        {/* ── Contact row ── */}
        {contactParts.length > 0 && (
          <Text style={s.contactRow}>{contactParts.join('   |   ')}</Text>
        )}

        {/* ── Divider ── */}
        <View style={s.divider} />

        {/* ── Paid By / RECEIPT ── */}
        <View style={s.topRow}>
          <View>
            <Text style={s.paidByLabel}>Paid By</Text>
            <Text style={s.paidByText}>{mainGuest.name || '—'}</Text>
            {mainGuest.number ? <Text style={s.paidByText}>{mainGuest.number}</Text> : null}
            {(guestGender || guestAge != null) ? (
              <Text style={s.paidByText}>
                {[guestGender, guestAge != null ? `Age ${guestAge}` : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {guestAddress ? <Text style={[s.paidByText, { color: MUTED, fontSize: 8.5 }]}>{guestAddress}</Text> : null}
            {guests.length > 1 ? (
              <Text style={[s.paidByText, { color: MUTED, fontSize: 8 }]}>
                +{guests.length - 1} more: {guests.slice(1).map(g => g.name).join(', ')}
              </Text>
            ) : null}
          </View>
          <Text style={s.receiptTitle}>RECEIPT</Text>
        </View>

        {/* ── Booking Details ── */}
        <View style={s.bookingSection}>
          <View style={s.bookingLeft}>
            <Text style={s.bookingLabel}>Booking Details</Text>
            <KV label="Check in"   value={checkInStr} />
            <KV label="Check-out"  value={checkOutStr} />
            <KV label="Guests"     value={guestCountStr} />
            <KV label="Room"       value={roomLabel} />
            {log.checked_in_by_name
              ? <KV label="Checked in by" value={log.checked_in_by_name} />
              : null}
          </View>
          <View style={s.metaBlock}>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Receipt #</Text>
              <Text style={s.metaVal}>{invoiceNum}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Receipt Date</Text>
              <Text style={s.metaVal}>{invoiceDate}</Text>
            </View>
          </View>
        </View>

        {/* ── Charges table ── */}
        <View style={s.tableWrap}>

          {/* Header */}
          <View style={s.tHead}>
            <Text style={[s.tHeadText, s.tHeadQty]}>Quantity</Text>
            <Text style={[s.tHeadText, s.cDesc]}>Description</Text>
            <Text style={[s.tHeadText, s.cPrice]}>Unit Price</Text>
            <Text style={[s.tHeadText, s.cAmt]}>Amount</Text>
          </View>

          {/* Items */}
          {log.is_nc ? (
            <View style={s.tRow}>
              <Text style={[s.tCell, s.cQty]}>—</Text>
              <Text style={[s.tCell, s.cDesc]}>Non-Chargeable Stay (NC)</Text>
              <Text style={[s.tCell, s.cPrice, s.money]}>—</Text>
              <Text style={[s.tCell, s.cAmt, s.money]}>{fmt(0)}</Text>
            </View>
          ) : (
            lineItems.map((item, i) => (
              <View key={i} style={s.tRow}>
                <Text style={[s.tCell, s.cQty]}>{item.qty}</Text>
                <Text style={[s.tCell, s.cDesc]}>{item.desc}</Text>
                <Text style={[s.tCell, s.cPrice, s.money]}>{item.rate}</Text>
                <Text style={[s.tCell, s.cAmt, s.money]}>{item.amount}</Text>
              </View>
            ))
          )}

          {/* Summary: subtotal */}
          {!log.is_nc ? (
            <SRow label="Subtotal" value={fmt(subtotal)} />
          ) : null}

          {/* Summary: GST */}
          {!log.is_nc && gstAmount > 0 ? (
            <SRow label={gstLabel} value={fmt(gstAmount)} />
          ) : null}

          {/* Summary: Total */}
          {!log.is_nc ? (
            <SRow label="Total" value={fmt(grandTotal)} isTotal />
          ) : null}

          {/* Summary: Paid */}
          {!log.is_nc ? (
            <SRow label="Paid" value={fmt(totalPaid)} />
          ) : null}

          {/* Summary: Balance Due */}
          {!log.is_nc ? (
            <SRow
              label="Balance Due"
              value={balance < 0 ? `${fmt(Math.abs(balance))} (Cr)` : fmt(balance)}
              isTotal
              valueColor={balance > 0 ? RED : GREEN}
            />
          ) : null}

        </View>

        {/* Tax note */}
        {gstAmount > 0 && !log.gst_inclusive ? (
          <Text style={s.taxNote}>*{gstLabel}: {gstPercent}%</Text>
        ) : null}

        {/* ── Payments Received ── */}
        {(log.payments || []).length > 0 ? (
          <View>
            <Text style={s.payHead}>PAYMENTS RECEIVED</Text>
            {(log.payments || []).map((p) => (
              <View key={p.id} style={s.payRow}>
                <Text style={s.payLabel}>
                  {(p.payment_method_name || p.payment_type || '—').toUpperCase()}
                  {p.processed_by_name ? ` · ${p.processed_by_name}` : ''}
                  {` · ${dayjs(p.created_on).format('DD MMM YYYY')}`}
                  {p.note ? ` · ${p.note}` : ''}
                </Text>
                <Text style={[s.payAmt, s.money]}>{fmt(p.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Notes ── */}
        <Text style={s.notesLabel}>Notes</Text>
        <Text style={s.notesText}>
          Thank you for staying with us at {hotelName}. We look forward to welcoming you again!
        </Text>

      </Page>
    </Document>
  );
}
