from django.utils import timezone
from .models import MoneyEvent


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
        note=note,
    )
    if payment_method is not None and payment_method.name.strip().lower() == 'cash':
        from .models import CashWithdrawal
        _CASH_INFLOW  = {'payment_received', 'food_payment', 'reservation_advance', 'cancellation_fee'}
        _CASH_OUTFLOW = {'expense_paid', 'refund_paid'}
        if event_type in _CASH_INFLOW:
            drawer_entry_type = 'credit'
        elif event_type in _CASH_OUTFLOW:
            drawer_entry_type = 'debit'
        else:
            drawer_entry_type = None
        if drawer_entry_type:
            if note:
                reason = note
            elif stay_log_id := getattr(stay_log, 'pk', None):
                room_no = getattr(getattr(stay_log, 'room', None), 'room_number', None)
                reason = f'Room {room_no}' if room_no else event_type.replace('_', ' ').title()
            elif reservation_id := getattr(reservation, 'pk', None):
                room_no = getattr(getattr(reservation, 'room', None), 'room_number', None)
                reason = f'Reservation – Room {room_no}' if room_no else 'Reservation Advance'
            elif food_order_id := getattr(food_order, 'pk', None):
                room_no = getattr(getattr(getattr(food_order, 'stay_log', None), 'room', None), 'room_number', None)
                reason = f'Food – Room {room_no}' if room_no else 'Food Payment'
            else:
                reason = event_type.replace('_', ' ').title()
            CashWithdrawal.objects.create(
                amount=amount,
                reason=reason,
                entry_type=drawer_entry_type,
                requested_by=recorded_by,
                date=event_date,
            )


def assert_date_not_settled(date_val):
    """Raise ValueError if the given date is already settled. Use before any destructive action."""
    from .models import DailySettlement
    if DailySettlement.objects.filter(date=date_val, status='settled').exists():
        raise ValueError(f'Day {date_val} is already settled. No financial changes allowed.')
