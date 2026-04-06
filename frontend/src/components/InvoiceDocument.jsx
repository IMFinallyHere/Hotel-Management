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


const TEAL = '#0d9488';
const TEAL_LIGHT = '#f0fdfa';
const DARK = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 0, color: DARK, backgroundColor: '#ffffff' },

  // Header band
  headerBand: {
    backgroundColor: TEAL,
    padding: '14 24',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hotelName: { fontSize: 17, fontWeight: 700, color: '#ffffff', marginBottom: 3 },
  hotelSub: { fontSize: 9, color: '#ffffff', marginTop: 2, opacity: 0.85 },
  invoiceBadge: { alignItems: 'flex-end' },
  invoiceTitle: { fontSize: 14, fontWeight: 700, color: '#ffffff', letterSpacing: 1 },
  invoiceMeta: { fontSize: 9, color: '#ffffff', marginTop: 3, textAlign: 'right', opacity: 0.9 },

  // Body padding
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },

  // Two-column info row
  infoRow: { flexDirection: 'row', marginBottom: 16, borderBottom: `1px solid ${BORDER}`, paddingBottom: 14 },
  infoLeft: { flex: 1, paddingRight: 16, borderRight: `1px solid ${BORDER}` },
  infoRight: { flex: 1, paddingLeft: 16 },
  sectionLabel: { fontSize: 8, fontWeight: 700, color: TEAL, letterSpacing: 0.8, marginBottom: 5 },
  guestName: { fontSize: 12, fontWeight: 700, color: DARK, marginBottom: 3 },
  infoLine: { fontSize: 9, color: '#374151', marginBottom: 2 },
  infoMuted: { fontSize: 8, color: MUTED, marginBottom: 2 },
  stayDivider: { borderBottom: `1px solid ${BORDER}`, marginVertical: 8 },

  // Table
  tableHead: { flexDirection: 'row', backgroundColor: TEAL, padding: '5 8' },
  tableHeadText: { fontWeight: 700, color: '#ffffff', fontSize: 9 },
  tableRow: { flexDirection: 'row', padding: '5 8', borderBottom: `1px solid ${BORDER}` },
  tableRowAlt: { flexDirection: 'row', padding: '5 8', backgroundColor: TEAL_LIGHT, borderBottom: `1px solid ${BORDER}` },
  tableRowLast: { borderBottom: 'none' },
  colDesc: { flex: 5 },
  colQty: { flex: 1, textAlign: 'center' },
  colRate: { flex: 2.2, textAlign: 'right' },
  colAmt: { flex: 2, textAlign: 'right' },
  moneyText: { fontFamily: 'SegoeUIPdf' },

  // Subtotals
  subtotalRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 3 },
  subtotalLabel: { width: 130, fontSize: 9, color: MUTED, textAlign: 'right', paddingRight: 10 },
  subtotalValue: { width: 80, fontSize: 9, textAlign: 'right' },

  totalBand: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: TEAL,
    padding: '8 8 8 8',
    marginTop: 4,
  },
  totalLabel: { fontSize: 11, fontWeight: 700, color: '#ffffff', marginRight: 10 },
  totalValue: { width: 80, fontSize: 11, fontWeight: 700, color: '#ffffff', textAlign: 'right' },

  // Payments
  payHead: { fontSize: 8, fontWeight: 700, color: TEAL, letterSpacing: 0.8, marginBottom: 4, marginTop: 14 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: `1px solid ${BORDER}` },
  payLabel: { fontSize: 9, color: '#374151', flex: 4 },
  payAmount: { fontSize: 9, textAlign: 'right', flex: 1 },

  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 2 },
  balanceLabel: { fontSize: 11, fontWeight: 700 },
  balanceValue: { fontSize: 11, fontWeight: 700 },

  footer: { textAlign: 'center', fontSize: 8, color: MUTED, marginTop: 16, borderTop: `1px solid ${BORDER}`, paddingTop: 8 },
});

