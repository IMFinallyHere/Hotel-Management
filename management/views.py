import statistics
from collections import defaultdict
from datetime import timedelta, date as date_type
from decimal import Decimal

from rest_framework import generics
from rest_framework.views import APIView
from django.db.models import Q, Count
from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Rooms, RoomType, CountryCodes, Customers, Configurations, RoomStayLogs, Group, CustomerGroup, RoomsPriceChart, Reservation, Amenity, StayLogAmenity, RoomNCRequest, Payment, CashWithdrawal, Expense
from .serializers import RoomSerializer, RoomTypeSerializer, CountryCodeSerializer, CustomerSerializer, ConfigurationSerializer, CheckinSerializer, GroupCustomerSerializer, RoomsPriceChartSerializer, StayLogSerializer, StayLogUpdateSerializer, ReservationSerializer, AmenitySerializer, StayLogAmenitySerializer, ActiveStayLogSerializer, RoomNCRequestSerializer, PaymentSerializer, CashWithdrawalSerializer, ExpenseSerializer
from .permissions import report_permission
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import DjangoModelPermissions
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes


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
    queryset = Rooms.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [DjangoModelPermissions]


class RoomDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Rooms.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [DjangoModelPermissions]


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
    queryset = Customers.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [DjangoModelPermissions]


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
    queryset = RoomStayLogs.objects.filter(check_out=None).prefetch_related(
        'group__customers__customer', 'amenities__amenity', 'payments__processed_by', 'nc_requests',
    )
    serializer_class = ActiveStayLogSerializer
    permission_classes = [DjangoModelPermissions]


class Checkin(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    def post(self, request):
        serializer = CheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'success_message': 'Checking Successful.'})


class Checkout(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    def post(self, request, pk):
        log = get_object_or_404(RoomStayLogs, pk=pk)
        if log.check_out is not None:
            return Response({'error': 'Room already checked out.'}, status=400)
        log.check_out = timezone.now()
        log.save()
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

    def get_queryset(self):
        qs = Reservation.objects.all()
        room = self.request.query_params.get('room')
        if room:
            qs = qs.filter(room=room)
        return qs


class ReservationDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Reservation.objects.all()
    serializer_class = ReservationSerializer
    permission_classes = [DjangoModelPermissions]


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


class StayLogAmenityListCreate(generics.ListCreateAPIView):
    serializer_class = StayLogAmenitySerializer
    permission_classes = [DjangoModelPermissions]

    def get_queryset(self):
        return StayLogAmenity.objects.filter(stay_log_id=self.kwargs['log_id']).select_related('amenity')

    def perform_create(self, serializer):
        serializer.save(stay_log_id=self.kwargs['log_id'])


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
        cg_qs = CustomerGroup.objects.filter(group_id__in=group_ids).select_related('customer')

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
        perms = [
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
            'view_cash_reconciliation',
            'view_expense_report',
        ]
        result = {p: request.user.has_perm(f'management.{p}') for p in perms}
        result['is_superuser'] = request.user.is_superuser
        return Response(result)


# -----------  NC Request views  -----------

class NcRequestListCreate(generics.ListCreateAPIView):
    serializer_class = RoomNCRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return RoomNCRequest.objects.select_related(
            'stay_log__room', 'stay_log__group', 'requested_by', 'reviewed_by',
        ).prefetch_related('stay_log__group__customers__customer').order_by('-created_on')

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)


class NcRequestDetail(generics.RetrieveUpdateAPIView):
    serializer_class = RoomNCRequestSerializer
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not request.user.is_superuser:
            return Response({'error': 'Admin only.'}, status=403)
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
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not request.user.is_superuser:
            return Response({'error': 'Admin only.'}, status=403)
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
        serializer.save(stay_log_id=self.kwargs['log_id'], processed_by=self.request.user)


class StayLogPaymentDetail(generics.RetrieveDestroyAPIView):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]


# -----------  Cash Withdrawal views  -----------

class CashWithdrawalListCreate(generics.ListCreateAPIView):
    serializer_class = CashWithdrawalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CashWithdrawal.objects.select_related('requested_by', 'reviewed_by').order_by('-created_on')

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)


class CashWithdrawalDetail(generics.RetrieveUpdateAPIView):
    serializer_class = CashWithdrawalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CashWithdrawal.objects.select_related('requested_by', 'reviewed_by')


