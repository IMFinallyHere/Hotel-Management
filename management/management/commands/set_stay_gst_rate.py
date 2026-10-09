from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from management.models import RoomStayLogs


class Command(BaseCommand):
    help = (
        "Backfill the GST rate on stays created before RoomStayLogs.gst_percent existed. "
        "Only stays with no saved rate are touched."
    )

    def add_arguments(self, parser):
        parser.add_argument('--rate', required=True, help='GST percent to set, e.g. 12')
        parser.add_argument('--from', dest='from_date', help='Check-in date from (YYYY-MM-DD, inclusive)')
        parser.add_argument('--to', dest='to_date', help='Check-in date to (YYYY-MM-DD, inclusive)')
        parser.add_argument('--dry-run', action='store_true', help='List matching stays without saving')

    def handle(self, *args, **options):
        try:
            rate = Decimal(options['rate'])
            from_date = date.fromisoformat(options['from_date']) if options['from_date'] else None
            to_date = date.fromisoformat(options['to_date']) if options['to_date'] else None
        except ValueError as e:
            raise CommandError(str(e))
        if not (from_date or to_date):
            raise CommandError('Give --from and/or --to so the rate is not applied to every old stay.')

        qs = RoomStayLogs.objects.filter(gst_percent__isnull=True).select_related('room').order_by('check_in')
        if from_date:
            qs = qs.filter(check_in__date__gte=from_date)
        if to_date:
            qs = qs.filter(check_in__date__lte=to_date)

        for log in qs:
            self.stdout.write(f"  stay {log.id}  room {log.room.room_number}  check-in {log.check_in:%Y-%m-%d}  gst_applied={log.gst_applied}")

        if options['dry_run']:
            self.stdout.write(self.style.WARNING(f"Dry run: {qs.count()} stay(s) would be set to {rate}%."))
            return
        updated = qs.update(gst_percent=rate)
        self.stdout.write(self.style.SUCCESS(f"Set {updated} stay(s) to {rate}%."))
