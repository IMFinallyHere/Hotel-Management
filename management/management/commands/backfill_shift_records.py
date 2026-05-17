from django.core.management.base import BaseCommand
from django.db import transaction

from management.models import FoodOrder, MoneyEvent, Payment, RoomStayLogs, StayLogAmenity, StayNote, StayVehicle


class Command(BaseCommand):
    help = (
        'Merge old split shift stay logs into one. '
        'For each (old_log, new_log) pair created by the old shift behaviour, '
        'moves all records onto old_log, updates old_log.room, and deletes new_log.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview changes without applying them.')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        # New logs are the ones with shifted_from set (created by the old behaviour)
        new_logs = RoomStayLogs.objects.filter(shifted_from__isnull=False).select_related(
            'shifted_from', 'group', 'room'
        )
        if not new_logs.exists():
            self.stdout.write('No split shift logs found. Nothing to do.')
            return

        total_merged = 0

        with transaction.atomic():
            for new_log in new_logs:
                # Find the matching old log that was closed at shift time
                old_candidates = RoomStayLogs.objects.filter(
                    room=new_log.shifted_from,
                    group=new_log.group,
                    check_in=new_log.check_in,
                    check_out__isnull=False,
                    shifted_from__isnull=True,  # the original log has no shifted_from
                )
                if old_candidates.count() != 1:
                    self.stdout.write(self.style.WARNING(
                        f'  Skipping new_log {new_log.id} (room {new_log.room.room_number}): '
                        f'expected 1 old log candidate, found {old_candidates.count()}. Skipping.'
                    ))
                    continue

                old_log = old_candidates.first()
                self.stdout.write(
                    f'Merging: old_log {old_log.id} (room {new_log.shifted_from.room_number}) '
                    f'+ new_log {new_log.id} (room {new_log.room.room_number}) '
                    f'→ single log {old_log.id} in room {new_log.room.room_number}'
                )

                payments   = Payment.objects.filter(stay_log=new_log).count()
                events     = MoneyEvent.objects.filter(stay_log=new_log).count()
                foods      = FoodOrder.objects.filter(stay_log=new_log).count()
                notes      = StayNote.objects.filter(stay_log=new_log).count()
                vehicles   = StayVehicle.objects.filter(stay=new_log).count()
                amenities  = StayLogAmenity.objects.filter(stay_log=new_log).count()
                self.stdout.write(
                    f'  Records on new_log to move: payments={payments}, money_events={events}, '
                    f'food_orders={foods}, notes={notes}, vehicles={vehicles}, amenities={amenities}'
                )

                if not dry_run:
                    # Move all records from new_log to old_log
                    Payment.objects.filter(stay_log=new_log).update(stay_log=old_log)
                    MoneyEvent.objects.filter(stay_log=new_log).update(stay_log=old_log)
                    FoodOrder.objects.filter(stay_log=new_log).update(stay_log=old_log)
                    StayNote.objects.filter(stay_log=new_log).update(stay_log=old_log)
                    StayVehicle.objects.filter(stay=new_log).update(stay=old_log)
                    StayLogAmenity.objects.filter(stay_log=new_log).update(stay_log=old_log)

                    # Update old_log to reflect the shifted room and any pricing changes
                    old_log.room = new_log.room
                    old_log.shifted_from = new_log.shifted_from  # == old_log.room before update
                    old_log.shift_reason = new_log.shift_reason
                    old_log.price = new_log.price
                    old_log.extra_bed = new_log.extra_bed
                    old_log.extra_per_bed_price = new_log.extra_per_bed_price
                    old_log.check_out = new_log.check_out          # null if guest still active
                    old_log.checked_out_by = new_log.checked_out_by
                    old_log.save()

                    new_log.delete()

                total_merged += 1

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write('')
        action = 'Would merge' if dry_run else 'Merged'
        self.stdout.write(f'{action} {total_merged} shift pair(s).')

        if dry_run:
            self.stdout.write(self.style.WARNING('\nDry run complete. Run without --dry-run to apply.'))
        else:
            self.stdout.write(self.style.SUCCESS('\nBackfill complete.'))
