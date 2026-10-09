import dayjs from 'dayjs';
import { computeGst, computeOvertimeFee, isLogOvertime, stayGstPercent } from './configUtils';

// Bill, amount paid and dues for one stay (active or checked out).
// Food paid on its own is marked on the order, not added to log.payments, so it counts
// as paid here; unpaid food is collected through a stay payment and so counts as due.
// Cancelled stays are always settled at cancellation (fee taken from received or paid directly).
export function computeStayDues(log, configMap, room) {
  const active = !log.check_out;
  const nights = Math.max(1, (active ? dayjs() : dayjs(log.check_out)).diff(dayjs(log.check_in), 'day'));
  const gstRate = stayGstPercent(log, configMap);
  const gstPct = Number(gstRate) / 100;

  const roomTotal = (Number(log.price) + log.extra_bed * Number(log.extra_per_bed_price)) * nights;
  const amenityTotal = (log.amenities || []).reduce((sum, a) =>
    sum + Number(a.amenity_price ?? a.price) * a.quantity * (a.charge_type === 'per_night' ? nights : 1), 0);
  const overtimeFee = active
    ? (isLogOvertime(log) ? (Number(room?.overtime_fee) > 0 ? Number(room.overtime_fee) : computeOvertimeFee(log)) : 0)
    : Number(log.overtime_fee_charged ?? 0);
  const gstAmount = computeGst(log, nights, gstRate, amenityTotal);
  const stayCharges = log.is_nc ? 0 :
    (log.gst_inclusive
      ? (roomTotal + amenityTotal + overtimeFee)
      : (roomTotal + amenityTotal + overtimeFee + gstAmount));

  const foodEff = (o) => Number(o.amount) + (o.food_gst_inclusive ? 0 : Math.round(Number(o.amount) * gstPct));
  const foodOrders = log.food_orders || [];
  const totalFood = foodOrders.reduce((s, o) => s + foodEff(o), 0);
  const paidFood = foodOrders.filter(o => o.is_paid).reduce((s, o) => s + foodEff(o), 0);
  const stayPayments = (log.payments || []).reduce((s, p) => s + Number(p.amount), 0);

  if (log.cancellation) {
    const fee = Number(log.cancellation.cancellation_fee);
    return { nights, roomTotal, amenityTotal, overtimeFee, gstAmount, totalFood, billTotal: fee, totalPaid: stayPayments, due: 0 };
  }

  const billTotal = stayCharges + totalFood;
  const totalPaid = stayPayments + paidFood;
  return { nights, roomTotal, amenityTotal, overtimeFee, gstAmount, totalFood, billTotal, totalPaid, due: billTotal - totalPaid };
}
