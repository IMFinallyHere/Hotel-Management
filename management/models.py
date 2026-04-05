from django.db import models
from django.contrib.auth.models import User
from django.core.validators import FileExtensionValidator
from django.utils import timezone
from rest_framework.exceptions import ValidationError


def validate_file_size(file):
    max_size_mb = 10
    if file.size > max_size_mb * 1024 * 1024:
        raise ValidationError({"non_field_errors": [f"File size must be under {max_size_mb}MB"]})


class CountryCodes(models.Model):
    country_name = models.CharField(max_length=100)
    country_code = models.PositiveSmallIntegerField()


class Customers(models.Model):
    GENDER = [
        ('male', 'MALE'),
        ('female', 'FEMALE'),
        ('trans', 'TRANS'),
        ('other', 'OTHER')
    ]
    name = models.CharField(max_length=100)
    number = models.CharField(max_length=10, unique=True, null=True, blank=True)
    country_code = models.ForeignKey(CountryCodes, models.PROTECT, null=True, blank=True)
    address = models.CharField(max_length=300, null=True, blank=True)
    pincode = models.CharField(max_length=6, null=True, blank=True)
    gender = models.CharField(choices=GENDER, max_length=6, null=True, blank=True)
    identity_card_1 = models.FileField(null=True, blank=True, validators=[FileExtensionValidator(allowed_extensions=['pdf', 'jpeg', 'jpg', 'png']), validate_file_size])
    identity_card_2 = models.FileField(null=True, blank=True, validators=[FileExtensionValidator(allowed_extensions=['pdf', 'jpeg', 'jpg', 'png']), validate_file_size])
    date_of_birth = models.DateField(null=True)
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    first_visit = models.DateTimeField(auto_now_add=True)


class Group(models.Model):
    created_on = models.DateTimeField(auto_now_add=True)


class CustomerGroup(models.Model):
    customer = models.ForeignKey(Customers, models.PROTECT, 'groups')
    group = models.ForeignKey(Group, models.PROTECT, 'customers')

    class Meta:
        unique_together = ('group', 'customer')


class RoomType(models.Model):
    name = models.CharField(max_length=100, unique=True)
    created_on = models.DateTimeField(auto_now_add=True)


class Rooms(models.Model):
    ROOM_STATUS = [('available', 'Available'), ('cleaning', 'Cleaning'), ('out_of_order', 'Out of Order')]
    room_number = models.CharField(unique=True, max_length=10)
    room_type = models.ForeignKey(RoomType, models.PROTECT, 'rooms')
    beds = models.PositiveSmallIntegerField()
    price = models.DecimalField(max_digits=7, decimal_places=0)  # default price
    is_ac = models.BooleanField(default=False)
    status = models.CharField(choices=ROOM_STATUS, max_length=15, default='available')

    def is_occupied(self) -> bool:
        return self.logs.filter(check_out=None).exists()


class RoomStatusLog(models.Model):
    room = models.ForeignKey(Rooms, models.CASCADE, related_name='status_logs')
    old_status = models.CharField(max_length=15)
    new_status = models.CharField(max_length=15)
    changed_by = models.ForeignKey(User, models.SET_NULL, null=True, blank=True)
    changed_on = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['-changed_on']


class RoomsPriceChart(models.Model):
    room = models.ForeignKey(Rooms, models.CASCADE, 'price_chart')
    date = models.DateField()
    price = models.DecimalField(max_digits=7, decimal_places=0)

    class Meta:
        unique_together = [('room', 'date')]


class RoomStayLogs(models.Model):
    room = models.ForeignKey(Rooms, models.CASCADE, 'logs')
    check_in = models.DateTimeField(auto_now_add=True)
    check_out = models.DateTimeField(null=True)
    price = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    group = models.ForeignKey(Group, models.PROTECT, 'logs')
    extra_bed = models.PositiveSmallIntegerField(default=0)
    extra_per_bed_price = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    is_nc = models.BooleanField(default=False)
    expected_checkout = models.DateTimeField(null=True, blank=True)
    overtime_rate = models.DecimalField(max_digits=7, decimal_places=0, null=True, blank=True)
    grace_until = models.DateTimeField(null=True, blank=True)
    is_early_checkin = models.BooleanField(default=False)
    gst_applied = models.BooleanField(default=False)
    gst_inclusive = models.BooleanField(default=False)
    shifted_from = models.ForeignKey('Rooms', models.SET_NULL, null=True, blank=True, related_name='shift_destinations')
    shift_reason = models.TextField(null=True, blank=True)
    is_ac = models.BooleanField(null=True, blank=True)


class Configurations(models.Model):
    key = models.CharField(max_length=30, unique=True)
    value = models.TextField(null=True)


