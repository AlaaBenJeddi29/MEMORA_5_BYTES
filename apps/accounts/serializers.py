"""Serializers for the accounts app.

Scope: registration, email verification, login (with lockout), the
authenticated user's own profile, and permission-gated user management.

Security notes:
- Read serializers never include the password or privilege fields.
- ``RegisterSerializer`` cannot set privileges, forces the Member role, and
  creates an inactive account until the emailed token is used.
- ``AdminUserSerializer`` is only reachable through a permission check and
  never accepts or returns a password.
- Passwords run through Django's AUTH_PASSWORD_VALIDATORS (minimum length 10)
  and are hashed by ``User.objects.create_user``.
"""

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Read-only representation of a user (``/me/``, login and registration)."""

    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_display",
            "email_verified",
            "is_staff",
            "date_joined",
        ]
        read_only_fields = fields


class ProfileSerializer(serializers.ModelSerializer):
    """Fields the owner may edit on their own account."""

    class Meta:
        model = User
        fields = ["username", "email", "first_name", "last_name"]
        read_only_fields = ["username"]

    def validate_email(self, value):
        value = value.strip().lower()
        if not value:
            raise serializers.ValidationError("The email address is required.")
        duplicates = User.objects.filter(email__iexact=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("A user with that email already exists.")
        return value


class AdminUserSerializer(serializers.ModelSerializer):
    """Permission-gated editable user fields; never handles passwords."""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "is_staff",
            "email_verified",
            "date_joined",
        ]
        read_only_fields = ["id", "date_joined"]

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("The username is required.")
        duplicates = User.objects.filter(username__iexact=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("A user with that username already exists.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if not value:
            raise serializers.ValidationError("The email address is required.")
        duplicates = User.objects.filter(email__iexact=value)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("A user with that email already exists.")
        return value


class RegisterSerializer(serializers.ModelSerializer):
    """Validate registration and create an inactive, unverified Member."""

    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    password_confirm = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )

    class Meta:
        model = User
        fields = ["username", "email", "password", "password_confirm"]

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with that username already exists.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with that email already exists.")
        return value

    def validate(self, attrs):
        if attrs.get("password") != attrs.get("password_confirm"):
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        candidate = User(
            username=attrs.get("username", ""),
            email=attrs.get("email", ""),
        )
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        # create_user hashes the password and forces is_staff/is_superuser off.
        return User.objects.create_user(
            password=password,
            role=User.Role.MEMBER,
            is_active=False,
            email_verified=False,
            **validated_data,
        )


class LoginSerializer(serializers.Serializer):
    """Authenticate credentials, with per-account brute-force lockout."""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        username = attrs.get("username", "")
        password = attrs.get("password", "")

        # Accept either the username or the account email in the same field.
        user = User.objects.filter(username=username).first()
        if user is None:
            user = User.objects.filter(email__iexact=username).first()
        if user is not None:
            if user.is_locked:
                raise serializers.ValidationError(user.lockout_message())
            if not user.is_active:
                if not user.email_verified:
                    raise serializers.ValidationError(
                        "Verify your email address before signing in. "
                        "Check your inbox for the verification link."
                    )
                raise serializers.ValidationError(
                    "This account is deactivated. Contact an administrator."
                )

        authenticated = authenticate(
            request=self.context.get("request"),
            username=user.username if user is not None else username,
            password=password,
        )
        if authenticated is None:
            if user is not None and user.register_failed_login():
                raise serializers.ValidationError(user.lockout_message())
            raise serializers.ValidationError("Invalid username or password.")

        authenticated.reset_failed_logins()
        attrs["user"] = authenticated
        return attrs


class EmailAddressSerializer(serializers.Serializer):
    """Validated email used by the resend-verification endpoint."""

    email = serializers.EmailField()
