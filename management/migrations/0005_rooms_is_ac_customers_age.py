from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0004_roomstaylogs_gst'),
    ]

    operations = [
        migrations.AddField(
            model_name='rooms',
            name='is_ac',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='customers',
            name='number',
            field=models.CharField(blank=True, max_length=10, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='customers',
            name='age',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