class Reservation(models.Model):
    PAYMENT_TYPES = [('cash', 'Cash'), ('upi', 'UPI'), ('card', 'Card'), ('other', 'Other')]
    room = models.ForeignKey(Rooms, models.CASCADE, 'reservations')
    group = models.ForeignKey(Group, models.PROTECT, 'reservations')
    check_in_date = models.DateField()
    check_out_date = models.DateField()
    price = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    advance_amount = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    advance_payment_type = models.CharField(max_length=10, choices=PAYMENT_TYPES, default='cash', blank=True)
    created_on = models.DateTimeField(auto_now_add=True)


class ReservationReminder(models.Model):
    reservation = models.ForeignKey(Reservation, models.CASCADE, related_name='reminders')
    days_before = models.PositiveSmallIntegerField()
    dismissed_by = models.ManyToManyField(User, blank=True, related_name='dismissed_reminders')
    created_on = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('reservation', 'days_before')


class Amenity(models.Model):
    CHARGE_TYPES = [('flat', 'Flat'), ('per_night', 'Per Night')]
    name = models.CharField(max_length=100, unique=True)
    price = models.DecimalField(max_digits=7, decimal_places=0)
    charge_type = models.CharField(max_length=10, choices=CHARGE_TYPES, default='flat')
    created_on = models.DateTimeField(auto_now_add=True)


class StayLogAmenity(models.Model):
    stay_log = models.ForeignKey(RoomStayLogs, models.CASCADE, 'amenities')
    amenity = models.ForeignKey(Amenity, models.PROTECT, 'usage')
    quantity = models.PositiveSmallIntegerField(default=1)


class ReportPermissions(models.Model):
    class Meta:
        managed = False
        default_permissions = ()
        permissions = [
            ('view_revenue_report', 'Can view revenue report'),
            ('view_occupancy_report', 'Can view occupancy report'),
            ('view_guest_report', 'Can view guest analytics report'),
            ('view_today_overview', 'Can view today overview report'),
            ('view_room_performance_report', 'Can view room performance report'),
            ('view_reservation_report', 'Can view reservation fulfillment report'),
            ('view_clv_report', 'Can view customer lifetime value report'),
            ('view_trends_report', 'Can view seasonal trends report'),
            ('view_stay_duration_report', 'Can view stay duration report'),
            ('view_upsell_report', 'Can view extra bed upsell report'),
            ('view_pipeline_report', 'Can view booking pipeline report'),
            ('view_pl_report', 'Can view P&L report'),
            ('view_staff_sales_report', 'Can view staff sales report'),
            ('view_cash_reconciliation', 'Can view cash reconciliation'),
            ('view_expense_report', 'Can view expense report'),
        ]


class RoomNCRequest(models.Model):
    STATUS = [('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')]
    stay_log = models.ForeignKey(RoomStayLogs, models.CASCADE, 'nc_requests')
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS, default='pending')
    requested_by = models.ForeignKey(User, models.SET_NULL, null=True, related_name='nc_requests_made')
    reviewed_by = models.ForeignKey(User, models.SET_NULL, null=True, blank=True, related_name='nc_requests_reviewed')
    created_on = models.DateTimeField(auto_now_add=True)
    reviewed_on = models.DateTimeField(null=True, blank=True)


class Payment(models.Model):
    TYPES = [('cash', 'Cash'), ('upi', 'UPI'), ('card', 'Card'), ('other', 'Other')]
    stay_log = models.ForeignKey(RoomStayLogs, models.CASCADE, 'payments')
    payment_type = models.CharField(max_length=10, choices=TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=0)
    processed_by = models.ForeignKey(User, models.SET_NULL, null=True, related_name='payments_processed')
    note = models.CharField(max_length=200, blank=True)
    created_on = models.DateTimeField(auto_now_add=True)


class CashWithdrawal(models.Model):
    STATUS = [('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')]
    amount = models.DecimalField(max_digits=10, decimal_places=0)
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS, default='pending')
    requested_by = models.ForeignKey(User, models.SET_NULL, null=True, related_name='cash_withdrawals')
    reviewed_by = models.ForeignKey(User, models.SET_NULL, null=True, blank=True, related_name='cash_withdrawals_reviewed')
    created_on = models.DateTimeField(auto_now_add=True)
    reviewed_on = models.DateTimeField(null=True, blank=True)
    date = models.DateField(default=timezone.localdate)


class Expense(models.Model):
    PAYMENT_TYPES = [('cash', 'Cash'), ('upi', 'UPI'), ('card', 'Card'), ('other', 'Other')]
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=0)
    payment_type = models.CharField(max_length=10, choices=PAYMENT_TYPES)
    recorded_by = models.ForeignKey(User, models.SET_NULL, null=True, related_name='expenses')
    date = models.DateField(default=timezone.localdate)
    created_on = models.DateTimeField(auto_now_add=True)
