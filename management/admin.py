from django.contrib import admin
from .models import *

# Register your models here.
admin.site.register(CounterCodes)
admin.site.register(Customers)
admin.site.register(Group)
admin.site.register(CustomerGroup)
admin.site.register(RoomType)
admin.site.register(Rooms)
admin.site.register(RoomsPriceChart)
admin.site.register(RoomStayLogs)
admin.site.register(Configurations)
