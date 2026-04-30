from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0018_staylog_occupant_counts'),
    ]

    operations = [
        migrations.CreateModel(
            name='StayVehicle',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('vehicle_number', models.CharField(max_length=20)),
                ('stay', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='vehicles', to='management.roomstaylogs')),
            ],
        ),
    ]
