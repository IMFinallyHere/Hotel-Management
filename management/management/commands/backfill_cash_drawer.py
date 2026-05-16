"""
Backfill CashWithdrawal (cash drawer) entries from existing MoneyEvent records
where the payment method is Cash.

Safe to re-run: checks for a duplicate entry before creating.

Events backfilled:
  payment_received    → credit
  food_payment        → credit
  reservation_advance → credit
  cancellation_fee    → credit
  expense_paid        → debit
  refund_paid         → debit
"""

from django.core.management.base import BaseCommand

from management.models import CashWithdrawal, MoneyEvent

INFLOW  = {'payment_received', 'food_payment', 'reservation_advance', 'cancellation_fee'}
OUTFLOW = {'expense_paid', 'refund_paid'}


class Command(BaseCommand):
    help = 'Backfill CashWithdrawal entries for historical cash MoneyEvents.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would be created without writing to the database.',
        )

    def handle(self, *args, **options):
        dry = options['dry_run']
        label = '[DRY RUN] ' if dry else ''
        total = 0

        events = (
            MoneyEvent.objects
            .filter(
                event_type__in=INFLOW | OUTFLOW,
                payment_method__name__iexact='cash',
            )
            .select_related(
                'payment_method', 'recorded_by',
                'stay_log__room', 'reservation__room', 'food_order__stay_log__room',
            )
            .order_by('date', 'created_on')
        )

        for ev in events:
            entry_type = 'credit' if ev.event_type in INFLOW else 'debit'
            if ev.note:
                reason = ev.note
            elif ev.stay_log_id:
                room_no = getattr(getattr(ev.stay_log, 'room', None), 'room_number', None)
                reason = f'Room {room_no}' if room_no else ev.event_type.replace('_', ' ').title()
            elif ev.reservation_id:
                room_no = getattr(getattr(ev.reservation, 'room', None), 'room_number', None)
                reason = f'Reservation – Room {room_no}' if room_no else 'Reservation Advance'
            elif ev.food_order_id:
                room_no = getattr(getattr(getattr(ev.food_order, 'stay_log', None), 'room', None), 'room_number', None)
                reason = f'Food – Room {room_no}' if room_no else 'Food Payment'
            else:
                reason = ev.event_type.replace('_', ' ').title()

            already_exists = CashWithdrawal.objects.filter(
                amount=ev.amount,
                date=ev.date,
                entry_type=entry_type,
                reason=reason,
            ).exists()

            if already_exists:
                continue

            if not dry:
                CashWithdrawal.objects.create(
                    amount=ev.amount,
                    reason=reason,
                    entry_type=entry_type,
                    requested_by=ev.recorded_by,
                    date=ev.date,
                )
            self.stdout.write(
                f'{label}{entry_type.upper()}  {ev.date}  ₹{ev.amount}  [{ev.event_type}]  {reason}'
            )
            total += 1

        self.stdout.write(self.style.SUCCESS(f'{label}Total CashWithdrawal entries created: {total}'))
