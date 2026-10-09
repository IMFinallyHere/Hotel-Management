from django.utils import timezone
from .models import MoneyEvent

_CASH_INFLOW  = {'payment_received', 'food_payment', 'reservation_advance', 'cancellation_fee', 'other_income'}
_CASH_OUTFLOW = {'expense_paid', 'refund_paid'}


def _drawer_reason(event_type, note, stay_log, reservation, food_order, cancellation):
    if stay_log:
        room_no = getattr(getattr(stay_log, 'room', None), 'room_number', None)
    elif reservation:
        room_no = getattr(getattr(reservation, 'room', None), 'room_number', None)
    elif food_order:
        room_no = getattr(getattr(getattr(food_order, 'stay_log', None), 'room', None), 'room_number', None)
    elif cancellation:
        room_no = getattr(cancellation, 'room_number', None)
    else:
        room_no = None

    label = note or event_type.replace('_', ' ').title()
    return f'Room {room_no} – {label}' if room_no else label


def record_money_event(
    event_type,
    amount,
    *,
    payment_method=None,
    date=None,
    recorded_by=None,
    stay_log=None,
    reservation=None,
    cancellation=None,
    food_order=None,
    income=None,
    expense=None,
    note='',
):
    """Single function responsible for writing every financial movement to MoneyEvent."""
    from .models import DailySettlement
    event_date = date or timezone.localdate()
    if DailySettlement.objects.filter(date=event_date, status='settled').exists():
        raise ValueError(f'Day {event_date} is already settled. No financial changes allowed.')
    MoneyEvent.objects.create(
        event_type=event_type,
        amount=amount,
        payment_method=payment_method,
        date=event_date,
        recorded_by=recorded_by,
        stay_log=stay_log,
        reservation=reservation,
        cancellation=cancellation,
        food_order=food_order,
        income=income,
        expense=expense,
        note=note,
    )
    if payment_method is not None and payment_method.name.strip().lower() == 'cash':
        from .models import CashWithdrawal
        if event_type in _CASH_INFLOW:
            drawer_entry_type = 'credit'
        elif event_type in _CASH_OUTFLOW:
            drawer_entry_type = 'debit'
        else:
            drawer_entry_type = None
        if drawer_entry_type:
            CashWithdrawal.objects.create(
                amount=amount,
                reason=_drawer_reason(event_type, note, stay_log, reservation, food_order, cancellation),
                entry_type=drawer_entry_type,
                requested_by=recorded_by,
                date=event_date,
            )


def assert_date_not_settled(date_val):
    """Raise ValueError if the given date is already settled. Use before any destructive action."""
    from .models import DailySettlement
    if DailySettlement.objects.filter(date=date_val, status='settled').exists():
        raise ValueError(f'Day {date_val} is already settled. No financial changes allowed.')



def reverse_linked_events(record, recorded_by=None):
    """Undo the ledger effect of an Income/Expense record before it is edited or deleted.

    Removes its MoneyEvent(s) and, for cash, adds an opposite cash drawer entry to cancel
    the one created when it was recorded.
    """
    assert_date_not_settled(record.date)
    for e in list(record.money_events.all()):
        if e.payment_method is not None and e.payment_method.name.strip().lower() == 'cash':
            from .models import CashWithdrawal
            if e.event_type in _CASH_INFLOW:
                drawer_entry_type = 'debit'
            elif e.event_type in _CASH_OUTFLOW:
                drawer_entry_type = 'credit'
            else:
                drawer_entry_type = None
            if drawer_entry_type:
                CashWithdrawal.objects.create(
                    amount=e.amount,
                    reason=f'Reversal – {e.note or e.get_event_type_display()}',
                    entry_type=drawer_entry_type,
                    requested_by=recorded_by,
                    date=e.date,
                )
        e.delete()
