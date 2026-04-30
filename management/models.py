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
    cancellation_fee = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    overtime_fee = models.DecimalField(max_digits=7, decimal_places=0, default=0)

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
    overtime_fee_charged = models.DecimalField(max_digits=7, decimal_places=0, null=True, blank=True)
    overtime_fee_default = models.DecimalField(max_digits=7, decimal_places=0, null=True, blank=True)
    checked_out_by = models.ForeignKey(User, models.SET_NULL, null=True, blank=True, related_name='checkouts')
    grace_until = models.DateTimeField(null=True, blank=True)
    is_early_checkin = models.BooleanField(default=False)
    gst_applied = models.BooleanField(default=False)
    gst_inclusive = models.BooleanField(default=False)
    shifted_from = models.ForeignKey('Rooms', models.SET_NULL, null=True, blank=True, related_name='shift_destinations')
    shift_reason = models.TextField(null=True, blank=True)
    is_ac = models.BooleanField(null=True, blank=True)
    checked_in_by = models.ForeignKey(User, models.SET_NULL, null=True, blank=True, related_name='checkins')
    male_count = models.PositiveSmallIntegerField(default=0)
    female_count = models.PositiveSmallIntegerField(default=0)
    child_count = models.PositiveSmallIntegerField(default=0)


class Configurations(models.Model):
    key = models.CharField(max_length=30, unique=True)
    value = models.TextField(null=True)


class PaymentMethod(models.Model):
    name = models.CharField(max_length=50, unique=True)
    is_active = models.BooleanField(default=True)
    created_on = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Reservation(models.Model):
    room = models.ForeignKey(Rooms, models.CASCADE, 'reservations')
    group = models.ForeignKey(Group, models.PROTECT, 'reservations')
    check_in_date = models.DateField()
    check_out_date = models.DateField()
    price = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    advance_amount = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    advance_payment_method = models.ForeignKey(PaymentMethod, models.SET_NULL, null=True, blank=True, related_name='reservations')
    created_on = models.DateTimeField(auto_now_add=True)
    is_cancelled = models.BooleanField(default=False)


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
            ('view_cancellation_report', 'Can view cancellation report'),
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
    stay_log = models.ForeignKey(RoomStayLogs, models.CASCADE, 'payments')
    payment_method = models.ForeignKey(PaymentMethod, models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=0)
    processed_by = models.ForeignKey(User, models.SET_NULL, null=True, related_name='payments_processed')
    note = models.CharField(max_length=200, blank=True)
    created_on = models.DateTimeField(auto_now_add=True)


class CashWithdrawal(models.Model):
    amount = models.DecimalField(max_digits=10, decimal_places=0)
    reason = models.TextField()
    requested_by = models.ForeignKey(User, models.SET_NULL, null=True, related_name='cash_withdrawals')
    created_on = models.DateTimeField(auto_now_add=True)
    date = models.DateField(default=timezone.localdate)


class Expense(models.Model):
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=0)
    payment_method = models.ForeignKey(PaymentMethod, models.PROTECT, related_name='expenses')
    recorded_by = models.ForeignKey(User, models.SET_NULL, null=True, related_name='expenses')
    date = models.DateField(default=timezone.localdate)
    created_on = models.DateTimeField(auto_now_add=True)


class ExpenseAttachment(models.Model):
    expense = models.ForeignKey(Expense, models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='expense_attachments/')
    uploaded_on = models.DateTimeField(auto_now_add=True)


class StayVehicle(models.Model):
    stay = models.ForeignKey(RoomStayLogs, models.CASCADE, related_name='vehicles')
    vehicle_number = models.CharField(max_length=20)


class FoodOrder(models.Model):
    stay_log = models.ForeignKey(RoomStayLogs, models.CASCADE, related_name='food_orders')
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=8, decimal_places=0)
    is_paid = models.BooleanField(default=False)
    food_gst_inclusive = models.BooleanField(default=True)
    payment_method = models.ForeignKey(PaymentMethod, models.SET_NULL, null=True, blank=True, related_name='food_payments')
    paid_by = models.ForeignKey(User, models.SET_NULL, null=True, blank=True, related_name='food_orders_paid')
    ordered_by = models.ForeignKey(User, models.SET_NULL, null=True, blank=True, related_name='food_orders_taken')
    ordered_at = models.DateTimeField(auto_now_add=True)


class FoodOrderReceipt(models.Model):
    food_order = models.ForeignKey(FoodOrder, models.CASCADE, related_name='receipts')
    file = models.FileField(upload_to='food_receipts/', validators=[FileExtensionValidator(allowed_extensions=['pdf', 'jpeg', 'jpg', 'png']), validate_file_size])
    uploaded_on = models.DateTimeField(auto_now_add=True)


class CancellationLog(models.Model):
    TYPE_CHOICES = [('checkin', 'Check-in'), ('reservation', 'Reservation')]
    cancellation_type = models.CharField(max_length=15, choices=TYPE_CHOICES)
    stay_log = models.ForeignKey(RoomStayLogs, models.SET_NULL, null=True, blank=True, related_name='cancellations')
    reservation = models.ForeignKey(Reservation, models.SET_NULL, null=True, blank=True, related_name='cancellations')
    room = models.ForeignKey(Rooms, models.SET_NULL, null=True, related_name='cancellation_logs')
    room_number = models.CharField(max_length=10)
    group = models.ForeignKey(Group, models.SET_NULL, null=True, blank=True, related_name='cancellations')
    reason = models.TextField()
    default_fee = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    cancellation_fee = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    cancelled_by = models.ForeignKey(User, models.SET_NULL, null=True, related_name='cancellations_made')
    cancelled_on = models.DateTimeField(auto_now_add=True)