export default function InvoiceDocument({ log, roomNumber, roomTypeName, configMap, nights }) {
  const rawCurrency = String(configMap?.currency_symbol ?? '').trim();
  const blockedCurrencySymbols = new Set(['', "'", '*', '-', '.']);
  const resolvedCurrency = blockedCurrencySymbols.has(rawCurrency) ? '\u20B9' : rawCurrency;
  const cur = resolvedCurrency;
  const hotelName = configMap?.hotel_name || 'Hotel';
  const hotelAddress = configMap?.hotel_address || '';
  const hotelPhone = configMap?.hotel_phone || '';
  const gstPercent = Number(configMap?.gst_percent ?? 0);

  function fmt(n) {
    return `${cur}${Number(n).toLocaleString('en-IN')}`;
  }

  const guests = log.customers || [];
  const mainGuest = guests[0] || {};
  const genderMap = { male: 'Male', female: 'Female', trans: 'Trans', other: 'Other' };
  const guestGender = mainGuest.gender ? genderMap[mainGuest.gender] || mainGuest.gender : null;
  const guestAge = mainGuest.age ?? null;
  const guestAddress = [mainGuest.address, mainGuest.pincode].filter(Boolean).join(', ');
  const billedByName =
    log.checked_out_by_name ||
    (log.payments || []).find((p) => p?.processed_by_name)?.processed_by_name ||
    log.checked_in_by_name ||
    hotelName;

  const acLabel = log.is_ac === true ? ' (AC)' : log.is_ac === false ? ' (Non-AC)' : '';
  const roomLabel = `${roomNumber}${acLabel}${roomTypeName ? ` | ${roomTypeName}` : ''}`;
  const checkInStr = dayjs(log.check_in).format('DD MMM YYYY');
  const checkOutStr = log.check_out ? dayjs(log.check_out).format('DD MMM YYYY') : '\u2014';
  const invoiceDate = log.check_out ? dayjs(log.check_out).format('DD MMM YYYY') : dayjs().format('DD MMM YYYY');

  // Charge calculations
  const roomChargeTotal = Number(log.price) * nights;
  const extraBedTotal = log.extra_bed * Number(log.extra_per_bed_price) * nights;
  const amenities = log.amenities || [];
  const amenityRows = amenities.map(a => ({
    name: a.name,
    isPerNight: a.charge_type === 'per_night',
    qty: a.quantity,
    rate: Number(a.price),
    total: Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1),
  }));
  const amenityTotal = amenityRows.reduce((s, a) => s + a.total, 0);
  const subtotal = log.is_nc ? 0 : (roomChargeTotal + extraBedTotal + amenityTotal);

  let gstAmount = 0;
  let gstLabel = '';
  if (log.gst_applied && !log.is_nc && gstPercent > 0) {
    if (log.gst_inclusive) {
      gstAmount = Math.round(subtotal - subtotal / (1 + gstPercent / 100));
      gstLabel = `GST ${gstPercent}% (incl.)`;
    } else {
      gstAmount = Math.round(subtotal * gstPercent / 100);
      gstLabel = `+GST ${gstPercent}%`;
    }
  }
  const grandTotal = log.is_nc ? 0 : (log.gst_inclusive ? subtotal : subtotal + gstAmount);
  const totalPaid = (log.payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = grandTotal - totalPaid;

  const lineItems = log.is_nc ? [] : [
    {
      description: 'Room Charge (per night)',
      qty: `${nights} night${nights !== 1 ? 's' : ''}`,
      rate: fmt(log.price),
      amount: fmt(roomChargeTotal),
    },
    ...(log.extra_bed > 0 ? [{
      description: `Extra Bed x${log.extra_bed} (per night)`,
      qty: `${log.extra_bed} person x ${nights} night${nights !== 1 ? 's' : ''}`,
      rate: fmt(log.extra_per_bed_price),
      amount: fmt(extraBedTotal),
    }] : []),
    ...amenityRows.map((a) => ({
      description: `${a.name}${a.isPerNight ? ' (per night)' : ' (flat)'}`,
      qty: a.isPerNight
        ? `${a.qty} person x ${nights} night${nights !== 1 ? 's' : ''}`
        : `${a.qty} unit${a.qty !== 1 ? 's' : ''}`,
      rate: fmt(a.rate),
      amount: fmt(a.total),
    })),
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.headerBand}>
          <View>
            <Text style={styles.hotelName}>{hotelName}</Text>
            {hotelAddress ? <Text style={styles.hotelSub}>{hotelAddress}</Text> : null}
            {hotelPhone ? <Text style={styles.hotelSub}>Tel: {hotelPhone}</Text> : null}
          </View>
          <View style={styles.invoiceBadge}>
            <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
            <Text style={styles.invoiceMeta}>#INV-{log.id}</Text>
            <Text style={styles.invoiceMeta}>Date: {invoiceDate}</Text>
          </View>
        </View>

        <View style={styles.body}>

          {/* ── Bill To / Biller ── */}
          <View style={styles.infoRow}>

            {/* Left: Bill To + Stay Details */}
            <View style={styles.infoLeft}>
              <Text style={styles.sectionLabel}>BILL TO</Text>
              <Text style={styles.guestName}>{mainGuest.name || '\u2014'}</Text>
              {mainGuest.number ? <Text style={styles.infoLine}>Ph: {mainGuest.number}</Text> : null}
              {(guestGender || guestAge != null) ? (
                <Text style={styles.infoLine}>
                  {[guestGender, guestAge != null ? `Age ${guestAge}` : null].filter(Boolean).join(' \u00b7 ')}
                </Text>
              ) : null}
              {guestAddress ? <Text style={styles.infoMuted}>{guestAddress}</Text> : null}
              {guests.length > 1 ? (
                <Text style={[styles.infoMuted, { marginTop: 2 }]}>
                  +{guests.length - 1} more: {guests.slice(1).map(g => g.name).join(', ')}
                </Text>
              ) : null}

              <View style={styles.stayDivider} />

              <Text style={styles.sectionLabel}>STAY DETAILS</Text>
              <Text style={[styles.infoLine, { fontWeight: 700 }]}>Room {roomLabel}</Text>
              <Text style={styles.infoLine}>Check-in:   {checkInStr}</Text>
              <Text style={styles.infoLine}>Check-out:  {checkOutStr}</Text>
              <Text style={styles.infoLine}>Duration:   {nights} night{nights !== 1 ? 's' : ''}</Text>
              {log.checked_in_by_name
                ? <Text style={styles.infoMuted}>Checked in by: {log.checked_in_by_name}</Text>
                : null}
            </View>

            {/* Right: Biller */}
            <View style={styles.infoRight}>
              <Text style={styles.sectionLabel}>BILLED BY</Text>
              <Text style={[styles.infoLine, { fontWeight: 700 }]}>{billedByName}</Text>
              {hotelAddress
                ? hotelAddress.split('\n').map((line, i) => (
                    <Text key={i} style={styles.infoLine}>{line}</Text>
                  ))
                : null}
              {hotelPhone ? <Text style={styles.infoLine}>Tel: {hotelPhone}</Text> : null}
            </View>
          </View>

          {/* ── Charges table ── */}
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadText, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeadText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeadText, styles.colRate]}>Rate</Text>
            <Text style={[styles.tableHeadText, styles.colAmt]}>Amount</Text>
          </View>

          {log.is_nc ? (
            <View style={[styles.tableRowAlt, styles.tableRowLast]}>
              <Text style={[styles.colDesc, { fontSize: 9 }]}>Non-Chargeable Stay (NC)</Text>
              <Text style={[styles.colQty, { fontSize: 9 }]}></Text>
              <Text style={[styles.colRate, { fontSize: 9 }]}></Text>
              <Text style={[styles.colAmt, styles.moneyText, { fontSize: 9 }]}>{fmt(0)}</Text>
            </View>
          ) : (
            <>
              {lineItems.map((item, i) => (
                <View
                  key={i}
                  style={[
                    (i % 2 === 0) ? styles.tableRowAlt : styles.tableRow,
                    i === lineItems.length - 1 ? styles.tableRowLast : null,
                  ]}
                >
                  <Text style={[styles.colDesc, { fontSize: 9 }]}>{item.description}</Text>
                  <Text style={[styles.colQty, { fontSize: 9 }]}>{item.qty}</Text>
                  <Text style={[styles.colRate, styles.moneyText, { fontSize: 9 }]}>{item.rate}</Text>
                  <Text style={[styles.colAmt, styles.moneyText, { fontSize: 9 }]}>{item.amount}</Text>
                </View>
              ))}
            </>
          )}

          {/* ── Subtotals ── */}
          {!log.is_nc ? (
            <View style={{ marginTop: 6 }}>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Subtotal</Text>
                <Text style={[styles.subtotalValue, styles.moneyText]}>{fmt(subtotal)}</Text>
              </View>
              {gstAmount > 0 ? (
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>{gstLabel}</Text>
                  <Text style={[styles.subtotalValue, styles.moneyText]}>{fmt(gstAmount)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.totalBand}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={[styles.totalValue, styles.moneyText]}>{fmt(grandTotal)}</Text>
          </View>

          {/* ── Payments ── */}
          {(log.payments || []).length > 0 ? (
            <View>
              <Text style={styles.payHead}>PAYMENTS RECEIVED</Text>
              {(log.payments || []).map((p) => (
                <View key={p.id} style={styles.payRow}>
                  <Text style={styles.payLabel}>
                    {p.payment_type?.toUpperCase()}
                    {p.processed_by_name ? ` \u00b7 ${p.processed_by_name}` : ''}
                    {` \u00b7 ${dayjs(p.created_on).format('DD MMM YYYY')}`}
                    {p.note ? ` \u00b7 ${p.note}` : ''}
                  </Text>
                  <Text style={[styles.payAmount, styles.moneyText]}>{fmt(p.amount)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* ── Balance ── */}
          {!log.is_nc ? (
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Balance Due</Text>
              <Text style={[styles.balanceValue, styles.moneyText, { color: balance > 0 ? '#dc2626' : '#16a34a' }]}>
                {fmt(balance)}
              </Text>
            </View>
          ) : null}

          <Text style={styles.footer}>
            Thank you for staying with us at {hotelName}. We hope to see you again!
          </Text>

        </View>
      </Page>
    </Document>
  );
}
