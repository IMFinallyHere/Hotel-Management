import datetime
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Rooms, RoomType, CountryCodes, Customers, Configurations, RoomStayLogs, RoomsPriceChart, Reservation, ReservationReminder, Amenity, StayLogAmenity, RoomNCRequest, Payment, CashWithdrawal, Expense, ExpenseAttachment, RoomStatusLog, PaymentMethod


class RoomTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomType
        fields = ['id', 'name', 'created_on']


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rooms
        fields = ['id', 'room_number', 'room_type', 'beds', 'price', 'is_ac', 'status']


class RoomStatusLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RoomStatusLog
        fields = ['id', 'old_status', 'new_status', 'changed_by_name', 'changed_on', 'note']

    def get_changed_by_name(self, obj):
        if not obj.changed_by:
            return 'System'
        return obj.changed_by.get_full_name() or obj.changed_by.username


class CountryCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CountryCodes
        fields = ['id', 'country_name', 'country_code']


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customers
        fields = ['id', 'name', 'number', 'country_code', 'address', 'pincode', 'gender',
                  'identity_card_1', 'identity_card_2', 'date_of_birth', 'age', 'first_visit']


class ConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Configurations
        fields = ['id', 'key', 'value']


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ['id', 'name', 'is_active', 'created_on']


class RoomsPriceChartSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomsPriceChart
        fields = ['id', 'room', 'date', 'price']


class CheckinSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomStayLogs
        fields = ['room', 'price', 'group', 'extra_bed', 'extra_per_bed_price', 'expected_checkout', 'gst_applied', 'gst_inclusive', 'is_ac']
        extra_kwargs = {
            'price': {'required': False, 'default': 0},
            'expected_checkout': {'required': False},
            'gst_applied': {'required': False, 'default': False},
            'gst_inclusive': {'required': False, 'default': False},
            'is_ac': {'required': False, 'default': None},
        }

    @staticmethod
    def validate_room(value):
        room = get_object_or_404(Rooms, pk=value.pk)
        if room.is_occupied():
            raise ValidationError('Room is already occupied. Please checkout room to occupy it again.')
        if room.status != 'available':
            raise ValidationError(f'Room cannot be checked in (status: {room.get_status_display()}).')
        return room

    def validate(self, attrs):
        price = attrs.get('price', 0)
        if not price:
            room = attrs['room']
            today = timezone.localdate()
            chart_entry = RoomsPriceChart.objects.filter(room=room, date=today).first()
            attrs['price'] = chart_entry.price if chart_entry else room.price

        # Snapshot overtime rate
        attrs['overtime_rate'] = attrs['price']

        # Detect early check-in vs. default_checkin_time config
        cfg = Configurations.objects.filter(key='default_checkin_time').first()
        if cfg and cfg.value:
            h, m = map(int, cfg.value.split(':'))
            attrs['is_early_checkin'] = timezone.localtime().time() < datetime.time(h, m)
        else:
            attrs['is_early_checkin'] = False

        return attrs


class StayLogSerializer(serializers.ModelSerializer):
    checked_in_by_name = serializers.SerializerMethodField()

    def get_checked_in_by_name(self, obj):
        u = obj.checked_in_by
        if not u:
            return None
        return u.get_full_name() or u.username

    class Meta:
        model = RoomStayLogs
        fields = ['id', 'room', 'group', 'check_in', 'check_out', 'price', 'extra_bed', 'extra_per_bed_price', 'is_nc',
                  'expected_checkout', 'overtime_rate', 'grace_until', 'is_early_checkin', 'gst_applied', 'gst_inclusive',
                  'shifted_from', 'shift_reason', 'is_ac', 'checked_in_by_name']


class StayLogUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomStayLogs
        fields = ['extra_bed', 'extra_per_bed_price']


class GroupCustomerSerializer(serializers.Serializer):
    customers = serializers.ListSerializer(child=serializers.PrimaryKeyRelatedField(queryset=Customers.objects.all()), required=True, allow_null=False, allow_empty=False)


