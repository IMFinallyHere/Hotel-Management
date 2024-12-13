from django.db import models
from django.core.validators import FileExtensionValidator
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
    number = models.CharField(max_length=10, unique=True)
    country_code = models.ForeignKey(CountryCodes, models.PROTECT)
    address = models.CharField(max_length=300, null=True)
    pincode = models.CharField(max_length=6, null=True)
    gender = models.CharField(choices=GENDER, max_length=6)
    identity_card_1 = models.FileField(null=True, blank=False, validators=[FileExtensionValidator(allowed_extensions=['pdf', 'jpeg', 'jpg', 'png']), validate_file_size])
    identity_card_2 = models.FileField(null=True, blank=False, validators=[FileExtensionValidator(allowed_extensions=['pdf', 'jpeg', 'jpg', 'png']), validate_file_size])
    date_of_birth = models.DateField(null=True)
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
    room_number = models.CharField(unique=True, max_length=10)
    room_type = models.ForeignKey(RoomType, models.CASCADE, 'rooms')
    beds = models.PositiveSmallIntegerField()
    price = models.DecimalField(max_digits=7, decimal_places=0)  # default price

    def is_occupied(self) -> bool:
        if self.logs.filter(check_out=None):
            return True
        else:
            return False


class RoomsPriceChart(models.Model):
    room = models.ForeignKey(Rooms, models.CASCADE, 'price_chart')
    date = models.DateField()
    price = models.DecimalField(max_digits=7, decimal_places=0)


class RoomStayLogs(models.Model):
    room = models.ForeignKey(Rooms, models.CASCADE, 'logs')
    check_in = models.DateTimeField(auto_now_add=True)
    check_out = models.DateTimeField(null=True)
    price = models.DecimalField(max_digits=7, decimal_places=0, default=0)
    group = models.ForeignKey(Group, models.PROTECT, 'logs')
    extra_bed = models.PositiveSmallIntegerField(default=0)
    extra_per_bed_price = models.DecimalField(max_digits=7, decimal_places=0, default=0)


class Configurations(models.Model):
    key = models.CharField(max_length=30)
    value = models.TextField(null=True)
