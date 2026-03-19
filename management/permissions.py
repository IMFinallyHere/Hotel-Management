from rest_framework.permissions import BasePermission


def report_permission(codename):
    class _Perm(BasePermission):
        def has_permission(self, request, view):
            return request.user.is_authenticated and request.user.has_perm(f'management.{codename}')
    _Perm.__name__ = f'ReportPerm_{codename}'
    return _Perm


class HasModelPermission(BasePermission):
    """
    Maps HTTP methods to Django's built-in model permissions.
    Use the class method `for_model(app_label, model_name)` to create
    a permission class bound to a specific model.
    """
    METHOD_ACTION_MAP = {
        'GET': 'view',
        'HEAD': 'view',
        'OPTIONS': 'view',
        'POST': 'add',
        'PUT': 'change',
        'PATCH': 'change',
        'DELETE': 'delete',
    }

    app_label = None
    model_name = None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        action = self.METHOD_ACTION_MAP.get(request.method)
        if action is None:
            return False
        perm = f'{self.app_label}.{action}_{self.model_name}'
        return request.user.has_perm(perm)

    @classmethod
    def for_model(cls, app_label, model_name):
        return type(
            f'HasModelPermission_{app_label}_{model_name}',
            (cls,),
            {'app_label': app_label, 'model_name': model_name},
        )
