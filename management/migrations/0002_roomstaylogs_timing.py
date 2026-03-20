from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='roomstaylogs',
            name='expected_checkout',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='roomstaylogs',
            name='overtime_rate',
            field=models.DecimalField(blank=True, decimal_places=0, max_digits=7, null=True),
        ),
        migrations.AddField(
            model_name='roomstaylogs',
            name='grace_until',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='roomstaylogs',
            name='is_early_checkin',
            field=models.BooleanField(default=False),
        ),
    ]
