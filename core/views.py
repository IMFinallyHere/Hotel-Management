from rest_framework_simplejwt.views import TokenObtainPairView

from .throttles import LoginRateThrottle


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]
