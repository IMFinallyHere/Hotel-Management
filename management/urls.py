# urls.py

from django.urls import path
from .views import RoomTypeListCreate, RoomTypeDetail, RoomListCreate, RoomDetail, CountryCodeListCreate, CountryCodeDetail, CustomerListCreate, CustomerDetail, ConfigurationListCreate, ConfigurationDetail


urlpatterns = [
    path('room/types/', RoomTypeListCreate.as_view(), name='room-type-list-create'),
    path('room/types/<int:pk>/', RoomTypeDetail.as_view(), name='room-type-detail'),
    path('rooms/', RoomListCreate.as_view(), name='room-list-create'),
    path('rooms/<int:pk>/', RoomDetail.as_view(), name='room-detail'),
    path('country/codes/', CountryCodeListCreate.as_view(), name='country-code-list-create'),
    path('country/codes/<int:pk>/', CountryCodeDetail.as_view(), name='country-code-detail'),
    path('customers/', CustomerListCreate.as_view(), name='customer-list-create'),
    path('customers/<int:pk>/', CustomerDetail.as_view(), name='customer-detail'),
    path('configurations/', ConfigurationListCreate.as_view(), name='configuration-list-create'),
    path('configurations/<int:pk>/', ConfigurationDetail.as_view(), name='configuration-detail'),
]