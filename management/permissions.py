from rest_framework.permissions import BasePermission


def report_permission(codename):
    class _Perm(BasePermission):
        def has_permission(self, request, view):
            return request.user.is_authenticated and request.user.has_perm(f'management.{codename}')
    _Perm.__name__ = f'ReportPerm_{codename}'
    return _Perm
