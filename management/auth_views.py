from django.contrib.auth.models import User, Group, Permission
from django.db.models import Count
from rest_framework import generics
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_serializers import UserSerializer, GroupSerializer, PermissionSerializer


class IsSuperUser(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


# ---- User endpoints ----

class UserListCreate(generics.ListCreateAPIView):
    queryset = User.objects.all().prefetch_related('groups')
    serializer_class = UserSerializer
    permission_classes = [IsSuperUser]


class UserDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all().prefetch_related('groups')
    serializer_class = UserSerializer
    permission_classes = [IsSuperUser]

    def perform_update(self, serializer):
        user = self.get_object()
        if user == self.request.user:
            data = serializer.validated_data
            if data.get('is_active') is False:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'is_active': 'You cannot deactivate yourself.'})
            if data.get('is_superuser') is False:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'is_superuser': 'You cannot remove your own superuser status.'})
        serializer.save()

    def perform_destroy(self, instance):
        if instance == self.request.user:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('You cannot deactivate yourself.')
        instance.is_active = False
        instance.save()


# ---- Group endpoints ----

class GroupListCreate(generics.ListCreateAPIView):
    queryset = Group.objects.annotate(user_count=Count('user')).prefetch_related('permissions')
    serializer_class = GroupSerializer
    permission_classes = [IsSuperUser]


class GroupDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Group.objects.annotate(user_count=Count('user')).prefetch_related('permissions')
    serializer_class = GroupSerializer
    permission_classes = [IsSuperUser]


# ---- Permission list ----

EXCLUDED_APP_LABELS = {'contenttypes', 'sessions', 'admin', 'token_blacklist'}


class PermissionListView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        perms = Permission.objects.select_related('content_type').exclude(
            content_type__app_label__in=EXCLUDED_APP_LABELS,
        ).order_by('content_type__app_label', 'content_type__model', 'codename')
        serializer = PermissionSerializer(perms, many=True)
        return Response(serializer.data)
