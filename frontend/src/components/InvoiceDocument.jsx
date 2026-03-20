import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import dayjs from 'dayjs';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 32, color: '#222' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  hotelName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1c4a6e' },
  invoiceTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  invoiceMeta: { fontSize: 9, color: '#555', textAlign: 'right', marginTop: 2 },
  divider: { borderBottom: '1px solid #ccc', marginVertical: 8 },
  thinDivider: { borderBottom: '1px solid #eee', marginVertical: 4 },
  section2col: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  col: { width: '48%' },
  label: { fontSize: 9, color: '#888', marginBottom: 2 },
  value: { fontSize: 10, marginBottom: 1 },
  bold: { fontFamily: 'Helvetica-Bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f4f8', padding: '4 6', borderRadius: 2 },
  tableRow: { flexDirection: 'row', padding: '4 6' },
  tableRowAlt: { flexDirection: 'row', padding: '4 6', backgroundColor: '#fafafa' },
  col1: { flex: 3 },
  col2: { flex: 1, textAlign: 'center' },
  col3: { flex: 1, textAlign: 'right' },
  col4: { flex: 1, textAlign: 'right' },
  totalRow: { flexDirection: 'row', padding: '6 6', backgroundColor: '#1c4a6e' },
  totalLabel: { flex: 3, fontFamily: 'Helvetica-Bold', color: '#fff' },
  totalValue: { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: '#fff' },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 12, marginBottom: 4 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '3 0' },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '4 0', marginTop: 4 },
  balanceLabel: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  balanceValue: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  footer: { textAlign: 'center', fontSize: 9, color: '#888', marginTop: 24 },
});

function fmt(n) {
  return `\u20B9${Number(n).toLocaleString('en-IN')}`;
}

export default function InvoiceDocument({ log, roomNumber, roomTypeName, configMap, nights }) {
  const hotelName = configMap?.hotel_name || 'Hotel';
  const gstPercent = Number(configMap?.gst_percent ?? 0);
  const gstRate = gstPercent / 100;
  const roomBase = (Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)) * nights;
  const gstAmount = log.gst_applied && !log.is_nc ? Math.round(roomBase * gstRate) : 0;

  const amenities = log.amenities || [];
  const amenityTotal = amenities.reduce((s, a) =>
    s + Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);

  const grandTotal = log.is_nc ? 0 : (roomBase + gstAmount + amenityTotal);
  const totalPaid = (log.payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = grandTotal - totalPaid;

  const checkInStr = dayjs(log.check_in).format('DD MMM YYYY');
  const checkOutStr = log.check_out ? dayjs(log.check_out).format('DD MMM YYYY') : '—';
  const invoiceDate = log.check_out ? dayjs(log.check_out).format('DD MMM YYYY') : dayjs().format('DD MMM YYYY');

  const guests = log.customers || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hotelName}>{hotelName}</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
            <Text style={styles.invoiceMeta}>#INV-{log.id}</Text>
            <Text style={styles.invoiceMeta}>Date: {invoiceDate}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Bill to + Stay details */}
        <View style={styles.section2col}>
          <View style={styles.col}>
            <Text style={[styles.label, { marginBottom: 4 }]}>BILL TO</Text>
            {guests.map((g, i) => (
              <Text key={i} style={[styles.value, i === 0 ? styles.bold : {}]}>{g.name}</Text>
            ))}
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Room</Text>
            <Text style={[styles.value, styles.bold]}>{roomNumber}{roomTypeName ? ` — ${roomTypeName}` : ''}</Text>
            <Text style={[styles.label, { marginTop: 6 }]}>Check-in</Text>
            <Text style={styles.value}>{checkInStr}</Text>
            <Text style={[styles.label, { marginTop: 4 }]}>Check-out</Text>
            <Text style={styles.value}>{checkOutStr}</Text>
            <Text style={[styles.label, { marginTop: 4 }]}>Duration</Text>
            <Text style={styles.value}>{nights} night{nights !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.col1, styles.bold]}>Description</Text>
          <Text style={[styles.col2, styles.bold]}>Qty</Text>
          <Text style={[styles.col3, styles.bold]}>Rate</Text>
          <Text style={[styles.col4, styles.bold]}>Amount</Text>
        </View>

        {/* Room charge */}
        {!log.is_nc && (
          <View style={styles.tableRow}>
            <Text style={styles.col1}>Room Charge</Text>
            <Text style={styles.col2}>{nights}</Text>
            <Text style={styles.col3}>{fmt(log.price)}</Text>
            <Text style={styles.col4}>{fmt(Number(log.price) * nights)}</Text>
          </View>
        )}

        {/* Extra bed */}
        {!log.is_nc && log.extra_bed > 0 && (
          <View style={styles.tableRowAlt}>
            <Text style={styles.col1}>Extra Bed ({log.extra_bed})</Text>
            <Text style={styles.col2}>{nights}</Text>
            <Text style={styles.col3}>{fmt(log.extra_per_bed_price)}</Text>
            <Text style={styles.col4}>{fmt(log.extra_bed * Number(log.extra_per_bed_price) * nights)}</Text>
          </View>
        )}

        {/* GST */}
        {gstAmount > 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.col1}>GST ({gstPercent}%) on Room Charges</Text>
            <Text style={styles.col2}></Text>
            <Text style={styles.col3}></Text>
            <Text style={styles.col4}>{fmt(gstAmount)}</Text>
          </View>
        )}

        {/* Amenities */}
        {amenities.map((a, i) => {
          const cost = Number(a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1);
          return (
            <View key={a.id} style={i % 2 === 0 ? styles.tableRowAlt : styles.tableRow}>
              <Text style={styles.col1}>{a.name} ×{a.quantity}{a.charge_type === 'per_night' ? ' (per night)' : ' (flat)'}</Text>
              <Text style={styles.col2}></Text>
              <Text style={styles.col3}></Text>
              <Text style={styles.col4}>{fmt(cost)}</Text>
            </View>
          );
        })}

        {log.is_nc && (
          <View style={styles.tableRow}>
            <Text style={styles.col1}>Non-Chargeable Stay (NC)</Text>
            <Text style={styles.col2}></Text>
            <Text style={styles.col3}></Text>
            <Text style={styles.col4}>{fmt(0)}</Text>
          </View>
        )}

        <View style={styles.thinDivider} />

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { flex: 5 }]}>TOTAL</Text>
          <Text style={styles.totalValue}>{fmt(grandTotal)}</Text>
        </View>

        {/* Payments */}
        {(log.payments || []).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Payments</Text>
            <View style={styles.thinDivider} />
            {(log.payments || []).map((p, i) => (
              <View key={p.id} style={styles.paymentRow}>
                <Text style={{ color: '#555' }}>
                  {p.payment_type?.toUpperCase()} · {dayjs(p.created_on).format('DD MMM YYYY')}
                  {p.processed_by_name ? ` · ${p.processed_by_name}` : ''}
                </Text>
                <Text>{fmt(p.amount)}</Text>
              </View>
            ))}
            <View style={styles.thinDivider} />
          </>
        )}

        {/* Balance */}
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Balance Due</Text>
          <Text style={[styles.balanceValue, { color: balance > 0 ? '#c0392b' : '#27ae60' }]}>{fmt(balance)}</Text>
        </View>

        <View style={styles.divider} />
        <Text style={styles.footer}>Thank you for staying with us!</Text>
      </Page>
    </Document>
  );
}
