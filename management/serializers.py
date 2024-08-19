from rest_framework import serializers
from .models import Rooms, RoomType, CountryCodes, Customers, Configurations


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