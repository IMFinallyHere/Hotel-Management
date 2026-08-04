import json
import statistics
from collections import defaultdict
from datetime import timedelta, date as date_type
from decimal import Decimal

from rest_framework import generics
from rest_framework.views import APIView
from django.db.models import Q, Count
from django.db.models import ProtectedError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.files.storage import default_storage
from django.core.exceptions import SuspiciousFileOperation
from django.http import FileResponse, Http404
from .models import Rooms, RoomType, CountryCodes, Customers, Configurations, RoomStayLogs, Group, CustomerGroup, RoomsPriceChart, Reservation, ReservationPayment, ReservationReminder, Amenity, StayLogAmenity, RoomNCRequest, Payment, CashWithdrawal, Expense, ExpenseAttachment, ExpenseCategory, Income, IncomeAttachment, IncomeCategory, RoomStatusLog, PaymentMethod, StayVehicle, FoodOrder, FoodOrderReceipt, CancellationLog, CancellationRefund, MoneyEvent, DailySettlement, SettlementMethodBreakdown, StayNote
from .serializers import RoomSerializer, RoomTypeSerializer, CountryCodeSerializer, CustomerSerializer, ConfigurationSerializer, CheckinSerializer, GroupCustomerSerializer, RoomsPriceChartSerializer, StayLogSerializer, StayLogUpdateSerializer, ReservationSerializer, ReservationReminderSerializer, AmenitySerializer, StayLogAmenitySerializer, ActiveStayLogSerializer, RoomNCRequestSerializer, PaymentSerializer, CashWithdrawalSerializer, ExpenseSerializer, ExpenseAttachmentSerializer, ExpenseCategorySerializer, IncomeSerializer, IncomeAttachmentSerializer, IncomeCategorySerializer, ExtendStaySerializer, GraceSerializer, ShiftRoomSerializer, RoomStatusLogSerializer, PaymentMethodSerializer, StayVehicleSerializer, FoodOrderSerializer, FoodOrderReceiptSerializer, CancellationLogSerializer, StayNoteSerializer
from .ledger import record_money_event, assert_date_not_settled
from .settlement import compute_settlement_snapshot, serialize_event
from .permissions import report_permission, HasModelPermission
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import DjangoModelPermissions
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes


def _parse_money(value, default=Decimal('0')):
    from decimal import InvalidOperation
    if value in (None, ''):
        return default
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        return default
    return amount if amount >= 0 else default


def _create_cancellation_refund(cancellation, request, available_amount):
    refund_amount = _parse_money(request.data.get('refund_amount'))
    if refund_amount <= 0:
        return None
    if refund_amount > available_amount:
        raise ValueError(f'Refund cannot exceed received amount of ₹{available_amount}.')
    payment_method_id = request.data.get('refund_payment_method')
    if not payment_method_id:
        raise ValueError('Refund payment method is required when refund amount is greater than 0.')
    payment_method = get_object_or_404(PaymentMethod, pk=payment_method_id)
    refund = CancellationRefund.objects.create(
        cancellation=cancellation,
        amount=refund_amount,
        payment_method=payment_method,
        processed_by=request.user,
        note=request.data.get('refund_note', '').strip(),
    )
    record_money_event(
        'refund_paid', refund_amount,
        payment_method=payment_method,
        recorded_by=request.user,
        cancellation=cancellation,
        note=request.data.get('refund_note', '').strip(),
    )
    return refund


def _reservation_group_advance_summary(group_id):
    advance_total = sum(p.amount for p in ReservationPayment.objects.filter(group_id=group_id))
    cancellation_fee_total = sum(
        c.cancellation_fee
        for c in CancellationLog.objects.filter(group_id=group_id, cancellation_type='reservation')
    )
    refund_total = sum(
        r.amount
        for r in CancellationRefund.objects.filter(
            cancellation__group_id=group_id,
            cancellation__cancellation_type='reservation',
        )
    )
    applied_total = sum(
        r.applied_advance
        for r in Reservation.objects.filter(group_id=group_id, is_converted=True)
    )
    return {
        'advance_total': advance_total,
        'refund_total': refund_total,
        'cancellation_fee_total': cancellation_fee_total,
        'applied_total': applied_total,
        'advance_available': max(Decimal('0'), advance_total - refund_total - cancellation_fee_total - applied_total),
    }


class RoomTypeListCreate(generics.ListCreateAPIView):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer
    permission_classes = [DjangoModelPermissions]


class RoomTypeDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer
    permission_classes = [DjangoModelPermissions]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'error': 'Cannot delete room type — it is assigned to one or more rooms.'}, status=400)


class RoomListCreate(generics.ListCreateAPIView):
    queryset = Rooms.objects.all().order_by('room_number')
    serializer_class = RoomSerializer
    permission_classes = [DjangoModelPermissions]


class RoomDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Rooms.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [DjangoModelPermissions]

    def perform_update(self, serializer):
        old_status = self.get_object().status
        instance = serializer.save()
        new_status = instance.status
        if old_status != new_status:
            RoomStatusLog.objects.create(
                room=instance,
                old_status=old_status,
                new_status=new_status,
                changed_by=self.request.user,
            )

    def destroy(self, request, *args, **kwargs):
        room = self.get_object()
        if room.logs.exists() or room.reservations.exists() or room.price_chart.exists():
            return Response(
                {'error': 'Cannot delete room with existing stays, reservations, or price chart entries.'},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)


class RoomToggleActive(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(Rooms, pk=pk)
        if room.is_occupied() and room.is_active:
            return Response({'error': 'Cannot deactivate a room that is currently occupied.'}, status=400)
        room.is_active = not room.is_active
        room.save(update_fields=['is_active'])
        state = 'activated' if room.is_active else 'deactivated'
        return Response({'is_active': room.is_active, 'success_message': f'Room {state}.'})


class RoomStatusLogList(generics.ListAPIView):
    serializer_class = RoomStatusLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return RoomStatusLog.objects.filter(room_id=self.kwargs['pk'])


class CountryCodeListCreate(generics.ListCreateAPIView):
    queryset = CountryCodes.objects.all()
    serializer_class = CountryCodeSerializer
    permission_classes = [DjangoModelPermissions]


class CountryCodeDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = CountryCodes.objects.all()
    serializer_class = CountryCodeSerializer
    permission_classes = [DjangoModelPermissions]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'error': 'Cannot delete country code — it is assigned to one or more customers.'}, status=400)


class CustomerListCreate(generics.ListCreateAPIView):
    queryset = Customers.objects.none()
    serializer_class = CustomerSerializer
    permission_classes = [DjangoModelPermissions]

    def get_queryset(self):
        qs = Customers.objects.all()
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(number__contains=search) | Q(name__icontains=search))
        return qs


class CustomerDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Customers.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [DjangoModelPermissions]


class ConfigurationListCreate(generics.ListCreateAPIView):
    queryset = Configurations.objects.all()
    serializer_class = ConfigurationSerializer
    permission_classes = [DjangoModelPermissions]


class ConfigurationDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Configurations.objects.all()
    serializer_class = ConfigurationSerializer
    permission_classes = [DjangoModelPermissions]


class RoomsPriceChartListCreate(generics.ListCreateAPIView):
    queryset = RoomsPriceChart.objects.all()
    serializer_class = RoomsPriceChartSerializer
    permission_classes = [DjangoModelPermissions]


class RoomsPriceChartDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = RoomsPriceChart.objects.all()
    serializer_class = RoomsPriceChartSerializer
    permission_classes = [DjangoModelPermissions]


class StayLogListActive(generics.ListAPIView):
    queryset = RoomStayLogs.objects.filter(check_out=None).select_related('checked_in_by').prefetch_related(
        'group__customers__customer', 'amenities__amenity', 'payments__processed_by', 'nc_requests',
        'vehicles', 'food_orders__payment_method', 'food_orders__receipts', 'food_orders__ordered_by',
    )
    serializer_class = ActiveStayLogSerializer
    permission_classes = [DjangoModelPermissions]


