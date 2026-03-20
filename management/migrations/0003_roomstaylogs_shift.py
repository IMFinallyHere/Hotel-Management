from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0002_roomstaylogs_timing'),
    ]

    operations = [
        migrations.AddField(
            model_name='roomstaylogs',
            name='shifted_from',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='shift_destinations',
                to='management.rooms',
            ),
        ),
        migrations.AddField(
            model_name='roomstaylogs',
            name='shift_reason',
            field=models.TextField(blank=True, null=True),
        ),
    ]
