from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

from .views import ThrottledTokenObtainPairView

urlpatterns = [
    path("admin/", admin.site.urls),
    path('auth/', include('rest_framework.urls')),
    path('auth/token/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('v1/', include('management.urls'))
]
