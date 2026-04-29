from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0017_expense_attachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='roomstaylogs',
            name='male_count',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='roomstaylogs',
            name='female_count',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='roomstaylogs',
            name='child_count',
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