class Checkin(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    @transaction.atomic
    def post(self, request):
        guests_raw = request.data.get('guests', '[]')
        try:
            guests_data = json.loads(guests_raw) if isinstance(guests_raw, str) else (guests_raw or [])
        except (ValueError, TypeError):
            return Response({'error': 'Invalid guests format.'}, status=400)

        guest_serializers = []
        for idx, entry in enumerate(guests_data):
            cid = entry.get('id')
            if not cid:
                return Response({'error': f'Guest {idx + 1}: missing id.'}, status=400)
            customer = Customers.objects.filter(pk=cid).first()
            if not customer:
                return Response({'error': f'Guest {idx + 1}: customer not found.'}, status=400)

            update_data = {k: v for k, v in entry.items() if k != 'id' and v not in (None, '')}
            card1 = request.FILES.get(f'guest_{idx}_identity_card_1')
            card2 = request.FILES.get(f'guest_{idx}_identity_card_2')
            if card1:
                update_data['identity_card_1'] = card1
            if card2:
                update_data['identity_card_2'] = card2

            cs = CustomerSerializer(instance=customer, data=update_data, partial=True)
            if not cs.is_valid():
                label = entry.get('name') or f'Guest {idx + 1}'
                return Response({'error': f'{label}: {cs.errors}'}, status=400)
            guest_serializers.append(cs)

        serializer = CheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        for cs in guest_serializers:
            cs.save()
        log = serializer.save(checked_in_by=request.user)
        return Response({'success_message': 'Checking Successful.', 'log_id': log.id})


class Checkout(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    def post(self, request, pk):
        log = get_object_or_404(RoomStayLogs, pk=pk)
        if log.check_out is not None:
            return Response({'error': 'Room already checked out.'}, status=400)
        overtime_fee_charged = request.data.get('overtime_fee_charged')
        log.check_out = timezone.now()
        log.checked_out_by = request.user
        if overtime_fee_charged is not None:
            from decimal import InvalidOperation
            try:
                log.overtime_fee_charged = Decimal(str(overtime_fee_charged))
                log.overtime_fee_default = log.room.overtime_fee
            except InvalidOperation:
                pass
        log.save()
        room = log.room
        old_status = room.status
        room.status = 'cleaning'
        room.save(update_fields=['status'])
        RoomStatusLog.objects.create(
            room=room,
            old_status=old_status,
            new_status='cleaning',
            changed_by=request.user,
            note='Auto-set after checkout',
        )
        return Response({'success_message': 'Checkout Successful.'})


@api_view(['POST'])
@permission_classes([DjangoModelPermissions])
def group_customer(request):
    serializer = GroupCustomerSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    g = Group()
    g.save()

    grouped = [CustomerGroup(customer=i, group=g) for i in serializer.validated_data['customers']]
    CustomerGroup.objects.bulk_create(grouped)

    return Response({'group_id': g.id})


group_customer.cls.queryset = CustomerGroup.objects.none()


class GroupCustomersView(generics.ListAPIView):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Customers.objects.filter(groups__group_id=self.kwargs['group_id']).distinct()


class StayLogDetail(generics.RetrieveUpdateAPIView):
    queryset = RoomStayLogs.objects.all()
    serializer_class = StayLogUpdateSerializer
    permission_classes = [DjangoModelPermissions]


@api_view(['POST'])
@permission_classes([DjangoModelPermissions])
def add_customers_to_group(request, group_id):
    group = get_object_or_404(Group, pk=group_id)
    serializer = GroupCustomerSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    new_entries = []
    for customer in serializer.validated_data['customers']:
        if not CustomerGroup.objects.filter(group=group, customer=customer).exists():
            new_entries.append(CustomerGroup(customer=customer, group=group))
    CustomerGroup.objects.bulk_create(new_entries)
    return Response({'added': len(new_entries)})


add_customers_to_group.cls.queryset = CustomerGroup.objects.none()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def remove_customer_from_group(request, group_id, customer_id):
    group = get_object_or_404(Group, pk=group_id)
    # The first customer added to the group is the main guest and cannot be removed
    first_entry = CustomerGroup.objects.filter(group=group).order_by('id').first()
    if first_entry and first_entry.customer_id == customer_id:
        return Response({'error': 'Cannot remove the main guest.'}, status=400)
    entry = get_object_or_404(CustomerGroup, group=group, customer_id=customer_id)
    entry.delete()
    return Response({'removed': True})


class ReservationListCreate(generics.ListCreateAPIView):
    serializer_class = ReservationSerializer
    permission_classes = [DjangoModelPermissions]

    def perform_create(self, serializer):
        reservation = serializer.save()
        # Each room records only its own proportional share of the advance (the
        # frontend splits the group advance by room price). This keeps the cash
        # drawer / ledger totals correct (shares sum to the amount actually paid)
        # and gives each room its own per-room advance entry.
        share = _parse_money(reservation.advance_amount)
        pm = reservation.advance_payment_method
        if share > 0 and pm:
            ReservationPayment.objects.create(
                group=reservation.group,
                amount=share,
                payment_method=pm,
                processed_by=self.request.user,
                note='Reservation advance',
            )
            record_money_event(
                'reservation_advance', share,
                payment_method=pm,
                recorded_by=self.request.user,
                reservation=reservation,
                note='Reservation advance',
            )

    def get_queryset(self):
        qs = Reservation.objects.select_related('room', 'group').prefetch_related('group__customers__customer')
        p = self.request.query_params
        if p.get('room'):
            qs = qs.filter(room=p['room'])
        if p.get('room_number'):
            qs = qs.filter(room__room_number__icontains=p['room_number'])
        if p.get('customer'):
            q = p['customer']
            qs = qs.filter(
                Q(group__customers__customer__name__icontains=q) |
                Q(group__customers__customer__number__contains=q)
            ).distinct()
        if p.get('check_in_from'):
            qs = qs.filter(check_in_date__gte=p['check_in_from'])
        if p.get('check_in_to'):
            qs = qs.filter(check_in_date__lte=p['check_in_to'])
        if p.get('check_out_from'):
            qs = qs.filter(check_out_date__gte=p['check_out_from'])
        if p.get('check_out_to'):
            qs = qs.filter(check_out_date__lte=p['check_out_to'])
        return qs.order_by('-check_in_date')


class ReservationDetail(generics.RetrieveUpdateAPIView):
    queryset = Reservation.objects.all()
    serializer_class = ReservationSerializer
    permission_classes = [DjangoModelPermissions]


class CancelCheckin(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    def post(self, request, pk):
        log = get_object_or_404(RoomStayLogs, pk=pk)
        if log.check_out is not None:
            return Response({'error': 'Stay already ended.'}, status=400)
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'Reason is required.'}, status=400)
        room = log.room
        default_fee = room.cancellation_fee or Decimal('0')
        cancellation_fee = _parse_money(request.data.get('cancellation_fee'), default_fee)
        total_received = sum(p.amount for p in log.payments.all())
        refund_amount = _parse_money(request.data.get('refund_amount'))
        fee_paid_directly = bool(request.data.get('cancellation_fee_payment_method'))
        if refund_amount > total_received:
            return Response({'error': f'Refund cannot exceed received amount of ₹{total_received}.'}, status=400)
        if not fee_paid_directly and cancellation_fee + refund_amount > total_received:
            return Response({'error': f'Cancellation fee and refund cannot exceed received amount of ₹{total_received}.'}, status=400)
        if refund_amount > 0 and not request.data.get('refund_payment_method'):
            return Response({'error': 'Refund payment method is required when refund amount is greater than 0.'}, status=400)

        try:
            with transaction.atomic():
                log.check_out = timezone.now()
                log.save()
                old_status = room.status
                room.status = 'cleaning'
                room.save(update_fields=['status'])
                RoomStatusLog.objects.create(
                    room=room,
                    old_status=old_status,
                    new_status='cleaning',
                    changed_by=request.user,
                    note='Auto-set after cancellation',
                )
                cancellation = CancellationLog.objects.create(
                    cancellation_type='checkin',
                    stay_log=log,
                    room=room,
                    room_number=room.room_number,
                    group=log.group,
                    reason=reason,
                    default_fee=default_fee,
                    cancellation_fee=cancellation_fee,
                    cancelled_by=request.user,
                )
                if cancellation_fee > 0:
                    fee_pm_id = request.data.get('cancellation_fee_payment_method')
                    fee_pm    = PaymentMethod.objects.filter(pk=fee_pm_id).first() if fee_pm_id else None
                    record_money_event(
                        'cancellation_fee', cancellation_fee,
                        payment_method=fee_pm,
                        recorded_by=request.user,
                        stay_log=log,
                        cancellation=cancellation,
                    )
                _create_cancellation_refund(cancellation, request, total_received)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        return Response({'success_message': 'Stay cancelled.'})


class ReservationCancel(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return Reservation.objects.all()

    def post(self, request, pk):
        reservation = get_object_or_404(Reservation, pk=pk)
        if reservation.is_cancelled:
            return Response({'error': 'Reservation already cancelled.'}, status=400)
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'Reason is required.'}, status=400)
        room = reservation.room
        default_fee = room.cancellation_fee or Decimal('0')
        cancellation_fee = _parse_money(request.data.get('cancellation_fee'), default_fee)
        summary = _reservation_group_advance_summary(reservation.group_id)
        available_refund = summary['advance_available']
        refund_amount = _parse_money(request.data.get('refund_amount'))
        remaining_active = Reservation.objects.filter(group_id=reservation.group_id, is_cancelled=False).exclude(pk=reservation.pk).count()
        if remaining_active > 0 and refund_amount > 0:
            return Response({'error': 'Refunds are only allowed when cancelling the final active room in a group booking.'}, status=400)
        if refund_amount > available_refund:
            return Response({'error': f'Refund cannot exceed available group advance of ₹{available_refund}.'}, status=400)
        max_refund_after_fee = max(Decimal('0'), available_refund - cancellation_fee)
        if refund_amount > max_refund_after_fee:
            return Response({'error': f'Refund cannot exceed available group advance after fee of ₹{max_refund_after_fee}.'}, status=400)
        if refund_amount > 0 and not request.data.get('refund_payment_method'):
            return Response({'error': 'Refund payment method is required when refund amount is greater than 0.'}, status=400)

        try:
            with transaction.atomic():
                reservation.is_cancelled = True
                reservation.save(update_fields=['is_cancelled'])
                cancellation = CancellationLog.objects.create(
                    cancellation_type='reservation',
                    reservation=reservation,
                    room=room,
                    room_number=room.room_number,
                    group=reservation.group,
                    reason=reason,
                    default_fee=default_fee,
                    cancellation_fee=cancellation_fee,
                    cancelled_by=request.user,
                )
                if cancellation_fee > 0:
                    fee_pm_id = request.data.get('cancellation_fee_payment_method')
                    fee_pm    = PaymentMethod.objects.filter(pk=fee_pm_id).first() if fee_pm_id else None
                    record_money_event(
                        'cancellation_fee', cancellation_fee,
                        payment_method=fee_pm,
                        recorded_by=request.user,
                        reservation=reservation,
                        cancellation=cancellation,
                    )
                _create_cancellation_refund(cancellation, request, available_refund)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        return Response({'success_message': 'Reservation cancelled.'})


class ReservationBulkCancel(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return Reservation.objects.all()

    def post(self, request):
        ids = request.data.get('reservation_ids', [])
        if not ids:
            return Response({'error': 'No reservations selected.'}, status=400)

        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'error': 'Reason is required.'}, status=400)

        reservations = list(Reservation.objects.filter(pk__in=ids).select_related('room'))
        if len(reservations) != len(set(ids)):
            return Response({'error': 'One or more reservations not found.'}, status=400)

        invalid = [r for r in reservations if r.is_cancelled or r.is_converted]
        if invalid:
            return Response({'error': 'One or more reservations are already cancelled or converted.'}, status=400)

        group_ids = set(r.group_id for r in reservations)
        if len(group_ids) != 1:
            return Response({'error': 'All selected reservations must belong to the same group.'}, status=400)

        group_id = group_ids.pop()
        summary = _reservation_group_advance_summary(group_id)
        available_refund = summary['advance_available']

        remaining_active = Reservation.objects.filter(
            group_id=group_id, is_cancelled=False, is_converted=False
        ).exclude(pk__in=ids).count()
        is_full_cancel = remaining_active == 0

        cancellation_fee_input = request.data.get('cancellation_fee')
        per_room_fees = {}
        total_fee = Decimal('0')
        for res in reservations:
            default_fee = res.room.cancellation_fee or Decimal('0')
            fee = _parse_money(cancellation_fee_input, default_fee)
            per_room_fees[res.id] = (fee, default_fee)
            total_fee += fee

        max_refund = max(Decimal('0'), available_refund - total_fee)
        refund_amount = _parse_money(request.data.get('refund_amount', 0))

        if not is_full_cancel and refund_amount > 0:
            return Response({'error': 'Refunds are only allowed when cancelling all active rooms in the group.'}, status=400)
        if refund_amount > max_refund:
            return Response({'error': f'Refund cannot exceed available advance after fees of ₹{max_refund}.'}, status=400)
        if refund_amount > 0 and not request.data.get('refund_payment_method'):
            return Response({'error': 'Refund payment method is required.'}, status=400)

        try:
            with transaction.atomic():
                first_cancellation = None
                for res in reservations:
                    per_room_fee, default_fee = per_room_fees[res.id]
                    res.is_cancelled = True
                    res.save(update_fields=['is_cancelled'])
                    c = CancellationLog.objects.create(
                        cancellation_type='reservation',
                        reservation=res,
                        room=res.room,
                        room_number=res.room.room_number,
                        group_id=group_id,
                        reason=reason,
                        default_fee=default_fee,
                        cancellation_fee=per_room_fee,
                        cancelled_by=request.user,
                    )
                    if per_room_fee > 0:
                        fee_pm_id = request.data.get('cancellation_fee_payment_method')
                        fee_pm    = PaymentMethod.objects.filter(pk=fee_pm_id).first() if fee_pm_id else None
                        record_money_event(
                            'cancellation_fee', per_room_fee,
                            payment_method=fee_pm,
                            recorded_by=request.user,
                            reservation=res,
                            cancellation=c,
                        )
                    if first_cancellation is None:
                        first_cancellation = c

                if refund_amount > 0 and first_cancellation:
                    _create_cancellation_refund(first_cancellation, request, max_refund)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        return Response({'success_message': f'{len(reservations)} reservation(s) cancelled.'})


