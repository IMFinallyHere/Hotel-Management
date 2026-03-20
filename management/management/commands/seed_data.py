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
            ("default_checkin_time", "14:00"),
            ("default_checkout_time", "11:00"),
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
            ("101", "Standard", 1, 1500),
            ("102", "Standard", 2, 2000),
            ("103", "Standard", 1, 1500),
            ("104", "Standard", 2, 2000),
            ("201", "Deluxe", 2, 3500),
            ("202", "Deluxe", 2, 3500),
            ("203", "Deluxe", 3, 4500),
            ("204", "Deluxe", 2, 3500),
            ("301", "Suite", 2, 7000),
            ("302", "Suite", 3, 8500),
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
            ("Arjun Kapoor",      "9876543210", india, "Mumbai, Maharashtra",   "400001", "male",   date(1990, 5, 15)),
            ("Sneha Reddy",       "9876543211", india, "Hyderabad, Telangana",  "500001", "female", date(1993, 8, 22)),
            ("Vikram Singh",      "9876543212", india, "Delhi",                 "110001", "male",   date(1985, 3, 10)),
            ("Anjali Patel",      "9876543213", india, "Ahmedabad, Gujarat",    "380001", "female", date(1997, 11, 5)),
            ("Rahul Joshi",       "9876543214", india, "Pune, Maharashtra",     "411001", "male",   date(1988, 7, 18)),
            ("Deepika Nair",      "9876543215", india, "Kochi, Kerala",         "682001", "female", date(1995, 2, 28)),
            ("Sanjay Gupta",      "9876543216", india, "Jaipur, Rajasthan",     "302001", "male",   date(1980, 12, 3)),
            ("Pooja Iyer",        "9876543217", india, "Chennai, Tamil Nadu",   "600001", "female", date(1992, 6, 14)),
            ("Kartik Malhotra",   "9876543218", india, "Kolkata, West Bengal",  "700001", "male",   date(1991, 4, 25)),
            ("Meera Bose",        "9876543219", india, "Bhopal, MP",            "462001", "female", date(1994, 9, 8)),
            ("John Smith",        "9876543220", usa,   "New York, NY 10001",    "10001",  "male",   date(1978, 1, 30)),
            ("Emma Wilson",       "9876543221", uk,    "London, EC1A 1BB",      None,     "female", date(1986, 7, 12)),
            ("Ravi Kumar",        "9876543222", india, "Bengaluru, Karnataka",  "560001", "male",   date(1989, 3, 17)),
            ("Sara Ahmed",        "9876543223", uae,   "Dubai, UAE",            None,     "female", date(1996, 10, 20)),
            ("Mohit Sharma",      "9876543224", india, "Lucknow, UP",           "226001", "male",   date(1983, 5, 7)),
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
        group_compositions = [
            ["9876543210"],                      # 0 – Arjun (solo)
            ["9876543211", "9876543212"],        # 1 – Sneha + Vikram
            ["9876543213"],                      # 2 – Anjali (solo)
            ["9876543214", "9876543215"],        # 3 – Rahul + Deepika
            ["9876543216"],                      # 4 – Sanjay (solo)
            ["9876543217", "9876543218"],        # 5 – Pooja + Kartik
            ["9876543219"],                      # 6 – Meera (solo)
            ["9876543220", "9876543221"],        # 7 – John + Emma
            ["9876543222"],                      # 8 – Ravi (solo)
            ["9876543223", "9876543224"],        # 9 – Sara + Mohit
        ]
        groups = []
        for member_numbers in group_compositions:
            sentinel = customers[member_numbers[0]]
            existing_groups = Group.objects.filter(customers__customer=sentinel)
            if existing_groups.exists():
                grp = existing_groups.first()
            else:
                grp = Group.objects.create()
                created_count += 1
                for num in member_numbers:
                    CustomerGroup.objects.create(customer=customers[num], group=grp)
                    created_count += 1
            groups.append(grp)

        # ── 10. Active RoomStayLogs ───────────────────────────────────────────
        # Columns: room, grp_idx, days_ago, price, extra_bed, ebp, nights_booked, is_early, gst_applied
        active_stays_data = [
            # Room 101 – Arjun, 2 nights in, checkout tomorrow, WITH GST, partially paid
            ("101", 0, 2, 1500,  0,   0, 3, False, True),
            # Room 102 – Sneha+Vikram, OVERTIME, extra bed, WITH GST, no payment yet
            ("102", 1, 3, 2000,  1, 500, 2, False, True),
            # Room 201 – Anjali, on-time, NO GST, NC request pending
            ("201", 2, 1, 3500,  0,   0, 3, False, False),
            # Room 202 – Rahul+Deepika, OVERTIME, WITH GST, advance paid
            ("202", 3, 4, 3500,  0,   0, 3, False, True),
            # Room 203 – Sanjay, early check-in, WITH GST, no payment
            ("203", 4, 2, 4500,  0,   0, 4, True,  True),
            # Room 301 – Pooja+Kartik, suite, WITH GST + extra bed, advance paid
            ("301", 5, 5, 7000,  1, 500, 6, False, True),
            # Room 302 – Meera, suite, on-time, NO GST, fully paid
            ("302", 6, 1, 8500,  0,   0, 2, False, False),
            # Room 401 – John+Emma, presidential, WITH GST, 2 extra beds, advance paid
            ("401", 7, 3, 15000, 2, 500, 3, False, True),
        ]

        DEFAULT_CHECKOUT_HOUR = 11

        active_logs = []
        for room_num, grp_idx, days_ago, price, extra_bed, ebp, nights_booked, is_early, gst_applied in active_stays_data:
            if room_num not in rooms:
                continue
            grp = groups[grp_idx]
            check_in_dt = NOW - timedelta(days=days_ago)
            expected_co = (check_in_dt + timedelta(days=nights_booked)).replace(
                hour=DEFAULT_CHECKOUT_HOUR, minute=0, second=0, microsecond=0
            )
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
                expected_checkout=expected_co,
                overtime_rate=price,
                is_early_checkin=is_early,
                gst_applied=gst_applied,
            )
            RoomStayLogs.objects.filter(pk=log.pk).update(check_in=check_in_dt)
            log.refresh_from_db()
            active_logs.append(log)
            created_count += 1

        # ── 11. Historical RoomStayLogs ───────────────────────────────────────
        # Columns: room, grp_idx, days_ago_checkin, days_ago_checkout, price, extra_bed, ebp, gst_applied
        historical_stays_data = [
            ("103", 8,  15, 10, 1500,  0,   0, True),   # Ravi, Standard, GST
            ("204", 9,  20, 15, 3500,  0,   0, True),   # Sara+Mohit, Deluxe, GST
            ("104", 0,  30, 25, 2000,  1, 500, False),  # Arjun, Standard + extra bed, no GST
            ("402", 7,  12,  7, 12000, 0,   0, True),   # John+Emma, Presidential, GST
            ("301", 5,   8,  4, 7000,  0,   0, True),   # Pooja+Kartik, Suite, GST
            ("102", 2,  45, 40, 2000,  0,   0, False),  # Anjali, older stay, no GST
            ("201", 3,  60, 55, 3500,  0,   0, True),   # Rahul+Deepika, older, GST
            ("203", 6,  25, 21, 4500,  1, 500, True),   # Meera, Deluxe + extra, GST
        ]

        historical_logs = []
        for room_num, grp_idx, days_in, days_out, price, extra_bed, ebp, gst_applied in historical_stays_data:
            if room_num not in rooms:
                continue
            grp = groups[grp_idx]
            check_in_dt = NOW - timedelta(days=days_in)
            check_out_dt = NOW - timedelta(days=days_out)
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
                extra_bed=extra_bed,
                extra_per_bed_price=ebp,
                overtime_rate=price,
                check_out=check_out_dt,
                gst_applied=gst_applied,
            )
            RoomStayLogs.objects.filter(pk=log.pk).update(check_in=check_in_dt)
            log.refresh_from_db()
            historical_logs.append(log)
            created_count += 1

        # ── 12. Reservations ──────────────────────────────────────────────────
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

        # ── 13. StayLogAmenities (active stays) ───────────────────────────────
        # (active_log_idx, amenity_name, qty)
        stay_amenities_data = [
            (0, "Breakfast",        2),   # Room 101
            (1, "Breakfast",        2),   # Room 102
            (1, "Laundry",          1),
            (2, "Room Service",     3),   # Room 201
            (3, "Breakfast",        2),   # Room 202
            (5, "Spa",              1),   # Room 301
            (5, "Breakfast",        2),
            (7, "Spa",              2),   # Room 401
            (7, "Airport Transfer", 1),
            (7, "Breakfast",        4),
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

        # ── 14. StayLogAmenities (historical stays) ───────────────────────────
        hist_amenities_data = [
            (0, "Breakfast",    2),   # 103 Ravi
            (1, "Spa",          1),   # 204 Sara+Mohit
            (1, "Laundry",      1),
            (3, "Breakfast",    4),   # 402 John+Emma
            (3, "Airport Transfer", 1),
            (4, "Spa",          1),   # 301 Pooja+Kartik
            (4, "Breakfast",    2),
            (7, "Breakfast",    2),   # 203 Meera
        ]
        for log_idx, amenity_name, qty in hist_amenities_data:
            if log_idx >= len(historical_logs):
                continue
            log = historical_logs[log_idx]
            _, created = StayLogAmenity.objects.get_or_create(
                stay_log=log,
                amenity=amenities[amenity_name],
                defaults={"quantity": qty},
            )
            if created:
                created_count += 1

        # ── 15. Payments ──────────────────────────────────────────────────────
        receptionist = users["receptionist"]
        manager_user = users["manager"]

        # Payments for ACTIVE stays (some partial, some advances)
        # Tuple: (active_log_idx, payment_type, amount, note)
        # Room 101 – Arjun, GST. Bill = 1500*2 days + GST 12% = 3000+360=3360. Pay 2000 advance.
        # Room 202 – Rahul+Deepika, OVERTIME+GST. Advance 5000.
        # Room 301 – Pooja+Kartik, Suite+GST+extras. Advance 15000.
        # Room 401 – John+Emma, Presidential+GST. Advance 20000.
        # Room 302 – Meera, NO GST. Full pay = 8500*1 = 8500.
        active_payments_data = [
            (0, "cash", 2000,  "Advance payment at check-in"),        # 101 – partial
            (3, "upi",  5000,  "Advance UPI at check-in"),            # 202 – partial
            (5, "card", 15000, "Card advance, suite booking"),        # 301 – partial
            (6, "cash", 8500,  "Full payment, no GST"),               # 302 – full
            (7, "upi",  20000, "Advance, international guest"),       # 401 – partial
        ]
        for log_idx, pay_type, amount, note in active_payments_data:
            if log_idx >= len(active_logs):
                continue
            log = active_logs[log_idx]
            _, created = Payment.objects.get_or_create(
                stay_log=log,
                payment_type=pay_type,
                defaults={"amount": amount, "processed_by": receptionist, "note": note},
            )
            if created:
                created_count += 1

        # Payments for HISTORICAL stays (complete, so invoices make sense)
        # Compute exact bills:
        # 103 Ravi: 5 nights × 1500 = 7500 + GST 12% on 7500 = 900 + Breakfast 2×350×5 = 3500 → total 11900
        # 204 Sara+Mohit: 5 nights × 3500 = 17500 + GST = 2100 + Spa 1500 + Laundry 200 → 21300
        # 104 Arjun: 5 nights × (2000+1×500) = 12500, no GST → 12500
        # 402 John+Emma: 5 nights × 12000 = 60000 + GST 12% = 7200 + Breakfast 4×350×5=7000 + Airport 800 → 75000
        # 301 Pooja+Kartik: 4 nights × 7000 = 28000 + GST = 3360 + Spa 1500 + Breakfast 2×350×4=2800 → 35660
        # 102 Anjali (older): 5 nights × 2000 = 10000, no GST → 10000
        # 201 Rahul+Deepika: 5 nights × 3500 = 17500 + GST = 2100 → 19600
        # 203 Meera: 4 nights × (4500+1×500) = 20000 + GST = 2400 → 22400 + Breakfast 2×350×4=2800 → 25200
        historical_payments_data = [
            (0, "cash",  11900, receptionist, "Full payment – Ravi checkout"),
            (1, "upi",   21300, receptionist, "Full payment – Sara+Mohit checkout"),
            (2, "cash",  12500, receptionist, "Full payment – Arjun, no GST"),
            (3, "card",  75000, manager_user, "Card payment – international guests"),
            (4, "upi",   35660, receptionist, "Full payment – Pooja+Kartik"),
            (5, "cash",  10000, receptionist, "Full payment – Anjali older stay"),
            (6, "upi",   19600, receptionist, "UPI – Rahul+Deepika"),
            (7, "cash",  25200, receptionist, "Cash – Meera"),
        ]
        for log_idx, pay_type, amount, processed_by, note in historical_payments_data:
            if log_idx >= len(historical_logs):
                continue
            log = historical_logs[log_idx]
            _, created = Payment.objects.get_or_create(
                stay_log=log,
                payment_type=pay_type,
                defaults={"amount": amount, "processed_by": processed_by, "note": note},
            )
            if created:
                created_count += 1

        # ── 16. Expenses ──────────────────────────────────────────────────────
        expenses_data = [
            ("Grocery supplies for kitchen",  8500,  "cash", TODAY - timedelta(days=2)),
            ("Housekeeping supplies",          3200,  "upi",  TODAY - timedelta(days=5)),
            ("Electricity bill payment",      15000,  "card", TODAY - timedelta(days=7)),
            ("Plumber repair charges",         1800,  "cash", TODAY - timedelta(days=10)),
            ("Staff uniforms",               12000,  "upi",  TODAY - timedelta(days=15)),
            ("Linen and towels restock",       5500,  "cash", TODAY - timedelta(days=20)),
            ("Kitchen equipment repair",       9000,  "card", TODAY - timedelta(days=25)),
        ]
        for desc, amount, pay_type, exp_date in expenses_data:
            _, created = Expense.objects.get_or_create(
                description=desc,
                date=exp_date,
                defaults={"amount": amount, "payment_type": pay_type, "recorded_by": manager_user},
            )
            if created:
                created_count += 1

        # ── 17. CashWithdrawals ───────────────────────────────────────────────
        withdrawals_data = [
            (2000, "Petty cash for office supplies", "pending",  receptionist, None,         TODAY),
            (5000, "Advance for vendor payment",      "approved", receptionist, manager_user, TODAY - timedelta(days=3)),
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

        # ── 18. NC Request ────────────────────────────────────────────────────
        if len(active_logs) > 2:
            nc_log = active_logs[2]  # Anjali's stay in room 201 (no GST)
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
