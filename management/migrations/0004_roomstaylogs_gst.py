from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0003_roomstaylogs_shift'),
    ]

    operations = [
        migrations.AddField(
            model_name='roomstaylogs',
            name='gst_applied',
            field=models.BooleanField(default=False),
        ),
    ]