class ReservationConvert(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        reservation = get_object_or_404(Reservation, pk=pk)
        if reservation.is_converted:
            return Response({'error': 'Reservation already converted to check-in.'}, status=400)
        if reservation.is_cancelled:
            return Response({'error': 'Cannot convert a cancelled reservation.'}, status=400)

        log_id = request.data.get('log_id')
        apply_advance = _parse_money(request.data.get('apply_advance_amount', 0))
        apply_method_id = request.data.get('apply_advance_payment_method')

        with transaction.atomic():
            reservation.is_converted = True
            reservation.applied_advance = apply_advance
            reservation.save(update_fields=['is_converted', 'applied_advance'])

            if apply_advance > 0 and log_id and apply_method_id:
                stay_log = get_object_or_404(RoomStayLogs, pk=log_id)
                Payment.objects.create(
                    stay_log=stay_log,
                    payment_method_id=apply_method_id,
                    amount=apply_advance,
                    processed_by=request.user,
                    note='Group advance applied at check-in',
                )
                pm = PaymentMethod.objects.filter(pk=apply_method_id).first()
                record_money_event(
                    'advance_applied', apply_advance,
                    payment_method=pm,
                    recorded_by=request.user,
                    stay_log=stay_log,
                    reservation=reservation,
                    note='Group advance applied at check-in',
                )

        return Response({'success_message': 'Reservation converted to check-in.'})


class ReservationGroupAdvance(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        amount = _parse_money(request.data.get('amount', 0))
        if amount <= 0:
            return Response({'error': 'Amount must be greater than 0.'}, status=400)
        method_id = request.data.get('payment_method')
        if not method_id:
            return Response({'error': 'Payment method is required.'}, status=400)
        payment_method = get_object_or_404(PaymentMethod, pk=method_id)
        rp = ReservationPayment.objects.create(
            group=group,
            amount=amount,
            payment_method=payment_method,
            processed_by=request.user,
            note=request.data.get('note', '').strip(),
        )
        record_money_event(
            'reservation_advance', amount,
            payment_method=payment_method,
            recorded_by=request.user,
            note=request.data.get('note', '').strip(),
        )
        return Response({'id': rp.id, 'amount': str(rp.amount)}, status=201)


class CancellationReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.is_superuser or request.user.has_perm('management.view_cancellation_report')):
            return Response({'error': 'Permission denied.'}, status=403)
        qs = CancellationLog.objects.select_related(
            'room', 'group', 'cancelled_by', 'stay_log', 'reservation',
            'refund__payment_method', 'refund__processed_by',
        ).prefetch_related('group__customers__customer').order_by('-cancelled_on')
        p = request.query_params
        if p.get('from_date'):
            qs = qs.filter(cancelled_on__date__gte=p['from_date'])
        if p.get('to_date'):
            qs = qs.filter(cancelled_on__date__lte=p['to_date'])
        if p.get('cancellation_type') and p['cancellation_type'] != 'all':
            qs = qs.filter(cancellation_type=p['cancellation_type'])
        serializer = CancellationLogSerializer(qs, many=True)
        return Response(serializer.data)


class AmenityListCreate(generics.ListCreateAPIView):
    queryset = Amenity.objects.all()
    serializer_class = AmenitySerializer
    permission_classes = [DjangoModelPermissions]


class AmenityDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Amenity.objects.all()
    serializer_class = AmenitySerializer
    permission_classes = [DjangoModelPermissions]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'error': 'Cannot delete amenity — it is in use by one or more stays.'}, status=400)


class PaymentMethodListCreate(generics.ListCreateAPIView):
    serializer_class = PaymentMethodSerializer
    permission_classes = [DjangoModelPermissions]

    def get_queryset(self):
        qs = PaymentMethod.objects.order_by('name')
        active_only = self.request.query_params.get('active')
        if active_only == 'true':
            qs = qs.filter(is_active=True)
        return qs


class PaymentMethodDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = PaymentMethod.objects.all()
    serializer_class = PaymentMethodSerializer
    permission_classes = [DjangoModelPermissions]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'error': 'Cannot delete payment method — it is in use by existing payments or expenses.'}, status=400)


class ExpenseCategoryListCreate(generics.ListCreateAPIView):
    serializer_class = ExpenseCategorySerializer
    permission_classes = [DjangoModelPermissions]

    def get_queryset(self):
        qs = ExpenseCategory.objects.order_by('name')
        active_only = self.request.query_params.get('active')
        if active_only == 'true':
            qs = qs.filter(is_active=True)
        return qs


class ExpenseCategoryDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [DjangoModelPermissions]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'error': 'Cannot delete category — it is in use by existing expenses.'}, status=400)


class IncomeCategoryListCreate(generics.ListCreateAPIView):
    serializer_class = IncomeCategorySerializer
    permission_classes = [DjangoModelPermissions]

    def get_queryset(self):
        qs = IncomeCategory.objects.order_by('name')
        active_only = self.request.query_params.get('active')
        if active_only == 'true':
            qs = qs.filter(is_active=True)
        return qs


class IncomeCategoryDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = IncomeCategory.objects.all()
    serializer_class = IncomeCategorySerializer
    permission_classes = [DjangoModelPermissions]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'error': 'Cannot delete category — it is in use by existing income records.'}, status=400)


class StayLogAmenityListCreate(generics.ListCreateAPIView):
    serializer_class = StayLogAmenitySerializer
    permission_classes = [DjangoModelPermissions]

    def get_queryset(self):
        return StayLogAmenity.objects.filter(stay_log_id=self.kwargs['log_id']).select_related('amenity')

    def perform_create(self, serializer):
        serializer.save(stay_log_id=self.kwargs['log_id'], added_by=self.request.user)


class StayLogAmenityDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = StayLogAmenity.objects.all()
    serializer_class = StayLogAmenitySerializer
    permission_classes = [DjangoModelPermissions]


# -----------  Report helpers  -----------

def _parse_date(value, default):
    if not value:
        return default
    try:
        return date_type.fromisoformat(value)
    except ValueError:
        return default


def _period_key(dt, group_by):
    if group_by == 'week':
        iso = dt.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if group_by == 'month':
        return dt.strftime('%Y-%m')
    return dt.isoformat()


def _stay_revenue(log):
    if log.is_nc:
        return Decimal(0)
    nights = max(1, (log.check_out.date() - log.check_in.date()).days)
    room_total = (log.price + log.extra_bed * log.extra_per_bed_price) * nights
    amenity_total = sum(
        a.amenity.price * a.quantity * (nights if a.amenity.charge_type == 'per_night' else 1)
        for a in log.amenities.all()
    )
    return room_total + amenity_total


def _compute_daily_occupancy(start, end):
    total_rooms = Rooms.objects.count() or 1
    logs = RoomStayLogs.objects.filter(
        check_in__date__lte=end,
    ).filter(
        Q(check_out__isnull=True) | Q(check_out__date__gt=start)
    )
    day_occ = {}
    current = start
    while current <= end:
        occupied = sum(
            1 for log in logs
            if log.check_in.date() <= current and (log.check_out is None or log.check_out.date() > current)
        )
        day_occ[current] = occupied / total_rooms * 100
        current += timedelta(days=1)
    return day_occ


# -----------  Report views  -----------

