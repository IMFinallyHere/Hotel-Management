from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0005_rooms_is_ac_customers_age'),
    ]

    operations = [
        migrations.AlterField(
            model_name='customers',
            name='country_code',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='management.countrycodes'),
        ),
        migrations.AlterField(
            model_name='customers',
            name='gender',
            field=models.CharField(blank=True, choices=[('male', 'MALE'), ('female', 'FEMALE'), ('trans', 'TRANS'), ('other', 'OTHER')], max_length=6, null=True),
        ),
        migrations.AlterField(
            model_name='customers',
            name='identity_card_1',
            field=models.FileField(blank=True, null=True, upload_to='', validators=[]),
        ),
        migrations.AlterField(
            model_name='customers',
            name='identity_card_2',
            field=models.FileField(blank=True, null=True, upload_to='', validators=[]),
        ),
        migrations.AlterField(
            model_name='customers',
            name='address',
            field=models.CharField(blank=True, max_length=300, null=True),
        ),
        migrations.AlterField(
            model_name='customers',
            name='pincode',
            field=models.CharField(blank=True, max_length=6, null=True),
        ),
    ]