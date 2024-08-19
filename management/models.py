from django.db import models


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
    identity_card_1 = models.FileField(null=True)
    identity_card_2 = models.FileField(null=True)
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
    room_number = models.PositiveSmallIntegerField(unique=True)
    room_type = models.ForeignKey(RoomType, models.CASCADE, 'rooms')
    beds = models.PositiveSmallIntegerField()
    price = models.DecimalField(max_digits=7, decimal_places=0)  # default price


class RoomsPriceChart(models.Model):
    room = models.ForeignKey(Rooms, models.CASCADE, 'price_chart')
    date = models.DateField()
    price = models.DecimalField(max_digits=7, decimal_places=0)


class RoomStayLogs(models.Model):
    room = models.ForeignKey(Rooms, models.CASCADE, 'logs')
    check_in = models.DateTimeField(auto_now_add=True)
    check_out = models.DateTimeField(null=True)
    price = models.DecimalField(max_digits=7, decimal_places=0)
    group = models.ForeignKey(Group, models.PROTECT, 'logs')
    extra_bed = models.PositiveSmallIntegerField(default=0)
    extra_per_bed_price = models.DecimalField(max_digits=7, decimal_places=0)


class Configurations(models.Model):
    key = models.CharField(max_length=30)
    value = models.TextField(null=True)