class RevenueReportView(APIView):
    permission_classes = [report_permission('view_revenue_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)
        group_by = request.query_params.get('group_by', 'day')
        room_type = request.query_params.get('room_type')

        logs = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            check_out__date__gte=start,
            check_out__date__lte=end,
        ).select_related('room__room_type').prefetch_related('amenities__amenity')

        if room_type:
            logs = logs.filter(room__room_type_id=room_type)

        total_revenue = Decimal(0)
        by_room_type = defaultdict(lambda: Decimal(0))
        chart_buckets = defaultdict(lambda: Decimal(0))

        for log in logs:
            rev = _stay_revenue(log)
            total_revenue += rev
            by_room_type[log.room.room_type.name] += rev
            chart_buckets[_period_key(log.check_out.date(), group_by)] += rev

        count = logs.count()
        adr = float(total_revenue / count) if count else 0

        chart_data = sorted(
            [{'period': k, 'revenue': float(v)} for k, v in chart_buckets.items()],
            key=lambda x: x['period'],
        )

        return Response({
            'summary': {
                'total_revenue': float(total_revenue),
                'adr': round(adr, 2),
                'by_room_type': [{'room_type': k, 'revenue': float(v)} for k, v in by_room_type.items()],
            },
            'chart_data': chart_data,
        })


class OccupancyReportView(APIView):
    permission_classes = [report_permission('view_occupancy_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)
        group_by = request.query_params.get('group_by', 'day')

        total_rooms = Rooms.objects.count() or 1

        logs = RoomStayLogs.objects.filter(
            check_in__date__lte=end,
        ).filter(
            Q(check_out__isnull=True) | Q(check_out__date__gt=start)
        )

        # Build per-day occupancy
        day_occ = {}
        current = start
        while current <= end:
            occupied = sum(
                1 for log in logs
                if log.check_in.date() <= current and (log.check_out is None or log.check_out.date() > current)
            )
            day_occ[current] = occupied / total_rooms * 100
            current += timedelta(days=1)

        # Group into period buckets
        buckets = defaultdict(list)
        for d, pct in day_occ.items():
            buckets[_period_key(d, group_by)].append(pct)

        chart_data = sorted(
            [{'period': k, 'occupancy_pct': round(sum(v) / len(v), 1)} for k, v in buckets.items()],
            key=lambda x: x['period'],
        )

        avg_occupancy = round(sum(day_occ.values()) / len(day_occ), 1) if day_occ else 0

        # Avg length of stay from completed stays in range
        completed = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            check_out__date__gte=start,
            check_out__date__lte=end,
        )
        lengths = [(log.check_out.date() - log.check_in.date()).days for log in completed]
        avg_los = round(sum(lengths) / len(lengths), 1) if lengths else 0

        return Response({
            'summary': {
                'avg_occupancy': avg_occupancy,
                'avg_length_of_stay': avg_los,
            },
            'chart_data': chart_data,
        })


class GuestReportView(APIView):
    permission_classes = [report_permission('view_guest_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        # Groups that have stay logs with check_in in range
        group_ids = RoomStayLogs.objects.filter(
            check_in__date__gte=start,
            check_in__date__lte=end,
        ).values_list('group_id', flat=True).distinct()

        customers = Customers.objects.filter(
            groups__group_id__in=group_ids,
        ).distinct()

        total = customers.count()

        # Repeat = customer linked to more than one group that has stay logs (ever)
        groups_with_logs = RoomStayLogs.objects.values_list('group_id', flat=True).distinct()
        repeat_count = 0
        for c in customers:
            group_count = CustomerGroup.objects.filter(
                customer=c, group_id__in=groups_with_logs
            ).count()
            if group_count > 1:
                repeat_count += 1

        gender_data = list(
            customers.values('gender').annotate(count=Count('id')).order_by('-count')
        )

        country_data = list(
            customers.values('country_code__country_name').annotate(count=Count('id')).order_by('-count')
        )
        country_data = [{'country': r['country_code__country_name'], 'count': r['count']} for r in country_data]

        return Response({
            'summary': {
                'total': total,
                'repeat': repeat_count,
                'first_time': total - repeat_count,
            },
            'gender': gender_data,
            'country': country_data,
        })


class TodayOverviewView(APIView):
    permission_classes = [report_permission('view_today_overview')]

    def get(self, request):
        today = timezone.localdate()
        total_rooms = Rooms.objects.count()

        # Today's arrivals from reservations
        arrivals_qs = Reservation.objects.filter(
            check_in_date=today,
        ).select_related('room', 'room__room_type', 'group')

        arrivals = []
        for res in arrivals_qs:
            guests = Customers.objects.filter(groups__group_id=res.group_id)
            arrivals.append({
                'reservation_id': res.id,
                'room': res.room.room_number,
                'room_type': res.room.room_type.name,
                'guests': [{'id': g.id, 'name': g.name} for g in guests],
                'check_in_date': res.check_in_date.isoformat(),
                'check_out_date': res.check_out_date.isoformat(),
            })

        # Currently occupied rooms
        active_logs = RoomStayLogs.objects.filter(
            check_out__isnull=True,
        ).select_related('room', 'room__room_type', 'group')

        occupied = []
        for log in active_logs:
            guests = Customers.objects.filter(groups__group_id=log.group_id)
            occupied.append({
                'log_id': log.id,
                'room': log.room.room_number,
                'room_type': log.room.room_type.name,
                'guests': [{'id': g.id, 'name': g.name} for g in guests],
                'check_in': log.check_in.isoformat(),
                'price': float(log.price),
            })

        occupied_count = len(occupied)

        return Response({
            'arrivals': arrivals,
            'occupied': occupied,
            'occupied_count': occupied_count,
            'available_count': total_rooms - occupied_count,
            'total_rooms': total_rooms,
        })


class RoomPerformanceView(APIView):
    permission_classes = [report_permission('view_room_performance_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)
        room_type = request.query_params.get('room_type')

        logs = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            check_out__date__gte=start,
            check_out__date__lte=end,
        ).select_related('room__room_type').prefetch_related('amenities__amenity')

        if room_type:
            logs = logs.filter(room__room_type_id=room_type)

        total_days = max(1, (end - start).days + 1)

        room_data = defaultdict(lambda: {'revenue': Decimal(0), 'nights_sold': 0})
        for log in logs:
            nights = max(1, (log.check_out.date() - log.check_in.date()).days)
            rev = _stay_revenue(log)
            key = log.room_id
            room_data[key]['revenue'] += rev
            room_data[key]['nights_sold'] += nights
            room_data[key]['room'] = log.room

        rooms_list = []
        for room_id, d in room_data.items():
            room = d['room']
            rooms_list.append({
                'room_number': room.room_number,
                'room_type': room.room_type.name,
                'revenue': float(d['revenue']),
                'nights_sold': d['nights_sold'],
                'occupancy_pct': round(d['nights_sold'] / total_days * 100, 1),
                'revpar': round(float(d['revenue']) / total_days, 2),
            })

        rooms_list.sort(key=lambda x: x['revenue'], reverse=True)

        by_type = defaultdict(lambda: {'room_count': 0, 'total_revenue': Decimal(0), 'occ_sum': 0, 'revpar_sum': 0})
        for r in rooms_list:
            t = by_type[r['room_type']]
            t['room_count'] += 1
            t['total_revenue'] += Decimal(str(r['revenue']))
            t['occ_sum'] += r['occupancy_pct']
            t['revpar_sum'] += r['revpar']

        by_room_type = []
        for name, t in by_type.items():
            c = t['room_count']
            by_room_type.append({
                'room_type': name,
                'room_count': c,
                'total_revenue': float(t['total_revenue']),
                'avg_occupancy': round(t['occ_sum'] / c, 1),
                'avg_revpar': round(t['revpar_sum'] / c, 2),
            })

        return Response({
            'rooms': rooms_list,
            'by_room_type': by_room_type,
            'total_days': total_days,
        })


class ReservationFulfillmentView(APIView):
    permission_classes = [report_permission('view_reservation_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        reservations = Reservation.objects.filter(
            check_in_date__gte=start,
            check_in_date__lte=end,
        ).select_related('room', 'room__room_type')

        stay_set = set(
            RoomStayLogs.objects.filter(
                check_in__date__gte=start,
                check_in__date__lte=end,
            ).values_list('room_id', 'group_id')
        )

        fulfilled = 0
        no_show = 0
        upcoming = 0
        no_shows = []
        lead_times = []

        for res in reservations:
            lead = (res.check_in_date - res.created_on.date()).days
            lead_times.append(max(0, lead))

            if (res.room_id, res.group_id) in stay_set:
                fulfilled += 1
            elif res.check_in_date < today:
                no_show += 1
                guests = Customers.objects.filter(groups__group_id=res.group_id)
                no_shows.append({
                    'reservation_id': res.id,
                    'room': res.room.room_number,
                    'room_type': res.room.room_type.name,
                    'check_in_date': res.check_in_date.isoformat(),
                    'guests': [{'id': g.id, 'name': g.name} for g in guests],
                })
            else:
                upcoming += 1

        total = fulfilled + no_show + upcoming
        avg_lead = round(sum(lead_times) / len(lead_times), 1) if lead_times else 0

        buckets = [
            ('0-1 days', 0, 1), ('2-7 days', 2, 7), ('8-14 days', 8, 14),
            ('15-30 days', 15, 30), ('31+ days', 31, 9999),
        ]
        lead_dist = []
        for label, lo, hi in buckets:
            lead_dist.append({
                'bucket': label,
                'count': sum(1 for lt in lead_times if lo <= lt <= hi),
            })

        return Response({
            'summary': {
                'total': total,
                'fulfilled': fulfilled,
                'fulfilled_pct': round(fulfilled / total * 100, 1) if total else 0,
                'no_show': no_show,
                'no_show_pct': round(no_show / total * 100, 1) if total else 0,
                'upcoming': upcoming,
                'avg_lead_time': avg_lead,
            },
            'no_shows': no_shows,
            'lead_time_distribution': lead_dist,
        })


class CLVReportView(APIView):
    permission_classes = [report_permission('view_clv_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=365))
        end = _parse_date(request.query_params.get('end_date'), today)
        sort_by = request.query_params.get('sort_by', 'total_revenue')
        limit = int(request.query_params.get('limit', 20))

        logs = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            check_out__date__gte=start,
            check_out__date__lte=end,
        ).prefetch_related('amenities__amenity')

        group_revenue = {}
        group_dates = defaultdict(list)
        for log in logs:
            rev = _stay_revenue(log)
            group_revenue[log.group_id] = group_revenue.get(log.group_id, Decimal(0)) + rev
            group_dates[log.group_id].append(log.check_in.date())

        if not group_revenue:
            return Response({
                'summary': {'avg_clv': 0, 'top_revenue': 0, 'total_unique_guests': 0},
                'customers': [],
            })

        group_ids = list(group_revenue.keys())
        cg_qs = CustomerGroup.objects.filter(group_id__in=group_ids).select_related('customer', 'customer__country_code')

        customer_data = defaultdict(lambda: {
            'total_revenue': Decimal(0), 'groups': set(), 'dates': [],
        })
        customer_map = {}
        for cg in cg_qs:
            cid = cg.customer_id
            customer_map[cid] = cg.customer
            d = customer_data[cid]
            gid = cg.group_id
            if gid not in d['groups']:
                d['groups'].add(gid)
                d['total_revenue'] += group_revenue.get(gid, Decimal(0))
                d['dates'].extend(group_dates.get(gid, []))

        customers = []
        for cid, d in customer_data.items():
            c = customer_map[cid]
            visits = len(d['groups'])
            total_rev = float(d['total_revenue'])
            sorted_dates = sorted(d['dates'])
            customers.append({
                'id': cid,
                'name': c.name,
                'phone': c.number,
                'phone_dial_code': c.country_code.country_code if c.country_code_id else None,
                'total_revenue': total_rev,
                'visit_count': visits,
                'avg_spend': round(total_rev / visits, 2) if visits else 0,
                'first_visit': sorted_dates[0].isoformat() if sorted_dates else None,
                'last_visit': sorted_dates[-1].isoformat() if sorted_dates else None,
                'days_since_last': (today - sorted_dates[-1]).days if sorted_dates else None,
            })

        valid_sorts = {'total_revenue', 'visits', 'avg_spend'}
        sort_key = sort_by if sort_by in valid_sorts else 'total_revenue'
        if sort_key == 'visits':
            sort_key = 'visit_count'
        customers.sort(key=lambda x: x[sort_key], reverse=True)
        customers = customers[:limit]

        all_revs = [c['total_revenue'] for c in customer_data.values()]

        return Response({
            'summary': {
                'avg_clv': round(sum(float(cd['total_revenue']) for cd in customer_data.values()) / len(customer_data), 2) if customer_data else 0,
                'top_revenue': customers[0]['total_revenue'] if customers else 0,
                'total_unique_guests': len(customer_data),
            },
            'customers': customers,
        })


class TrendsReportView(APIView):
    permission_classes = [report_permission('view_trends_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=365))
        end = _parse_date(request.query_params.get('end_date'), today)

        logs = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            check_out__date__gte=start,
            check_out__date__lte=end,
        ).select_related('room__room_type').prefetch_related('amenities__amenity')

        monthly_revenue = defaultdict(lambda: Decimal(0))
        for log in logs:
            month_key = log.check_out.date().strftime('%Y-%m')
            monthly_revenue[month_key] += _stay_revenue(log)

        day_occ = _compute_daily_occupancy(start, end)

        monthly_occ = defaultdict(list)
        dow_occ = defaultdict(list)
        for d, pct in day_occ.items():
            monthly_occ[d.strftime('%Y-%m')].append(pct)
            dow_occ[d.strftime('%A')].append(pct)

        all_months = sorted(set(list(monthly_revenue.keys()) + list(monthly_occ.keys())))
        monthly_data = []
        for m in all_months:
            occ_vals = monthly_occ.get(m, [])
            monthly_data.append({
                'month': m,
                'revenue': float(monthly_revenue.get(m, 0)),
                'avg_occupancy': round(sum(occ_vals) / len(occ_vals), 1) if occ_vals else 0,
            })

        dow_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        dow_data = []
        for day_name in dow_order:
            vals = dow_occ.get(day_name, [])
            dow_data.append({
                'day': day_name,
                'avg_occupancy': round(sum(vals) / len(vals), 1) if vals else 0,
            })

        best_month = max(monthly_data, key=lambda x: x['revenue'])['month'] if monthly_data else None
        worst_month = min(monthly_data, key=lambda x: x['revenue'])['month'] if monthly_data else None

        weekend_days = {'Saturday', 'Sunday'}
        weekend_vals = [v for d in weekend_days for v in dow_occ.get(d, [])]
        weekday_vals = [v for d in dow_order if d not in weekend_days for v in dow_occ.get(d, [])]

        return Response({
            'monthly_data': monthly_data,
            'dow_data': dow_data,
            'summary': {
                'best_month': best_month,
                'worst_month': worst_month,
                'weekend_avg_occ': round(sum(weekend_vals) / len(weekend_vals), 1) if weekend_vals else 0,
                'weekday_avg_occ': round(sum(weekday_vals) / len(weekday_vals), 1) if weekday_vals else 0,
            },
        })


class StayDurationView(APIView):
    permission_classes = [report_permission('view_stay_duration_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        logs = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            check_out__date__gte=start,
            check_out__date__lte=end,
        ).select_related('room__room_type').prefetch_related('amenities__amenity')

        stays = []
        for log in logs:
            nights = max(1, (log.check_out.date() - log.check_in.date()).days)
            rev = _stay_revenue(log)
            stays.append({
                'nights': nights,
                'revenue': float(rev),
                'daily_rate': float(rev) / nights,
                'room_type': log.room.room_type.name,
            })

        if not stays:
            return Response({
                'summary': {'avg_duration': 0, 'median_duration': 0, 'total_stays': 0, 'most_common': None},
                'buckets': [],
                'by_room_type': [],
            })

        all_nights = [s['nights'] for s in stays]
        avg_dur = round(sum(all_nights) / len(all_nights), 1)
        median_dur = statistics.median(all_nights)

        bucket_defs = [
            ('1 night', 1, 1), ('2-3 nights', 2, 3), ('4-7 nights', 4, 7), ('8+ nights', 8, 9999),
        ]
        buckets = []
        bucket_counts = {}
        for label, lo, hi in bucket_defs:
            matched = [s for s in stays if lo <= s['nights'] <= hi]
            count = len(matched)
            bucket_counts[label] = count
            buckets.append({
                'label': label,
                'count': count,
                'avg_daily_rate': round(sum(s['daily_rate'] for s in matched) / count, 2) if count else 0,
                'total_revenue': round(sum(s['revenue'] for s in matched), 2),
            })

        most_common = max(bucket_counts, key=bucket_counts.get) if bucket_counts else None

        rt_data = defaultdict(lambda: {'nights': [], 'daily_rates': []})
        for s in stays:
            rt_data[s['room_type']]['nights'].append(s['nights'])
            rt_data[s['room_type']]['daily_rates'].append(s['daily_rate'])

        by_room_type = []
        for rt, d in rt_data.items():
            by_room_type.append({
                'room_type': rt,
                'avg_duration': round(sum(d['nights']) / len(d['nights']), 1),
                'count': len(d['nights']),
                'avg_daily_rate': round(sum(d['daily_rates']) / len(d['daily_rates']), 2),
            })

        return Response({
            'summary': {
                'avg_duration': avg_dur,
                'median_duration': median_dur,
                'total_stays': len(stays),
                'most_common': most_common,
            },
            'buckets': buckets,
            'by_room_type': by_room_type,
        })


class UpsellReportView(APIView):
    permission_classes = [report_permission('view_upsell_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)
        group_by = request.query_params.get('group_by', 'day')

        logs = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            check_out__date__gte=start,
            check_out__date__lte=end,
        ).select_related('room__room_type').prefetch_related('amenities__amenity')

        total_stays = 0
        stays_with_extra = 0
        total_extra_revenue = Decimal(0)
        total_revenue = Decimal(0)
        chart_buckets = defaultdict(lambda: {'extra_revenue': Decimal(0), 'total_revenue': Decimal(0)})
        rt_data = defaultdict(lambda: {'total': 0, 'with_extra': 0, 'extra_revenue': Decimal(0)})

        for log in logs:
            nights = max(1, (log.check_out.date() - log.check_in.date()).days)
            base_rev = log.price * nights
            extra_rev = log.extra_bed * log.extra_per_bed_price * nights
            rev = base_rev + extra_rev

            total_stays += 1
            total_revenue += rev
            total_extra_revenue += extra_rev

            if log.extra_bed > 0:
                stays_with_extra += 1

            period = _period_key(log.check_out.date(), group_by)
            chart_buckets[period]['extra_revenue'] += extra_rev
            chart_buckets[period]['total_revenue'] += rev

            rt = log.room.room_type.name
            rt_data[rt]['total'] += 1
            if log.extra_bed > 0:
                rt_data[rt]['with_extra'] += 1
            rt_data[rt]['extra_revenue'] += extra_rev

        chart_data = sorted([
            {
                'period': k,
                'extra_revenue': float(v['extra_revenue']),
                'total_revenue': float(v['total_revenue']),
            }
            for k, v in chart_buckets.items()
        ], key=lambda x: x['period'])

        by_room_type = []
        for rt, d in rt_data.items():
            by_room_type.append({
                'room_type': rt,
                'total': d['total'],
                'with_extra': d['with_extra'],
                'adoption_rate': round(d['with_extra'] / d['total'] * 100, 1) if d['total'] else 0,
                'extra_revenue': float(d['extra_revenue']),
            })

        return Response({
            'summary': {
                'total_stays': total_stays,
                'stays_with_extra': stays_with_extra,
                'adoption_rate': round(stays_with_extra / total_stays * 100, 1) if total_stays else 0,
                'total_extra_revenue': float(total_extra_revenue),
                'total_revenue': float(total_revenue),
                'extra_revenue_share': round(float(total_extra_revenue) / float(total_revenue) * 100, 1) if total_revenue else 0,
            },
            'chart_data': chart_data,
            'by_room_type': by_room_type,
        })


class PipelineReportView(APIView):
    permission_classes = [report_permission('view_pipeline_report')]

    def get(self, request):
        today = timezone.localdate()
        end = today + timedelta(weeks=8)

        reservations = Reservation.objects.filter(
            check_in_date__gte=today,
            check_in_date__lte=end,
        ).select_related('room', 'room__room_type')

        # Batch guest lookups
        group_ids = [r.group_id for r in reservations]
        cg_qs = CustomerGroup.objects.filter(group_id__in=group_ids).select_related('customer')
        group_guests = defaultdict(list)
        for cg in cg_qs:
            group_guests[cg.group_id].append({'id': cg.customer_id, 'name': cg.customer.name})

        weekly = defaultdict(lambda: {'reservations': 0, 'expected_revenue': Decimal(0)})
        upcoming = []
        total_expected = Decimal(0)

        for res in reservations:
            nights = max(1, (res.check_out_date - res.check_in_date).days)
            expected_rev = res.price * nights
            total_expected += expected_rev

            iso = res.check_in_date.isocalendar()
            week_key = f"{iso[0]}-W{iso[1]:02d}"
            weekly[week_key]['reservations'] += 1
            weekly[week_key]['expected_revenue'] += expected_rev

            upcoming.append({
                'reservation_id': res.id,
                'room': res.room.room_number,
                'room_type': res.room.room_type.name,
                'check_in': res.check_in_date.isoformat(),
                'check_out': res.check_out_date.isoformat(),
                'expected_revenue': float(expected_rev),
                'guests': group_guests.get(res.group_id, []),
            })

        weekly_data = sorted([
            {'week': k, 'reservations': v['reservations'], 'expected_revenue': float(v['expected_revenue'])}
            for k, v in weekly.items()
        ], key=lambda x: x['week'])

        busiest = max(weekly_data, key=lambda x: x['reservations'])['week'] if weekly_data else None

        return Response({
            'summary': {
                'total_reservations': len(upcoming),
                'total_expected_revenue': float(total_expected),
                'busiest_week': busiest,
            },
            'weekly_data': weekly_data,
            'upcoming': upcoming,
        })


class UserPermissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        report_perms = [
            'view_revenue_report',
            'view_occupancy_report',
            'view_guest_report',
            'view_today_overview',
            'view_room_performance_report',
            'view_reservation_report',
            'view_clv_report',
            'view_trends_report',
            'view_stay_duration_report',
            'view_upsell_report',
            'view_pipeline_report',
            'view_pl_report',
            'view_staff_sales_report',
            'view_expense_report',
            'view_income_report',
            'view_reservationreminder',
            'view_daily_settlement',
            'manage_daily_settlement',
        ]
        admin_perms = [
            'add_user',
            'change_user',
            'delete_user',
            'view_user',
            'add_group',
            'change_group',
            'delete_group',
            'view_group',
        ]
        ops_settings_perms = [
            'view_rooms', 'view_roomstaylogs', 'view_customers',
            'view_expense', 'view_income', 'view_roomncrequest', 'view_cashwithdrawal',
            'view_reservation',
            'view_roomtype', 'view_roomspricechart', 'view_countrycodes',
            'view_amenity', 'view_configurations', 'view_paymentmethod', 'view_expensecategory', 'view_incomecategory',
        ]
        result = {p: request.user.has_perm(f'management.{p}') for p in report_perms}
        for p in admin_perms:
            result[p] = request.user.has_perm(f'auth.{p}')
        for p in ops_settings_perms:
            result[p] = request.user.has_perm(f'management.{p}')
        crud_perms = [
            'add_rooms', 'change_rooms', 'delete_rooms',
            'add_customers', 'change_customers', 'delete_customers',
            'add_expense', 'change_expense', 'delete_expense',
            'add_income', 'change_income', 'delete_income',
            'add_roomncrequest', 'change_roomncrequest', 'delete_roomncrequest',
            'add_cashwithdrawal', 'change_cashwithdrawal', 'delete_cashwithdrawal',
            'add_roomstaylogs', 'change_roomstaylogs', 'delete_roomstaylogs',
            'add_reservation', 'change_reservation', 'delete_reservation',
            'add_roomtype', 'change_roomtype', 'delete_roomtype',
            'add_roomspricechart', 'change_roomspricechart', 'delete_roomspricechart',
            'add_countrycodes', 'change_countrycodes', 'delete_countrycodes',
            'add_amenity', 'change_amenity', 'delete_amenity',
            'add_configurations', 'change_configurations', 'delete_configurations',
            'add_paymentmethod', 'change_paymentmethod', 'delete_paymentmethod',
            'add_expensecategory', 'change_expensecategory', 'delete_expensecategory',
            'add_incomecategory', 'change_incomecategory', 'delete_incomecategory',
        ]
        for p in crud_perms:
            result[p] = request.user.has_perm(f'management.{p}')
        result['is_superuser'] = request.user.is_superuser
        result['is_staff'] = request.user.is_staff
        result['username'] = request.user.username
        result['first_name'] = request.user.first_name
        result['last_name'] = request.user.last_name
        result['email'] = request.user.email
        return Response(result)


# -----------  NC Request views  -----------

class NcRequestListCreate(generics.ListCreateAPIView):
    serializer_class = RoomNCRequestSerializer
    permission_classes = [HasModelPermission.for_model('management', 'roomncrequest')]

    def get_queryset(self):
        return RoomNCRequest.objects.select_related(
            'stay_log__room', 'stay_log__group', 'requested_by', 'reviewed_by',
        ).prefetch_related('stay_log__group__customers__customer').order_by('-created_on')

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)


class NcRequestDetail(generics.RetrieveUpdateAPIView):
    serializer_class = RoomNCRequestSerializer
    permission_classes = [HasModelPermission.for_model('management', 'roomncrequest')]

    def get_queryset(self):
        return RoomNCRequest.objects.select_related('stay_log__room', 'stay_log__group', 'requested_by', 'reviewed_by')

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        # Staff can only cancel their own pending requests
        if not request.user.is_superuser:
            if instance.requested_by != request.user:
                return Response({'error': 'You can only modify your own requests.'}, status=403)
            if instance.status != 'pending':
                return Response({'error': 'Can only cancel pending requests.'}, status=400)
            # Staff can only set status to cancelled (we'll just delete or reject)
        return super().partial_update(request, *args, **kwargs)


class NcRequestApprove(APIView):
    permission_classes = [HasModelPermission.for_model('management', 'roomncrequest')]

    def post(self, request, pk):
        if not request.user.is_superuser and not request.user.has_perm('management.change_roomncrequest'):
            return Response({'error': 'Permission denied.'}, status=403)
        nc = get_object_or_404(RoomNCRequest, pk=pk)
        if nc.status != 'pending':
            return Response({'error': 'Request is not pending.'}, status=400)
        nc.status = 'approved'
        nc.reviewed_by = request.user
        nc.reviewed_on = timezone.now()
        nc.save()
        nc.stay_log.is_nc = True
        nc.stay_log.save()
        return Response({'success': True})


class NcRequestReject(APIView):
    permission_classes = [HasModelPermission.for_model('management', 'roomncrequest')]

    def post(self, request, pk):
        if not request.user.is_superuser and not request.user.has_perm('management.change_roomncrequest'):
            return Response({'error': 'Permission denied.'}, status=403)
        nc = get_object_or_404(RoomNCRequest, pk=pk)
        if nc.status != 'pending':
            return Response({'error': 'Request is not pending.'}, status=400)
        nc.status = 'rejected'
        nc.reviewed_by = request.user
        nc.reviewed_on = timezone.now()
        nc.save()
        return Response({'success': True})


# -----------  Payment views  -----------

class StayLogPaymentListCreate(generics.ListCreateAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Payment.objects.filter(stay_log_id=self.kwargs['log_id']).select_related('processed_by')

    def perform_create(self, serializer):
        payment = serializer.save(stay_log_id=self.kwargs['log_id'], processed_by=self.request.user)
        record_money_event(
            'payment_received', payment.amount,
            payment_method=payment.payment_method,
            recorded_by=self.request.user,
            stay_log=payment.stay_log,
            note=payment.note,
        )


class StayLogPaymentDetail(generics.RetrieveDestroyAPIView):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def perform_destroy(self, instance):
        try:
            assert_date_not_settled(instance.created_on.date())
        except ValueError as e:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(str(e))
        instance.delete()


# -----------  Cash Withdrawal views  -----------

class CashWithdrawalListCreate(generics.ListCreateAPIView):
    serializer_class = CashWithdrawalSerializer
    permission_classes = [HasModelPermission.for_model('management', 'cashwithdrawal')]

    def get_queryset(self):
        return CashWithdrawal.objects.select_related('requested_by').order_by('-created_on')

    def perform_create(self, serializer):
        withdrawal = serializer.save(requested_by=self.request.user)
        event_type = 'cash_deposit' if withdrawal.entry_type == 'credit' else 'cash_withdrawal'
        record_money_event(
            event_type, withdrawal.amount,
            recorded_by=self.request.user,
            date=withdrawal.date,
            note=withdrawal.reason,
        )


class CashWithdrawalDetail(generics.RetrieveUpdateAPIView):
    serializer_class = CashWithdrawalSerializer
    permission_classes = [HasModelPermission.for_model('management', 'cashwithdrawal')]

    def get_queryset(self):
        return CashWithdrawal.objects.select_related('requested_by')


# -----------  Expense views  -----------

class ExpenseListCreate(generics.ListCreateAPIView):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Expense.objects.select_related('recorded_by', 'category', 'payment_method').order_by('-date', '-created_on')
        date = self.request.query_params.get('date')
        start = self.request.query_params.get('start_date')
        end = self.request.query_params.get('end_date')
        if date:
            qs = qs.filter(date=date)
        else:
            if start:
                qs = qs.filter(date__gte=start)
            if end:
                qs = qs.filter(date__lte=end)
        return qs

    def perform_create(self, serializer):
        expense = serializer.save(recorded_by=self.request.user)
        record_money_event(
            'expense_paid', expense.amount,
            payment_method=expense.payment_method,
            recorded_by=self.request.user,
            date=expense.date,
            note=expense.description,
        )


class ExpenseDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def perform_destroy(self, instance):
        try:
            assert_date_not_settled(instance.date)
        except ValueError as e:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(str(e))
        instance.delete()


class ExpenseAttachmentCreate(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        expense = get_object_or_404(Expense, pk=pk)
        files = request.FILES.getlist('files')
        if not files:
            return Response({'error': 'No files provided.'}, status=400)
        created = []
        for f in files:
            att = ExpenseAttachment.objects.create(expense=expense, file=f)
            created.append(ExpenseAttachmentSerializer(att, context={'request': request}).data)
        return Response(created, status=201)


class ExpenseAttachmentDelete(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        att = get_object_or_404(ExpenseAttachment, pk=pk)
        att.file.delete(save=False)
        att.delete()
        return Response(status=204)


# -----------  Income views  -----------

class IncomeListCreate(generics.ListCreateAPIView):
    serializer_class = IncomeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Income.objects.select_related('recorded_by', 'category', 'payment_method').order_by('-date', '-created_on')
        date = self.request.query_params.get('date')
        start = self.request.query_params.get('start_date')
        end = self.request.query_params.get('end_date')
        if date:
            qs = qs.filter(date=date)
        else:
            if start:
                qs = qs.filter(date__gte=start)
            if end:
                qs = qs.filter(date__lte=end)
        return qs

    def perform_create(self, serializer):
        income = serializer.save(recorded_by=self.request.user)
        record_money_event(
            'other_income', income.amount,
            payment_method=income.payment_method,
            recorded_by=self.request.user,
            date=income.date,
            note=income.description,
        )


class IncomeDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Income.objects.all()
    serializer_class = IncomeSerializer
    permission_classes = [IsAuthenticated]

    def perform_destroy(self, instance):
        try:
            assert_date_not_settled(instance.date)
        except ValueError as e:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(str(e))
        instance.delete()


class IncomeAttachmentCreate(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        income = get_object_or_404(Income, pk=pk)
        files = request.FILES.getlist('files')
        if not files:
            return Response({'error': 'No files provided.'}, status=400)
        created = []
        for f in files:
            att = IncomeAttachment.objects.create(income=income, file=f)
            created.append(IncomeAttachmentSerializer(att, context={'request': request}).data)
        return Response(created, status=201)


class IncomeAttachmentDelete(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        att = get_object_or_404(IncomeAttachment, pk=pk)
        att.file.delete(save=False)
        att.delete()
        return Response(status=204)


class StayNoteListCreate(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        stay = get_object_or_404(RoomStayLogs, pk=pk)
        text = request.data.get('text', '').strip()
        if not text:
            return Response({'error': 'text is required.'}, status=400)
        note = StayNote.objects.create(stay_log=stay, text=text, created_by=request.user)
        return Response(StayNoteSerializer(note).data, status=201)


class StayVehicleCreate(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        stay = get_object_or_404(RoomStayLogs, pk=pk)
        vehicle_number = request.data.get('vehicle_number', '').strip()
        if not vehicle_number:
            return Response({'error': 'vehicle_number is required.'}, status=400)
        vehicle = StayVehicle.objects.create(stay=stay, vehicle_number=vehicle_number)
        return Response(StayVehicleSerializer(vehicle).data, status=201)


class StayVehicleDelete(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        vehicle = get_object_or_404(StayVehicle, pk=pk)
        vehicle.delete()
        return Response(status=204)


class FoodOrderListCreate(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        stay = get_object_or_404(RoomStayLogs, pk=pk)
        orders = stay.food_orders.select_related('payment_method', 'ordered_by').prefetch_related('receipts').all()
        return Response(FoodOrderSerializer(orders, many=True, context={'request': request}).data)

    def post(self, request, pk):
        stay = get_object_or_404(RoomStayLogs, pk=pk)
        serializer = FoodOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save(stay_log=stay, ordered_by=request.user)
        if order.is_paid:
            order.paid_by = request.user
            order.save(update_fields=['paid_by'])
            record_money_event(
                'food_payment', order.amount,
                payment_method=order.payment_method,
                recorded_by=request.user,
                stay_log=stay,
                food_order=order,
            )
        return Response(FoodOrderSerializer(order, context={'request': request}).data, status=201)


class FoodOrderDetail(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        order = get_object_or_404(FoodOrder, pk=pk)
        was_paid = order.is_paid
        serializer = FoodOrderSerializer(order, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        if updated.is_paid and not updated.paid_by:
            updated.paid_by = request.user
            updated.save(update_fields=['paid_by'])
        if updated.is_paid and not was_paid:
            record_money_event(
                'food_payment', updated.amount,
                payment_method=updated.payment_method,
                recorded_by=request.user,
                stay_log=updated.stay_log,
                food_order=updated,
            )
        return Response(FoodOrderSerializer(updated, context={'request': request}).data)

    def delete(self, request, pk):
        order = get_object_or_404(FoodOrder, pk=pk)
        order.delete()
        return Response(status=204)


class FoodOrderReceiptCreate(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        order = get_object_or_404(FoodOrder, pk=pk)
        files = request.FILES.getlist('files')
        if not files:
            return Response({'error': 'No files provided.'}, status=400)
        created = []
        for f in files:
            receipt = FoodOrderReceipt.objects.create(food_order=order, file=f)
            created.append(FoodOrderReceiptSerializer(receipt, context={'request': request}).data)
        return Response(created, status=201)


class FoodOrderReceiptDelete(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        receipt = get_object_or_404(FoodOrderReceipt, pk=pk)
        receipt.file.delete(save=False)
        receipt.delete()
        return Response(status=204)


# -----------  Finance report views  -----------

class PLReportView(APIView):
    permission_classes = [report_permission('view_pl_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        logs = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            check_out__date__gte=start,
            check_out__date__lte=end,
        ).prefetch_related('amenities__amenity')

        total_revenue = Decimal(0)
        room_revenue = Decimal(0)
        amenity_revenue = Decimal(0)
        revenue_by_day = defaultdict(lambda: Decimal(0))

        for log in logs:
            if log.is_nc:
                continue
            nights = max(1, (log.check_out.date() - log.check_in.date()).days)
            r_rev = (log.price + log.extra_bed * log.extra_per_bed_price) * nights
            a_rev = sum(
                a.amenity.price * a.quantity * (nights if a.amenity.charge_type == 'per_night' else 1)
                for a in log.amenities.all()
            )
            total_revenue += r_rev + a_rev
            room_revenue += r_rev
            amenity_revenue += a_rev
            revenue_by_day[log.check_out.date().isoformat()] += r_rev + a_rev

        expenses = Expense.objects.filter(date__gte=start, date__lte=end).select_related('payment_method')
        total_expenses = sum(e.amount for e in expenses)
        by_payment_type = defaultdict(lambda: Decimal(0))
        expense_by_day = defaultdict(lambda: Decimal(0))
        for e in expenses:
            by_payment_type[e.payment_method.name if e.payment_method else 'Other'] += e.amount
            expense_by_day[e.date.isoformat()] += e.amount

        all_days = sorted(set(list(revenue_by_day.keys()) + list(expense_by_day.keys())))
        chart_data = []
        for d in all_days:
            rev = float(revenue_by_day.get(d, 0))
            exp = float(expense_by_day.get(d, 0))
            chart_data.append({'period': d, 'revenue': rev, 'expenses': exp, 'net': rev - exp})

        return Response({
            'revenue': {
                'total': float(total_revenue),
                'by_type': {'room': float(room_revenue), 'amenity': float(amenity_revenue)},
            },
            'expenses': {
                'total': float(total_expenses),
                'by_payment_type': {k: float(v) for k, v in by_payment_type.items()},
            },
            'net_profit': float(total_revenue) - float(total_expenses),
            'chart_data': chart_data,
        })


class StaffSalesView(APIView):
    permission_classes = [report_permission('view_staff_sales_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        payments = Payment.objects.filter(
            created_on__date__gte=start,
            created_on__date__lte=end,
        ).select_related('processed_by', 'payment_method')

        staff_data = defaultdict(lambda: {'total_collected': Decimal(0), 'by_type': defaultdict(lambda: Decimal(0))})
        overall_by_type = defaultdict(lambda: Decimal(0))

        for p in payments:
            name = (p.processed_by.get_full_name() or p.processed_by.username) if p.processed_by else 'Unknown'
            pm_name = p.payment_method.name if p.payment_method else 'Other'
            staff_data[name]['total_collected'] += p.amount
            staff_data[name]['by_type'][pm_name] += p.amount
            overall_by_type[pm_name] += p.amount

        staff_list = []
        for name, d in staff_data.items():
            staff_list.append({
                'name': name,
                'total_collected': float(d['total_collected']),
                'by_type': {k: float(v) for k, v in d['by_type'].items()},
            })
        staff_list.sort(key=lambda x: x['total_collected'], reverse=True)

        return Response({
            'staff': staff_list,
            'by_payment_type': {k: float(v) for k, v in overall_by_type.items()},
        })



class ExpenseReportView(APIView):
    permission_classes = [report_permission('view_expense_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        expenses = Expense.objects.filter(
            date__gte=start,
            date__lte=end,
        ).select_related('recorded_by', 'payment_method', 'category').order_by('date')

        total = Decimal(0)
        by_payment_type = defaultdict(lambda: Decimal(0))
        by_category = defaultdict(lambda: Decimal(0))
        by_day = defaultdict(list)

        for e in expenses:
            total += e.amount
            pm_name = e.payment_method.name if e.payment_method else 'Other'
            cat_name = e.category.name if e.category else 'Uncategorized'
            by_payment_type[pm_name] += e.amount
            by_category[cat_name] += e.amount
            by_day[e.date.isoformat()].append({
                'id': e.id,
                'description': e.description,
                'amount': float(e.amount),
                'payment_type': pm_name,
                'category': cat_name,
                'recorded_by': e.recorded_by.get_full_name() or e.recorded_by.username if e.recorded_by else None,
            })

        by_day_list = sorted(
            [{'date': d, 'total': sum(i['amount'] for i in items), 'items': items} for d, items in by_day.items()],
            key=lambda x: x['date'],
        )

        return Response({
            'total': float(total),
            'by_payment_type': {k: float(v) for k, v in by_payment_type.items()},
            'by_category': {k: float(v) for k, v in by_category.items()},
            'by_day': by_day_list,
        })


class IncomeReportView(APIView):
    permission_classes = [report_permission('view_income_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        incomes = Income.objects.filter(
            date__gte=start,
            date__lte=end,
        ).select_related('recorded_by', 'payment_method', 'category').order_by('date')

        total = Decimal(0)
        by_payment_type = defaultdict(lambda: Decimal(0))
        by_category = defaultdict(lambda: Decimal(0))
        by_day = defaultdict(list)

        for i in incomes:
            total += i.amount
            pm_name = i.payment_method.name if i.payment_method else 'Other'
            cat_name = i.category.name if i.category else 'Uncategorized'
            by_payment_type[pm_name] += i.amount
            by_category[cat_name] += i.amount
            by_day[i.date.isoformat()].append({
                'id': i.id,
                'description': i.description,
                'amount': float(i.amount),
                'payment_type': pm_name,
                'category': cat_name,
                'recorded_by': i.recorded_by.get_full_name() or i.recorded_by.username if i.recorded_by else None,
            })

        by_day_list = sorted(
            [{'date': d, 'total': sum(i['amount'] for i in items), 'items': items} for d, items in by_day.items()],
            key=lambda x: x['date'],
        )

        return Response({
            'total': float(total),
            'by_payment_type': {k: float(v) for k, v in by_payment_type.items()},
            'by_category': {k: float(v) for k, v in by_category.items()},
            'by_day': by_day_list,
        })


class ExtendStay(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    def patch(self, request, pk):
        log = get_object_or_404(RoomStayLogs, pk=pk)
        if log.check_out is not None:
            return Response({'error': 'Stay has already ended.'}, status=400)

        serializer = ExtendStaySerializer(log, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        new_expected = serializer.validated_data['expected_checkout']
        new_date = new_expected.date()
        old_date = log.expected_checkout.date() if log.expected_checkout else timezone.localdate()

        if Reservation.objects.filter(
            room=log.room,
            check_in_date__lt=new_date,
            check_out_date__gt=old_date,
        ).exists():
            return Response({'error': 'Conflicting reservation in extended period.'}, status=400)

        log.expected_checkout = new_expected
        log.save()
        return Response(ActiveStayLogSerializer(log).data)


class GrantGrace(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    def post(self, request, pk):
        log = get_object_or_404(RoomStayLogs, pk=pk)
        if log.check_out is not None:
            return Response({'error': 'Stay has already ended.'}, status=400)

        if not log.expected_checkout:
            return Response({'error': 'No expected checkout set for this stay.'}, status=400)

        if log.expected_checkout.date() != timezone.localdate():
            return Response(
                {'error': 'Grace can only be granted on the checkout day. Use Extend Stay instead.'},
                status=400,
            )

        serializer = GraceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        hours = serializer.validated_data['hours']
        log.grace_until = timezone.now() + timedelta(hours=hours)
        log.save()
        return Response({'grace_until': log.grace_until})


class ShiftRoom(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    @transaction.atomic
    def post(self, request, pk):
        log = get_object_or_404(RoomStayLogs, pk=pk)
        if log.check_out is not None:
            return Response({'error': 'Stay has already ended.'}, status=400)

        serializer = ShiftRoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_room = serializer.validated_data['new_room']
        reason = serializer.validated_data['reason']

        if new_room.pk == log.room.pk:
            return Response({'error': 'New room must be different from the current room.'}, status=400)

        if new_room.is_occupied():
            return Response({'error': f'Room {new_room.room_number} is already occupied.'}, status=400)

        old_room = log.room

        # Update the existing stay log in place — no new log created
        apply = serializer.validated_data.get('apply_extra_beds', True)
        log.shifted_from = old_room
        log.shift_reason = reason
        log.room = new_room
        log.price = serializer.validated_data.get('price', log.price)
        log.extra_bed = serializer.validated_data.get('extra_bed', log.extra_bed) if apply else 0
        log.extra_per_bed_price = serializer.validated_data.get('extra_per_bed_price', log.extra_per_bed_price) if apply else 0
        log.save()

        # Set old room back to available (shift ≠ checkout, no cleaning required)
        old_status = old_room.status
        old_room.status = 'available'
        old_room.save(update_fields=['status'])
        RoomStatusLog.objects.create(
            room=old_room,
            old_status=old_status,
            new_status='available',
            changed_by=request.user,
            note=f'Auto-set after room shift to {new_room.room_number}',
        )

        return Response({'new_log_id': log.id, 'new_room_id': new_room.id, 'new_room_number': new_room.room_number})


class GSTReportView(APIView):
    permission_classes = [report_permission('view_revenue_report')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        gst_cfg = Configurations.objects.filter(key='gst_percent').first()
        gst_rate = Decimal(gst_cfg.value) / 100 if gst_cfg and gst_cfg.value else Decimal(0)

        logs = RoomStayLogs.objects.filter(
            check_out__isnull=False,
            gst_applied=True,
            check_out__date__gte=start,
            check_out__date__lte=end,
        ).select_related('room', 'group').prefetch_related('group__customers__customer')

        entries = []
        total_gst = Decimal(0)
        total_room_revenue = Decimal(0)

        for log in logs:
            nights = max(1, (log.check_out.date() - log.check_in.date()).days)
            room_base = (log.price + log.extra_bed * log.extra_per_bed_price) * nights
            gst_amount = room_base * gst_rate
            total_room_revenue += room_base
            total_gst += gst_amount
            guests = [cg.customer.name for cg in log.group.customers.all()]
            entries.append({
                'log_id': log.id,
                'room': log.room.room_number,
                'guests': guests,
                'check_in': log.check_in.date().isoformat(),
                'check_out': log.check_out.date().isoformat(),
                'nights': nights,
                'room_base': float(room_base),
                'gst_amount': float(gst_amount),
            })

        return Response({
            'total_gst': float(total_gst),
            'total_room_revenue': float(total_room_revenue),
            'gst_rate': float(gst_rate * 100),
            'entries': entries,
        })


class StayLogHistory(generics.ListAPIView):
    serializer_class = ActiveStayLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = RoomStayLogs.objects.filter(check_out__isnull=False) \
            .select_related('room', 'group', 'checked_in_by', 'checked_out_by') \
            .prefetch_related(
                'group__customers__customer',
                'amenities__amenity',
                'amenities__added_by',
                'payments__processed_by',
                'payments__payment_method',
                'nc_requests',
                'food_orders__payment_method',
                'food_orders__receipts',
                'food_orders__ordered_by',
                'notes__created_by',
                'vehicles',
                'cancellations__cancelled_by',
            ) \
            .order_by('-check_out')

        search = self.request.query_params.get('search', '').strip()
        start = self.request.query_params.get('start_date')
        end = self.request.query_params.get('end_date')

        if search:
            qs = qs.filter(
                Q(room__room_number__icontains=search) |
                Q(group__customers__customer__name__icontains=search)
            ).distinct()
        if start:
            qs = qs.filter(check_in__date__gte=start)
        if end:
            qs = qs.filter(check_out__date__lte=end)
        return qs


class ReservationReminderListCreate(generics.ListCreateAPIView):
    serializer_class = ReservationReminderSerializer
    permission_classes = [report_permission('view_reservationreminder')]

    def get_queryset(self):
        today = timezone.localdate()
        qs = ReservationReminder.objects.select_related('reservation__room').exclude(
            dismissed_by=self.request.user
        )
        due_ids = [r.id for r in qs if (r.reservation.check_in_date - timedelta(days=r.days_before)) <= today]
        return qs.filter(id__in=due_ids)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class ReservationReminderDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ReservationReminderSerializer
    permission_classes = [report_permission('view_reservationreminder')]

    def get_queryset(self):
        return ReservationReminder.objects.all()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        if request.data.get('is_dismissed'):
            instance.dismissed_by.add(request.user)
        return Response(self.get_serializer(instance).data)


# -----------  Settlement views  -----------

class SettlementView(APIView):
    permission_classes = [IsAuthenticated]

    def _check_view_permission(self, user):
        return user.is_superuser or user.has_perm('management.view_daily_settlement')

    def _check_manage_permission(self, user):
        return user.is_superuser or user.has_perm('management.manage_daily_settlement')

    def get(self, request, date_str):
        if not self._check_view_permission(request.user):
            return Response({'error': 'Permission denied.'}, status=403)
        try:
            date_val = date_type.fromisoformat(date_str)
        except ValueError:
            return Response({'error': 'Invalid date. Use YYYY-MM-DD.'}, status=400)

        settlement, _ = DailySettlement.objects.get_or_create(date=date_val)
        snap = compute_settlement_snapshot(date_val)

        if settlement.status == 'settled':
            breakdowns = list(
                settlement.method_breakdowns
                .select_related('payment_method')
                .order_by('payment_method__name')
            )
            method_data = [
                {
                    'payment_method_id':   b.payment_method_id,
                    'payment_method_name': b.payment_method.name,
                    'system_inflow':       int(b.system_inflow),
                    'system_outflow':      int(b.system_outflow),
                    'system_net':          int(b.system_inflow - b.system_outflow),
                    'actual_received':     int(b.actual_received) if b.actual_received is not None else None,
                    'difference':          int(b.actual_received - (b.system_inflow - b.system_outflow)) if b.actual_received is not None else None,
                }
                for b in breakdowns
            ]
            totals = {
                'room_payments':            int(settlement.snap_room_payments),
                'food_payments':            int(settlement.snap_food_payments),
                'reservation_advances':     int(settlement.snap_reservation_advances),
                'direct_cancellation_fees': int(settlement.snap_direct_cancellation_fees),
                'cash_deposits':            int(settlement.snap_cash_deposits),
                'other_income':             int(settlement.snap_other_income),
                'withheld_cancellation_fees': int(snap['withheld_cancellation_fees']),
                'expenses':                 int(settlement.snap_expenses),
                'withdrawals':              int(settlement.snap_withdrawals),
                'refunds':                  int(settlement.snap_refunds),
                'total_inflow':             int(settlement.snap_total_inflow),
                'total_outflow':            int(settlement.snap_total_outflow),
                'net':                      int(settlement.snap_net),
            }
        else:
            method_data = [
                {
                    'payment_method_id':   pm_id,
                    'payment_method_name': data['name'],
                    'system_inflow':       int(data['inflow']),
                    'system_outflow':      int(data['outflow']),
                    'system_net':          int(data['inflow'] - data['outflow']),
                    'actual_received':     None,
                    'difference':          None,
                }
                for pm_id, data in sorted(snap['by_method'].items(), key=lambda x: x[1]['name'])
            ]
            totals = {
                'room_payments':            int(snap['room_payments']),
                'food_payments':            int(snap['food_payments']),
                'reservation_advances':     int(snap['reservation_advances']),
                'direct_cancellation_fees': int(snap['direct_cancellation_fees']),
                'cash_deposits':            int(snap['cash_deposits']),
                'other_income':             int(snap['other_income']),
                'withheld_cancellation_fees': int(snap['withheld_cancellation_fees']),
                'expenses':                 int(snap['expenses']),
                'withdrawals':              int(snap['withdrawals']),
                'refunds':                  int(snap['refunds']),
                'total_inflow':             int(snap['total_inflow']),
                'total_outflow':            int(snap['total_outflow']),
                'net':                      int(snap['net']),
            }

        return Response({
            'id':                settlement.id,
            'date':              str(settlement.date),
            'status':            settlement.status,
            'totals':            totals,
            'method_breakdowns': method_data,
            'settled_by':        settlement.settled_by.username if settlement.settled_by else None,
            'settled_at':        settlement.settled_at.isoformat() if settlement.settled_at else None,
            'notes':             settlement.notes,
            'events':            [serialize_event(e) for e in snap['events']],
        })

    def post(self, request, date_str):
        """Settle the day: freeze snapshot and record actuals."""
        if not self._check_manage_permission(request.user):
            return Response({'error': 'Permission denied.'}, status=403)
        try:
            date_val = date_type.fromisoformat(date_str)
        except ValueError:
            return Response({'error': 'Invalid date. Use YYYY-MM-DD.'}, status=400)

        if date_val >= timezone.localdate():
            return Response({'error': 'Cannot settle today or a future date.'}, status=400)

        settlement, _ = DailySettlement.objects.get_or_create(date=date_val)
        if settlement.status == 'settled':
            return Response({'error': 'Already settled.'}, status=400)

        snap    = compute_settlement_snapshot(date_val)
        actuals = request.data.get('actuals', [])
        notes   = request.data.get('notes', '').strip()

        with transaction.atomic():
            settlement.snap_room_payments            = snap['room_payments']
            settlement.snap_food_payments            = snap['food_payments']
            settlement.snap_reservation_advances     = snap['reservation_advances']
            settlement.snap_direct_cancellation_fees = snap['direct_cancellation_fees']
            settlement.snap_cash_deposits            = snap['cash_deposits']
            settlement.snap_other_income             = snap['other_income']
            settlement.snap_total_inflow             = snap['total_inflow']
            settlement.snap_expenses                 = snap['expenses']
            settlement.snap_withdrawals              = snap['withdrawals']
            settlement.snap_refunds                  = snap['refunds']
            settlement.snap_total_outflow            = snap['total_outflow']
            settlement.snap_net                      = snap['net']
            settlement.status                        = 'settled'
            settlement.settled_by                    = request.user
            settlement.settled_at                    = timezone.now()
            settlement.notes                         = notes
            settlement.save()

            for item in actuals:
                pm_id  = item.get('payment_method_id')
                actual = _parse_money(item.get('actual_received'))
                pm_snap = snap['by_method'].get(pm_id, {'inflow': Decimal('0'), 'outflow': Decimal('0')})
                SettlementMethodBreakdown.objects.update_or_create(
                    settlement=settlement,
                    payment_method_id=pm_id,
                    defaults={
                        'system_inflow':   pm_snap['inflow'],
                        'system_outflow':  pm_snap['outflow'],
                        'actual_received': actual,
                    },
                )

        return Response({'success_message': f'Settlement for {date_val} completed.'})


class ServeMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, file_path):
        try:
            exists = default_storage.exists(file_path)
        except SuspiciousFileOperation:
            raise Http404
        if not exists:
            raise Http404
        return FileResponse(default_storage.open(file_path, 'rb'))
