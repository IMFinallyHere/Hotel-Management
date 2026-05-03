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


def assert_date_not_settled(date_val):
    """Raise ValueError if the given date is already settled. Use before any destructive action."""
    from .models import DailySettlement
    if DailySettlement.objects.filter(date=date_val, status='settled').exists():
        raise ValueError(f'Day {date_val} is already settled. No financial changes allowed.')
