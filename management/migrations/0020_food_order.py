from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
import management.models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0019_stay_vehicle'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='FoodOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('description', models.CharField(max_length=200)),
                ('amount', models.DecimalField(max_digits=8, decimal_places=0)),
                ('is_paid', models.BooleanField(default=False)),
                ('ordered_at', models.DateTimeField(auto_now_add=True)),
                ('stay_log', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='food_orders', to='management.roomstaylogs')),
                ('payment_method', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='food_payments', to='management.paymentmethod')),
                ('paid_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='food_orders_paid', to=settings.AUTH_USER_MODEL)),
                ('ordered_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='food_orders_taken', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='FoodOrderReceipt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(
                    upload_to='food_receipts/',
                    validators=[
                        django.core.validators.FileExtensionValidator(allowed_extensions=['pdf', 'jpeg', 'jpg', 'png']),
                        management.models.validate_file_size,
                    ],
                )),
                ('uploaded_on', models.DateTimeField(auto_now_add=True)),
                ('food_order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='receipts', to='management.foodorder')),
            ],
        ),
    ]
