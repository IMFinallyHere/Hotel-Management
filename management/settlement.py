from collections import defaultdict
from decimal import Decimal
from .models import MoneyEvent


INFLOW_TYPES  = {'payment_received', 'food_payment', 'reservation_advance', 'cash_deposit'}
OUTFLOW_TYPES = {'expense_paid', 'cash_withdrawal', 'refund_paid'}
# cancellation_fee: inflow only when payment_method is set (direct collection)
# advance_applied: excluded entirely (accounting transfer, not new cash)
# cash_deposit: cash put back into the drawer (CR entry)


def compute_settlement_snapshot(date_val):
    events = (
        MoneyEvent.objects
        .filter(date=date_val)
        .select_related(
            'payment_method',
            'stay_log__room', 'stay_log__group',
            'reservation__room', 'reservation__group',
            'cancellation__group',
            'food_order',
            'recorded_by',
        )
        .prefetch_related(
            'stay_log__group__customers__customer',
            'reservation__group__customers__customer',
            'cancellation__group__customers__customer',
        )
        .order_by('created_on')
    )

    totals = {
        'room_payments':            Decimal(0),
        'food_payments':            Decimal(0),
        'reservation_advances':     Decimal(0),
        'direct_cancellation_fees': Decimal(0),
        'withheld_cancellation_fees': Decimal(0),
        'cash_deposits':            Decimal(0),
        'other_income':             Decimal(0),
        'expenses':                 Decimal(0),
        'withdrawals':              Decimal(0),
        'refunds':                  Decimal(0),
    }

    # by_method[pm_id] = {'name': str, 'inflow': Decimal, 'outflow': Decimal}
    by_method = defaultdict(lambda: {'name': '', 'inflow': Decimal(0), 'outflow': Decimal(0)})

    event_list = list(events)

    for e in event_list:
        pm_id   = e.payment_method_id
        pm_name = e.payment_method.name if e.payment_method else None

        if e.event_type == 'payment_received':
            totals['room_payments'] += e.amount
            if pm_id:
                by_method[pm_id]['inflow'] += e.amount
                by_method[pm_id]['name'] = pm_name

        elif e.event_type == 'food_payment':
            totals['food_payments'] += e.amount
            if pm_id:
                by_method[pm_id]['inflow'] += e.amount
                by_method[pm_id]['name'] = pm_name

        elif e.event_type == 'reservation_advance':
            totals['reservation_advances'] += e.amount
            if pm_id:
                by_method[pm_id]['inflow'] += e.amount
                by_method[pm_id]['name'] = pm_name

        elif e.event_type == 'cancellation_fee':
            if pm_id:
                # Guest paid directly → counts as inflow
                totals['direct_cancellation_fees'] += e.amount
                by_method[pm_id]['inflow'] += e.amount
                by_method[pm_id]['name'] = pm_name
            else:
                # Withheld from advance → annotation only, not new cash
                totals['withheld_cancellation_fees'] += e.amount

        elif e.event_type == 'cash_deposit':
            totals['cash_deposits'] += e.amount
            # cash deposits have no payment method bucket (physical cash)

        elif e.event_type == 'other_income':
            totals['other_income'] += e.amount
            if pm_id:
                by_method[pm_id]['inflow'] += e.amount
                by_method[pm_id]['name'] = pm_name

        elif e.event_type == 'expense_paid':
            totals['expenses'] += e.amount
            if pm_id:
                by_method[pm_id]['outflow'] += e.amount
                by_method[pm_id]['name'] = pm_name

        elif e.event_type == 'cash_withdrawal':
            totals['withdrawals'] += e.amount
            # cash withdrawals have no payment method bucket

        elif e.event_type == 'refund_paid':
            totals['refunds'] += e.amount
            if pm_id:
                by_method[pm_id]['outflow'] += e.amount
                by_method[pm_id]['name'] = pm_name

        # advance_applied: excluded — accounting transfer, money already counted as reservation_advance

    total_inflow  = (totals['room_payments'] + totals['food_payments']
                     + totals['reservation_advances'] + totals['direct_cancellation_fees']
                     + totals['cash_deposits'] + totals['other_income'])
    total_outflow = totals['expenses'] + totals['withdrawals'] + totals['refunds']

    return {
        **totals,
        'total_inflow':  total_inflow,
        'total_outflow': total_outflow,
        'net':           total_inflow - total_outflow,
        'by_method':     dict(by_method),
        'events':        event_list,
    }


def _guests(group):
    if not group:
        return []
    return [cg.customer.name for cg in group.customers.all()]


def serialize_event(e):
    room_number = None
    guests      = []

    if e.stay_log:
        room_number = e.stay_log.room.room_number
        guests      = _guests(e.stay_log.group)
    elif e.reservation:
        room_number = e.reservation.room.room_number
        guests      = _guests(e.reservation.group)
    elif e.cancellation:
        room_number = e.cancellation.room_number
        guests      = _guests(e.cancellation.group)

    cancellation_fee_withheld = None
    if e.event_type == 'refund_paid' and e.cancellation:
        fee = e.cancellation.cancellation_fee
        if fee:
            cancellation_fee_withheld = int(fee)

    return {
        'id':                       e.id,
        'event_type':               e.event_type,
        'amount':                   int(e.amount),
        'payment_method':           e.payment_method.name if e.payment_method else None,
        'note':                     e.note,
        'created_on':               e.created_on.isoformat(),
        'recorded_by':              e.recorded_by.username if e.recorded_by else None,
        'room_number':              room_number,
        'guests':                   guests,
        'cancellation_fee_withheld': cancellation_fee_withheld,
    }
