from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0020_food_order'),
    ]

    operations = [
        migrations.AddField(
            model_name='foodorder',
            name='food_gst_inclusive',
            field=models.BooleanField(default=True),
        ),
    ]
