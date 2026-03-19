from datetime import date, timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from management.models import (
    Amenity, CashWithdrawal, Configurations, CountryCodes,
    CustomerGroup, Customers, Expense, Group, Payment,
    Reservation, RoomNCRequest, Rooms, RoomsPriceChart,
    RoomStayLogs, RoomType, StayLogAmenity,
)

TODAY = date(2026, 3, 20)
NOW = timezone.make_aware(timezone.datetime(2026, 3, 20, 12, 0, 0))


class Command(BaseCommand):
    help = "Seed the database with realistic hotel dummy data"

    def handle(self, *args, **options):
        created_count = 0

        # ── 1. Users ──────────────────────────────────────────────────────────
        users_data = [
            {"username": "admin", "first_name": "Admin", "last_name": "User",
             "email": "admin@hotel.com", "is_staff": True, "is_superuser": True},
            {"username": "receptionist", "first_name": "Priya", "last_name": "Sharma",
             "email": "priya@hotel.com", "is_staff": True, "is_superuser": False},
            {"username": "manager", "first_name": "Rajan", "last_name": "Mehta",
             "email": "rajan@hotel.com", "is_staff": True, "is_superuser": False},
        ]
        users = {}
        for ud in users_data:
            username = ud.pop("username")
            obj, created = User.objects.get_or_create(username=username, defaults=ud)
            if created:
                obj.set_password("Admin@123")
                obj.save()
                created_count += 1
            users[username] = obj

        # ── 2. CountryCodes ───────────────────────────────────────────────────
        countries_data = [
            ("India", 91),
            ("United States", 1),
            ("United Kingdom", 44),
            ("United Arab Emirates", 971),
            ("Germany", 49),
        ]
        countries = {}
        for name, code in countries_data:
            obj, created = CountryCodes.objects.get_or_create(
                country_code=code, defaults={"country_name": name}
            )
            if created:
                created_count += 1
            countries[name] = obj

        # ── 3. Configurations ─────────────────────────────────────────────────
        configs_data = [
            ("hotel_name", "Grand Palace Hotel"),
            ("extra_bed_price", "500"),
            ("check_in_time", "14:00"),
            ("check_out_time", "11:00"),
            ("gst_percent", "12"),
            ("currency_symbol", "₹"),
        ]
        for key, value in configs_data:
            _, created = Configurations.objects.get_or_create(
                key=key, defaults={"value": value}
            )
            if created:
                created_count += 1

        # ── 4. RoomType ───────────────────────────────────────────────────────
        room_types_data = ["Standard", "Deluxe", "Suite", "Presidential"]
        room_types = {}
        for rt_name in room_types_data:
            obj, created = RoomType.objects.get_or_create(name=rt_name)
            if created:
                created_count += 1
            room_types[rt_name] = obj

        # ── 5. Rooms ──────────────────────────────────────────────────────────
        rooms_data = [
            # Standard rooms (101–104)
            ("101", "Standard", 1, 1500),
            ("102", "Standard", 2, 2000),
            ("103", "Standard", 1, 1500),
            ("104", "Standard", 2, 2000),
            # Deluxe rooms (201–204)
            ("201", "Deluxe", 2, 3500),
            ("202", "Deluxe", 2, 3500),
            ("203", "Deluxe", 3, 4500),
            ("204", "Deluxe", 2, 3500),
            # Suite rooms (301–302)
            ("301", "Suite", 2, 7000),
            ("302", "Suite", 3, 8500),
            # Presidential (401)
            ("401", "Presidential", 4, 15000),
            ("402", "Presidential", 3, 12000),
        ]
        rooms = {}
        for number, rt_name, beds, price in rooms_data:
            obj, created = Rooms.objects.get_or_create(
                room_number=number,
                defaults={"room_type": room_types[rt_name], "beds": beds, "price": price},
            )
            if created:
                created_count += 1
            rooms[number] = obj

        # ── 6. Amenities ──────────────────────────────────────────────────────
        amenities_data = [
            ("Breakfast", 350, "per_night"),
            ("Laundry", 200, "flat"),
            ("Spa", 1500, "flat"),
            ("Airport Transfer", 800, "flat"),
            ("Extra Towels", 50, "flat"),
            ("Room Service", 100, "flat"),
        ]
        amenities = {}
        for a_name, a_price, a_type in amenities_data:
            obj, created = Amenity.objects.get_or_create(
                name=a_name, defaults={"price": a_price, "charge_type": a_type}
            )
            if created:
                created_count += 1
            amenities[a_name] = obj

        # ── 7. RoomsPriceChart ────────────────────────────────────────────────
        price_overrides = [
            ("101", TODAY + timedelta(days=5), 2000),
            ("201", TODAY + timedelta(days=5), 4500),
            ("301", TODAY + timedelta(days=10), 9000),
            ("401", TODAY + timedelta(days=7), 18000),
        ]
        for room_num, override_date, override_price in price_overrides:
            _, created = RoomsPriceChart.objects.get_or_create(
                room=rooms[room_num],
                date=override_date,
                defaults={"price": override_price},
            )
            if created:
                created_count += 1

        # ── 8. Customers ──────────────────────────────────────────────────────
        india = countries["India"]
        usa = countries["United States"]
        uk = countries["United Kingdom"]
        uae = countries["United Arab Emirates"]

        customers_data = [
            ("Arjun Kapoor",      "9876543210", india, "Mumbai, Maharashtra", "400001", "male",   date(1990, 5, 15)),
            ("Sneha Reddy",       "9876543211", india, "Hyderabad, Telangana", "500001", "female", date(1993, 8, 22)),
            ("Vikram Singh",      "9876543212", india, "Delhi", "110001", "male",   date(1985, 3, 10)),
            ("Anjali Patel",      "9876543213", india, "Ahmedabad, Gujarat", "380001", "female", date(1997, 11, 5)),
            ("Rahul Joshi",       "9876543214", india, "Pune, Maharashtra", "411001", "male",   date(1988, 7, 18)),
            ("Deepika Nair",      "9876543215", india, "Kochi, Kerala", "682001", "female", date(1995, 2, 28)),
            ("Sanjay Gupta",      "9876543216", india, "Jaipur, Rajasthan", "302001", "male",   date(1980, 12, 3)),
            ("Pooja Iyer",        "9876543217", india, "Chennai, Tamil Nadu", "600001", "female", date(1992, 6, 14)),
            ("Kartik Malhotra",   "9876543218", india, "Kolkata, West Bengal", "700001", "male",   date(1991, 4, 25)),
            ("Meera Bose",        "9876543219", india, "Bhopal, MP", "462001", "female", date(1994, 9, 8)),
            ("John Smith",        "9876543220", usa,   "New York, NY 10001", "10001",  "male",   date(1978, 1, 30)),
            ("Emma Wilson",       "9876543221", uk,    "London, EC1A 1BB", None,    "female", date(1986, 7, 12)),
            ("Ravi Kumar",        "9876543222", india, "Bengaluru, Karnataka", "560001", "male",   date(1989, 3, 17)),
            ("Sara Ahmed",        "9876543223", uae,   "Dubai, UAE", None,    "female", date(1996, 10, 20)),
            ("Mohit Sharma",      "9876543224", india, "Lucknow, UP", "226001", "male",   date(1983, 5, 7)),
        ]
        customers = {}
        for name, number, cc, addr, pincode, gender, dob in customers_data:
            obj, created = Customers.objects.get_or_create(
                number=number,
                defaults={
                    "name": name,
                    "country_code": cc,
                    "address": addr,
                    "pincode": pincode,
                    "gender": gender,
                    "identity_card_1": None,
                    "identity_card_2": None,
                    "date_of_birth": dob,
                },
            )
            if created:
                created_count += 1
            customers[number] = obj

        # ── 9. Groups + CustomerGroups ────────────────────────────────────────
        # Each tuple: list of customer numbers in the group
        group_compositions = [
            ["9876543210"],                          # solo – Arjun
            ["9876543211", "9876543212"],            # pair – Sneha + Vikram
            ["9876543213"],                          # solo – Anjali
            ["9876543214", "9876543215"],            # pair – Rahul + Deepika
            ["9876543216"],                          # solo – Sanjay
            ["9876543217", "9876543218"],            # pair – Pooja + Kartik
            ["9876543219"],                          # solo – Meera
            ["9876543220", "9876543221"],            # pair – John + Emma
            ["9876543222"],                          # solo – Ravi
            ["9876543223", "9876543224"],            # pair – Sara + Mohit
        ]
        groups = []
        for i, member_numbers in enumerate(group_compositions):
            # Use a sentinel customer to find an existing group idempotently
            sentinel = customers[member_numbers[0]]
            existing_groups = Group.objects.filter(
                customers__customer=sentinel
            )
            if existing_groups.exists():
                grp = existing_groups.first()
            else:
                grp = Group.objects.create()
                created_count += 1
                for num in member_numbers:
                    CustomerGroup.objects.create(customer=customers[num], group=grp)
                    created_count += 1
            groups.append(grp)

        # ── 10. RoomStayLogs ──────────────────────────────────────────────────
        # 8 active check-ins + 5 historical (checked out)
        active_stays_data = [
            # (room_number, group_index, days_ago, price, extra_bed, extra_per_bed_price)
            ("101", 0, 2, 1500, 0, 0),
            ("102", 1, 3, 2000, 1, 500),
            ("201", 2, 1, 3500, 0, 0),
            ("202", 3, 4, 3500, 0, 0),
            ("203", 4, 2, 4500, 0, 0),
            ("301", 5, 5, 7000, 1, 500),
            ("302", 6, 1, 8500, 0, 0),
            ("401", 7, 3, 15000, 2, 500),
        ]
        historical_stays_data = [
            # (room_number, group_index, days_ago_checkin, days_ago_checkout, price)
            ("103", 8, 15, 10, 1500),
            ("204", 9, 20, 15, 3500),
            ("104", 0, 30, 25, 2000),
            ("402", 7, 12, 7,  12000),
            ("303", 5, 8, 4, 7000),  # will use 301 instead since 303 doesn't exist
        ]

        active_logs = []
        for room_num, grp_idx, days_ago, price, extra_bed, ebp in active_stays_data:
            if room_num not in rooms:
                continue
            grp = groups[grp_idx]
            # Check if an active stay already exists for this room
            existing = RoomStayLogs.objects.filter(room=rooms[room_num], check_out=None)
            if existing.exists():
                active_logs.append(existing.first())
                continue
            log = RoomStayLogs.objects.create(
                room=rooms[room_num],
                group=grp,
                price=price,
                extra_bed=extra_bed,
                extra_per_bed_price=ebp,
            )
            check_in_dt = NOW - timedelta(days=days_ago)
            RoomStayLogs.objects.filter(pk=log.pk).update(check_in=check_in_dt)
            log.refresh_from_db()
            active_logs.append(log)
            created_count += 1

        historical_logs = []
        historical_corrected = [
            ("103", 8, 15, 10, 1500),
            ("204", 9, 20, 15, 3500),
            ("104", 0, 30, 25, 2000),
            ("402", 7, 12, 7, 12000),
            ("301", 5, 8, 4, 7000),
        ]
        for room_num, grp_idx, days_ago_in, days_ago_out, price in historical_corrected:
            if room_num not in rooms:
                continue
            grp = groups[grp_idx]
            check_in_dt = NOW - timedelta(days=days_ago_in)
            check_out_dt = NOW - timedelta(days=days_ago_out)
            existing = RoomStayLogs.objects.filter(
                room=rooms[room_num],
                group=grp,
                check_out__isnull=False,
            )
            if existing.exists():
                historical_logs.append(existing.first())
                continue
            log = RoomStayLogs.objects.create(
                room=rooms[room_num],
                group=grp,
                price=price,
                check_out=check_out_dt,
            )
            RoomStayLogs.objects.filter(pk=log.pk).update(check_in=check_in_dt)
            log.refresh_from_db()
            historical_logs.append(log)
            created_count += 1

        # ── 11. Reservations ──────────────────────────────────────────────────
        reservations_data = [
            ("103", 8, TODAY + timedelta(days=3),  TODAY + timedelta(days=6),  1500),
            ("204", 9, TODAY + timedelta(days=5),  TODAY + timedelta(days=9),  3500),
            ("302", 5, TODAY + timedelta(days=7),  TODAY + timedelta(days=10), 8500),
            ("402", 7, TODAY + timedelta(days=14), TODAY + timedelta(days=18), 12000),
        ]
        for room_num, grp_idx, ci, co, price in reservations_data:
            if room_num not in rooms:
                continue
            _, created = Reservation.objects.get_or_create(
                room=rooms[room_num],
                group=groups[grp_idx],
                check_in_date=ci,
                defaults={"check_out_date": co, "price": price},
            )
            if created:
                created_count += 1

        # ── 12. StayLogAmenities ──────────────────────────────────────────────
        stay_amenities_data = [
            (0, "Breakfast", 2),
            (1, "Breakfast", 2),
            (1, "Laundry", 1),
            (2, "Room Service", 3),
            (3, "Breakfast", 2),
            (5, "Spa", 1),
            (5, "Breakfast", 2),
            (7, "Spa", 2),
            (7, "Airport Transfer", 1),
            (7, "Breakfast", 4),
        ]
        for log_idx, amenity_name, qty in stay_amenities_data:
            if log_idx >= len(active_logs):
                continue
            log = active_logs[log_idx]
            _, created = StayLogAmenity.objects.get_or_create(
                stay_log=log,
                amenity=amenities[amenity_name],
                defaults={"quantity": qty},
            )
            if created:
                created_count += 1

        # ── 13. Payments (for historical stays) ───────────────────────────────
        receptionist = users["receptionist"]
        payments_data = [
            (0, "cash",  1500 * 5, "Full payment on checkout"),
            (1, "upi",   3500 * 5, "UPI payment"),
            (2, "cash",  2000 * 5, "Cash payment"),
            (3, "card",  12000 * 5, "Card payment"),
            (4, "upi",   7000 * 4, "UPI payment on checkout"),
        ]
        for log_idx, pay_type, amount, note in payments_data:
            if log_idx >= len(historical_logs):
                continue
            log = historical_logs[log_idx]
            _, created = Payment.objects.get_or_create(
                stay_log=log,
                payment_type=pay_type,
                defaults={
                    "amount": amount,
                    "processed_by": receptionist,
                    "note": note,
                },
            )
            if created:
                created_count += 1

        # ── 14. Expenses ──────────────────────────────────────────────────────
        manager = users["manager"]
        expenses_data = [
            ("Grocery supplies for kitchen", 8500, "cash",  TODAY - timedelta(days=2)),
            ("Housekeeping supplies",         3200, "upi",   TODAY - timedelta(days=5)),
            ("Electricity bill payment",     15000, "card",  TODAY - timedelta(days=7)),
            ("Plumber repair charges",        1800, "cash",  TODAY - timedelta(days=10)),
            ("Staff uniforms",               12000, "upi",   TODAY - timedelta(days=15)),
        ]
        for desc, amount, pay_type, exp_date in expenses_data:
            _, created = Expense.objects.get_or_create(
                description=desc,
                date=exp_date,
                defaults={
                    "amount": amount,
                    "payment_type": pay_type,
                    "recorded_by": manager,
                },
            )
            if created:
                created_count += 1

        # ── 15. CashWithdrawals ───────────────────────────────────────────────
        withdrawals_data = [
            (2000, "Petty cash for office supplies", "pending",  receptionist, None,    TODAY),
            (5000, "Advance for vendor payment",      "approved", receptionist, manager, TODAY - timedelta(days=3)),
        ]
        for amount, reason, status, req_by, rev_by, wd_date in withdrawals_data:
            _, created = CashWithdrawal.objects.get_or_create(
                reason=reason,
                date=wd_date,
                defaults={
                    "amount": amount,
                    "status": status,
                    "requested_by": req_by,
                    "reviewed_by": rev_by,
                    "reviewed_on": NOW - timedelta(days=1) if rev_by else None,
                },
            )
            if created:
                created_count += 1

        # ── 16. RoomNCRequest ─────────────────────────────────────────────────
        if active_logs:
            nc_log = active_logs[2]  # Anjali's stay in room 201
            _, created = RoomNCRequest.objects.get_or_create(
                stay_log=nc_log,
                defaults={
                    "reason": "Long-term guest, complimentary upgrade approved by management",
                    "status": "pending",
                    "requested_by": receptionist,
                    "reviewed_by": None,
                },
            )
            if created:
                created_count += 1

        self.stdout.write(
            self.style.SUCCESS(f"Seeding complete. {created_count} records created.")
        )
