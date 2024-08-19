from rest_framework import generics
from .models import Rooms, RoomType, CountryCodes, Customers, Configurations
from .serializers import RoomSerializer, RoomTypeSerializer, CountryCodeSerializer, CustomerSerializer, ConfigurationSerializer
from rest_framework.permissions import DjangoModelPermissions


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
