"""
Backfill MoneyEvent rows from pre-existing source records.

Safe to re-run: skips any source record that already has a linked MoneyEvent.

Sources backfilled:
  Payment            → payment_received
  FoodOrder (paid)   → food_payment
  ReservationPayment → reservation_advance
  CashWithdrawal     → cash_withdrawal / cash_deposit
  Expense            → expense_paid
  CancellationRefund → refund_paid
  CancellationLog    → cancellation_fee  (fee > 0, withheld or direct)

advance_applied is intentionally excluded (accounting transfer, not new cash).
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from management.models import (
    MoneyEvent,
    Payment,
    FoodOrder,
    ReservationPayment,
    CashWithdrawal,
    Expense,
    CancellationRefund,
    CancellationLog,
)


class Command(BaseCommand):
    help = 'Backfill MoneyEvent rows from existing Payment, FoodOrder, etc. records.'

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

        # ── 1. Payment → payment_received ────────────────────────────────
        existing_payment_ids = set(
            MoneyEvent.objects.filter(event_type='payment_received', stay_log__isnull=False)
            .exclude(stay_log=None)
            .values_list('stay_log_id', flat=True)
        )
        # More precise: check which Payment PKs already have an event via note+amount
        # Simpler approach: use a one-to-one style check via the source table PK stored in note is unreliable.
        # Best: check by (stay_log, amount, payment_method, date) would have false collisions.
        # Safest: just check if ANY money event exists for that stay_log on that date with same amount.
        payments = Payment.objects.select_related('payment_method', 'stay_log', 'processed_by').all()
        created = 0
        for p in payments:
            exists = MoneyEvent.objects.filter(
                event_type='payment_received',
                stay_log=p.stay_log,
                amount=p.amount,
                date=p.created_on.date(),
                payment_method=p.payment_method,
            ).exists()
            if not exists:
                if not dry:
                    MoneyEvent.objects.create(
                        event_type='payment_received',
                        amount=p.amount,
                        payment_method=p.payment_method,
                        date=p.created_on.date(),
                        recorded_by=p.processed_by,
                        stay_log=p.stay_log,
                        note=p.note or '',
                    )
                created += 1
        self.stdout.write(f'{label}Payment → payment_received: {created} created')
        total += created

        # ── 2. FoodOrder (paid) → food_payment ───────────────────────────
        food_orders = FoodOrder.objects.filter(is_paid=True).select_related(
            'payment_method', 'stay_log', 'paid_by'
        )
        created = 0
        for fo in food_orders:
            exists = MoneyEvent.objects.filter(
                event_type='food_payment',
                food_order=fo,
            ).exists()
            if not exists:
                if not dry:
                    MoneyEvent.objects.create(
                        event_type='food_payment',
                        amount=fo.amount,
                        payment_method=fo.payment_method,
                        date=fo.ordered_at.date(),
                        recorded_by=fo.paid_by,
                        stay_log=fo.stay_log,
                        food_order=fo,
                        note='',
                    )
                created += 1
        self.stdout.write(f'{label}FoodOrder → food_payment: {created} created')
        total += created

        # ── 3. ReservationPayment → reservation_advance ──────────────────
        res_payments = ReservationPayment.objects.select_related('payment_method', 'processed_by', 'group')
        created = 0
        for rp in res_payments:
            exists = MoneyEvent.objects.filter(
                event_type='reservation_advance',
                amount=rp.amount,
                payment_method=rp.payment_method,
                date=rp.created_on.date(),
                note=rp.note or '',
            ).exists()
            if not exists:
                if not dry:
                    MoneyEvent.objects.create(
                        event_type='reservation_advance',
                        amount=rp.amount,
                        payment_method=rp.payment_method,
                        date=rp.created_on.date(),
                        recorded_by=rp.processed_by,
                        note=rp.note or '',
                    )
                created += 1
        self.stdout.write(f'{label}ReservationPayment → reservation_advance: {created} created')
        total += created

        # ── 4. CashWithdrawal → cash_withdrawal / cash_deposit ───────────
        withdrawals = CashWithdrawal.objects.select_related('requested_by')
        created = 0
        for cw in withdrawals:
            event_type = 'cash_deposit' if cw.entry_type == 'credit' else 'cash_withdrawal'
            exists = MoneyEvent.objects.filter(
                event_type=event_type,
                amount=cw.amount,
                date=cw.date,
                note=cw.reason,
            ).exists()
            if not exists:
                if not dry:
                    MoneyEvent.objects.create(
                        event_type=event_type,
                        amount=cw.amount,
                        date=cw.date,
                        recorded_by=cw.requested_by,
                        note=cw.reason,
                    )
                created += 1
        self.stdout.write(f'{label}CashWithdrawal → cash_withdrawal/cash_deposit: {created} created')
        total += created

        # ── 5. Expense → expense_paid ─────────────────────────────────────
        expenses = Expense.objects.select_related('payment_method', 'recorded_by')
        created = 0
        for ex in expenses:
            exists = MoneyEvent.objects.filter(
                event_type='expense_paid',
                amount=ex.amount,
                payment_method=ex.payment_method,
                date=ex.date,
                note=ex.description,
            ).exists()
            if not exists:
                if not dry:
                    MoneyEvent.objects.create(
                        event_type='expense_paid',
                        amount=ex.amount,
                        payment_method=ex.payment_method,
                        date=ex.date,
                        recorded_by=ex.recorded_by,
                        note=ex.description,
                    )
                created += 1
        self.stdout.write(f'{label}Expense → expense_paid: {created} created')
        total += created

        # ── 6. CancellationRefund → refund_paid ──────────────────────────
        refunds = CancellationRefund.objects.select_related(
            'payment_method', 'processed_by', 'cancellation'
        )
        created = 0
        for cr in refunds:
            exists = MoneyEvent.objects.filter(
                event_type='refund_paid',
                cancellation=cr.cancellation,
            ).exists()
            if not exists:
                if not dry:
                    MoneyEvent.objects.create(
                        event_type='refund_paid',
                        amount=cr.amount,
                        payment_method=cr.payment_method,
                        date=cr.created_on.date(),
                        recorded_by=cr.processed_by,
                        cancellation=cr.cancellation,
                        note=cr.note or '',
                    )
                created += 1
        self.stdout.write(f'{label}CancellationRefund → refund_paid: {created} created')
        total += created

        # ── 7. CancellationLog (fee > 0) → cancellation_fee ──────────────
        cancellations = CancellationLog.objects.filter(
            cancellation_fee__gt=0
        ).select_related('cancelled_by', 'stay_log', 'reservation')
        created = 0
        for cl in cancellations:
            exists = MoneyEvent.objects.filter(
                event_type='cancellation_fee',
                cancellation=cl,
            ).exists()
            if not exists:
                if not dry:
                    MoneyEvent.objects.create(
                        event_type='cancellation_fee',
                        amount=cl.cancellation_fee,
                        date=cl.cancelled_on.date(),
                        recorded_by=cl.cancelled_by,
                        stay_log=cl.stay_log,
                        reservation=cl.reservation,
                        cancellation=cl,
                        note='',
                    )
                created += 1
        self.stdout.write(f'{label}CancellationLog → cancellation_fee: {created} created')
        total += created

        self.stdout.write(self.style.SUCCESS(f'{label}Total MoneyEvent rows created: {total}'))