class CashWithdrawalApprove(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not request.user.is_superuser:
            return Response({'error': 'Admin only.'}, status=403)
        w = get_object_or_404(CashWithdrawal, pk=pk)
        if w.status != 'pending':
            return Response({'error': 'Withdrawal is not pending.'}, status=400)
        w.status = 'approved'
        w.reviewed_by = request.user
        w.reviewed_on = timezone.now()
        w.save()
        return Response({'success': True})


class CashWithdrawalReject(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not request.user.is_superuser:
            return Response({'error': 'Admin only.'}, status=403)
        w = get_object_or_404(CashWithdrawal, pk=pk)
        if w.status != 'pending':
            return Response({'error': 'Withdrawal is not pending.'}, status=400)
        w.status = 'rejected'
        w.reviewed_by = request.user
        w.reviewed_on = timezone.now()
        w.save()
        return Response({'success': True})


# -----------  Expense views  -----------

class ExpenseListCreate(generics.ListCreateAPIView):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Expense.objects.select_related('recorded_by').order_by('-date', '-created_on')
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
        serializer.save(recorded_by=self.request.user)


class ExpenseDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]


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

        expenses = Expense.objects.filter(date__gte=start, date__lte=end)
        total_expenses = sum(e.amount for e in expenses)
        by_payment_type = defaultdict(lambda: Decimal(0))
        expense_by_day = defaultdict(lambda: Decimal(0))
        for e in expenses:
            by_payment_type[e.payment_type] += e.amount
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
        ).select_related('processed_by')

        staff_data = defaultdict(lambda: {'total_collected': Decimal(0), 'by_type': defaultdict(lambda: Decimal(0))})
        overall_by_type = defaultdict(lambda: Decimal(0))

        for p in payments:
            name = (p.processed_by.get_full_name() or p.processed_by.username) if p.processed_by else 'Unknown'
            staff_data[name]['total_collected'] += p.amount
            staff_data[name]['by_type'][p.payment_type] += p.amount
            overall_by_type[p.payment_type] += p.amount

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


class CashReconciliationView(APIView):
    permission_classes = [report_permission('view_cash_reconciliation')]

    def get(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start_date'), today - timedelta(days=30))
        end = _parse_date(request.query_params.get('end_date'), today)

        cash_payments = Payment.objects.filter(
            payment_type='cash',
            created_on__date__gte=start,
            created_on__date__lte=end,
        )
        cash_in = sum(p.amount for p in cash_payments)

        withdrawals = CashWithdrawal.objects.filter(
            status='approved',
            date__gte=start,
            date__lte=end,
        ).select_related('requested_by')
        total_withdrawals = sum(w.amount for w in withdrawals)

        cash_expenses = Expense.objects.filter(
            payment_type='cash',
            date__gte=start,
            date__lte=end,
        ).select_related('recorded_by')
        total_cash_expenses = sum(e.amount for e in cash_expenses)

        withdrawals_list = [
            {
                'id': w.id, 'date': w.date.isoformat(), 'amount': float(w.amount),
                'reason': w.reason, 'requested_by': w.requested_by.get_full_name() or w.requested_by.username if w.requested_by else None,
            }
            for w in withdrawals
        ]
        expenses_list = [
            {
                'id': e.id, 'date': e.date.isoformat(), 'amount': float(e.amount),
                'description': e.description, 'recorded_by': e.recorded_by.get_full_name() or e.recorded_by.username if e.recorded_by else None,
            }
            for e in cash_expenses
        ]

        return Response({
            'cash_in': float(cash_in),
            'withdrawals': float(total_withdrawals),
            'cash_expenses': float(total_cash_expenses),
            'net_cash': float(cash_in) - float(total_withdrawals) - float(total_cash_expenses),
            'withdrawals_list': withdrawals_list,
            'expenses_list': expenses_list,
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
        ).select_related('recorded_by').order_by('date')

        total = Decimal(0)
        by_payment_type = defaultdict(lambda: Decimal(0))
        by_day = defaultdict(list)

        for e in expenses:
            total += e.amount
            by_payment_type[e.payment_type] += e.amount
            by_day[e.date.isoformat()].append({
                'id': e.id,
                'description': e.description,
                'amount': float(e.amount),
                'payment_type': e.payment_type,
                'recorded_by': e.recorded_by.get_full_name() or e.recorded_by.username if e.recorded_by else None,
            })

        by_day_list = sorted(
            [{'date': d, 'total': sum(i['amount'] for i in items), 'items': items} for d, items in by_day.items()],
            key=lambda x: x['date'],
        )

        return Response({
            'total': float(total),
            'by_payment_type': {k: float(v) for k, v in by_payment_type.items()},
            'by_day': by_day_list,
        })
