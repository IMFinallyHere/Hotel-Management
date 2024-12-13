from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from .models import Rooms, RoomType, CountryCodes, Customers, Configurations, RoomStayLogs


class RoomTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomType
        fields = '__all__'


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rooms
        fields = '__all__'


class CountryCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CountryCodes
        fields = '__all__'


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customers
        fields = '__all__'


class ConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Configurations
        fields = '__all__'


class CheckinSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomStayLogs
        fields = ['room', 'price', 'group', 'extra_per_bed_price']

    @staticmethod
    def validate_room(value: str):
        room = get_object_or_404(Rooms, value)
        if room.is_occupied():
            raise ValidationError('Room is already occupied. Please checkout room to occupy it again.')
        return room


class GroupCustomerSerializer(serializers.Serializer):
    customers = serializers.ListSerializer(child=serializers.PrimaryKeyRelatedField(queryset=Customers.objects.all()), required=True, allow_null=False, allow_empty=False)
