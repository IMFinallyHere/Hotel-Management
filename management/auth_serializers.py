from django.contrib.auth.models import User, Group, Permission
from rest_framework import serializers


class PermissionSerializer(serializers.ModelSerializer):
    app_label = serializers.CharField(source='content_type.app_label', read_only=True)
    model = serializers.CharField(source='content_type.model', read_only=True)

    class Meta:
        model = Permission
        fields = ['id', 'codename', 'name', 'app_label', 'model']


class GroupSimpleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name']


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    groups = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Group.objects.all(), required=False,
    )
    groups_detail = GroupSimpleSerializer(source='groups', many=True, read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'is_active', 'is_staff', 'is_superuser',
            'groups', 'groups_detail', 'date_joined', 'password',
        ]

    def create(self, validated_data):
        groups = validated_data.pop('groups', [])
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        if groups:
            user.groups.set(groups)
        return user

    def update(self, instance, validated_data):
        groups = validated_data.pop('groups', None)
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if groups is not None:
            instance.groups.set(groups)
        return instance


class GroupSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Permission.objects.all(), required=False,
    )
    user_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Group
        fields = ['id', 'name', 'permissions', 'user_count']

    def create(self, validated_data):
        permissions = validated_data.pop('permissions', [])
        group = Group.objects.create(**validated_data)
        if permissions:
            group.permissions.set(permissions)
        return group

    def update(self, instance, validated_data):
        permissions = validated_data.pop('permissions', None)
        instance.name = validated_data.get('name', instance.name)
        instance.save()
        if permissions is not None:
            instance.permissions.set(permissions)
        return instance