class ReservationReminderSerializer(serializers.ModelSerializer):
    room_number = serializers.SerializerMethodField()
    check_in_date = serializers.SerializerMethodField()
    is_dismissed = serializers.SerializerMethodField()

    class Meta:
        model = ReservationReminder
        fields = ['id', 'reservation', 'days_before', 'is_dismissed', 'created_on', 'room_number', 'check_in_date']

    def get_room_number(self, obj):
        return obj.reservation.room.room_number

    def get_check_in_date(self, obj):
        return str(obj.reservation.check_in_date)

    def get_is_dismissed(self, obj):
        request = self.context.get('request')
        if not request:
            return False
        return obj.dismissed_by.filter(pk=request.user.pk).exists()


class ReservationSerializer(serializers.ModelSerializer):
    reminders = serializers.SerializerMethodField()
    room_number = serializers.CharField(source='room.room_number', read_only=True)
    customers = serializers.SerializerMethodField()
    advance_payment_method_name = serializers.CharField(source='advance_payment_method.name', read_only=True, default=None)

    def get_reminders(self, obj):
        request = self.context.get('request')
        qs = obj.reminders.all()
        return ReservationReminderSerializer(qs, many=True, context={'request': request}).data

    def get_customers(self, obj):
        return [
            {'id': cg.customer.id, 'name': cg.customer.name, 'number': cg.customer.number}
            for cg in obj.group.customers.select_related('customer').all()
        ]

    class Meta:
        model = Reservation
        fields = ['id', 'room', 'room_number', 'group', 'customers', 'check_in_date', 'check_out_date', 'price', 'advance_amount', 'advance_payment_method', 'advance_payment_method_name', 'created_on', 'reminders']

    def validate(self, attrs):
        check_in = attrs.get('check_in_date')
        check_out = attrs.get('check_out_date')

        if check_in and check_out and check_out < check_in:
            raise ValidationError({'check_out_date': 'Check-out date must be after check-in date.'})

        room = attrs.get('room')
        if room and check_in and check_out:
            instance_id = self.instance.id if self.instance else None
            overlapping = Reservation.objects.filter(
                room=room,
                check_in_date__lt=check_out,
                check_out_date__gt=check_in,
            )
            if instance_id:
                overlapping = overlapping.exclude(id=instance_id)
            if overlapping.exists():
                raise ValidationError('This room already has a reservation overlapping those dates.')

        return attrs


class AmenitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Amenity
        fields = ['id', 'name', 'price', 'charge_type', 'created_on']


class StayLogAmenitySerializer(serializers.ModelSerializer):
    amenity_name = serializers.CharField(source='amenity.name', read_only=True)
    amenity_price = serializers.DecimalField(source='amenity.price', max_digits=7, decimal_places=0, read_only=True)
    charge_type = serializers.CharField(source='amenity.charge_type', read_only=True)

    class Meta:
        model = StayLogAmenity
        fields = ['id', 'stay_log', 'amenity', 'quantity', 'amenity_name', 'amenity_price', 'charge_type']
        extra_kwargs = {'stay_log': {'read_only': True}}


class ActiveStayLogSerializer(StayLogSerializer):
    customers = serializers.SerializerMethodField()
    amenities = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    nc_status = serializers.SerializerMethodField()

    class Meta(StayLogSerializer.Meta):
        fields = StayLogSerializer.Meta.fields + ['is_nc', 'customers', 'amenities', 'payments', 'nc_status']

    def get_customers(self, obj):
        return [
            {
                'id': cg.customer.id,
                'name': cg.customer.name,
                'number': cg.customer.number,
                'gender': cg.customer.gender,
                'date_of_birth': str(cg.customer.date_of_birth) if cg.customer.date_of_birth else None,
                'age': cg.customer.age,
                'address': cg.customer.address,
                'pincode': cg.customer.pincode,
            }
            for cg in obj.group.customers.select_related('customer').all()
        ]

    def get_amenities(self, obj):
        return [
            {
                'id': sa.id,
                'amenity_id': sa.amenity_id,
                'name': sa.amenity.name,
                'price': sa.amenity.price,
                'charge_type': sa.amenity.charge_type,
                'quantity': sa.quantity,
            }
            for sa in obj.amenities.all()
        ]

    def get_payments(self, obj):
        return [
            {
                'id': p.id,
                'payment_method': p.payment_method_id,
                'payment_method_name': p.payment_method.name if p.payment_method else None,
                'amount': p.amount,
                'processed_by_name': p.processed_by.get_full_name() or p.processed_by.username if p.processed_by else None,
                'note': p.note,
                'created_on': p.created_on,
            }
            for p in obj.payments.select_related('payment_method').all()
        ]

    def get_nc_status(self, obj):
        latest = obj.nc_requests.order_by('-created_on').first()
        if not latest:
            return None
        return {'id': latest.id, 'status': latest.status, 'reason': latest.reason}


class RoomNCRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    room_number = serializers.SerializerMethodField()
    guest_names = serializers.SerializerMethodField()

    class Meta:
        model = RoomNCRequest
        fields = ['id', 'stay_log', 'reason', 'status', 'requested_by', 'requested_by_name',
                  'reviewed_by', 'reviewed_by_name', 'created_on', 'reviewed_on', 'room_number', 'guest_names']
        read_only_fields = ['status', 'requested_by', 'reviewed_by', 'reviewed_on']

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.username
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username
        return None

    def get_room_number(self, obj):
        return obj.stay_log.room.room_number

    def get_guest_names(self, obj):
        return [cg.customer.name for cg in obj.stay_log.group.customers.all()]


class PaymentSerializer(serializers.ModelSerializer):
    processed_by_name = serializers.SerializerMethodField()
    payment_method_name = serializers.CharField(source='payment_method.name', read_only=True)

    class Meta:
        model = Payment
        fields = ['id', 'stay_log', 'payment_method', 'payment_method_name', 'amount', 'processed_by', 'processed_by_name', 'note', 'created_on']
        read_only_fields = ['processed_by']
        extra_kwargs = {'stay_log': {'read_only': True}}

    def get_processed_by_name(self, obj):
        if obj.processed_by:
            return obj.processed_by.get_full_name() or obj.processed_by.username
        return None


class CashWithdrawalSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CashWithdrawal
        fields = ['id', 'amount', 'reason', 'status', 'requested_by', 'requested_by_name',
                  'reviewed_by', 'reviewed_by_name', 'created_on', 'reviewed_on', 'date']
        read_only_fields = ['status', 'requested_by', 'reviewed_by', 'reviewed_on']

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.username
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username
        return None


class ExpenseAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseAttachment
        fields = ['id', 'file', 'uploaded_on']


class ExpenseSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()
    payment_method_name = serializers.CharField(source='payment_method.name', read_only=True)
    attachments = ExpenseAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Expense
        fields = ['id', 'description', 'amount', 'payment_method', 'payment_method_name', 'recorded_by', 'recorded_by_name', 'date', 'created_on', 'attachments']
        read_only_fields = ['recorded_by']

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return obj.recorded_by.get_full_name() or obj.recorded_by.username
        return None


class ExtendStaySerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomStayLogs
        fields = ['expected_checkout']

    def validate_expected_checkout(self, value):
        if value <= timezone.now():
            raise ValidationError('New checkout must be in the future.')
        return value


class GraceSerializer(serializers.Serializer):
    hours = serializers.IntegerField(min_value=1, max_value=3)


class ShiftRoomSerializer(serializers.Serializer):
    new_room = serializers.PrimaryKeyRelatedField(queryset=Rooms.objects.all())
    reason = serializers.CharField(max_length=500)
    apply_extra_beds = serializers.BooleanField(default=True)
    extra_bed = serializers.IntegerField(min_value=0, required=False)
    extra_per_bed_price = serializers.DecimalField(max_digits=7, decimal_places=0, required=False)
    price = serializers.DecimalField(max_digits=7, decimal_places=0, required=False)
