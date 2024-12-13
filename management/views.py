from rest_framework import generics
from rest_framework.views import APIView
from .models import Rooms, RoomType, CountryCodes, Customers, Configurations, RoomStayLogs, Group, CustomerGroup
from .serializers import RoomSerializer, RoomTypeSerializer, CountryCodeSerializer, CustomerSerializer, ConfigurationSerializer, CheckinSerializer, GroupCustomerSerializer
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


class Checkin(APIView):
    permission_classes = [DjangoModelPermissions]

    @staticmethod
    def get_queryset():
        return RoomStayLogs.objects.all()

    def post(self, request):
        serializer = CheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({'success_message': 'Checking Successful.'})


@api_view(['POST'])
@permission_classes([DjangoModelPermissions])
def group_customer(request):
    serializer = GroupCustomerSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    g = Group()
    g.save()

    grouped = [CustomerGroup(customer=i, group=g) for i in serializer.customers]
    CustomerGroup.objects.bulk_create(grouped)

    return Response({'group_id': g.id})

