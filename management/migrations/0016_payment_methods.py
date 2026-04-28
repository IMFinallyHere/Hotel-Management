import django.db.models.deletion
from django.db import migrations, models


SEED_METHODS = [
    ('Cash', 'cash'),
    ('UPI', 'upi'),
    ('Card', 'card'),
    ('Other', 'other'),
]


def seed_payment_methods(apps, schema_editor):
    PaymentMethod = apps.get_model('management', 'PaymentMethod')
    for name, _ in SEED_METHODS:
        PaymentMethod.objects.get_or_create(name=name)


def map_old_to_fk(apps, schema_editor):
    PaymentMethod = apps.get_model('management', 'PaymentMethod')
    Payment = apps.get_model('management', 'Payment')
    Expense = apps.get_model('management', 'Expense')
    Reservation = apps.get_model('management', 'Reservation')

    pm_map = {}
    for name, code in SEED_METHODS:
        obj = PaymentMethod.objects.get(name=name)
        pm_map[code] = obj

    fallback = pm_map['other']

    for p in Payment.objects.filter(payment_method_new__isnull=True):
        p.payment_method_new = pm_map.get(p.payment_type_old, fallback)
        p.save(update_fields=['payment_method_new'])

    for e in Expense.objects.filter(payment_method_new__isnull=True):
        e.payment_method_new = pm_map.get(e.payment_type_old, fallback)
        e.save(update_fields=['payment_method_new'])

    for r in Reservation.objects.all():
        old = r.advance_payment_type_old
        if old:
            r.advance_payment_method_new = pm_map.get(old, fallback)
            r.save(update_fields=['advance_payment_method_new'])


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0015_add_checked_in_by_to_staylog'),
    ]

    operations = [
        # 1. Create PaymentMethod table
        migrations.CreateModel(
            name='PaymentMethod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=50, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_on', models.DateTimeField(auto_now_add=True)),
            ],
        ),

        # 2. Seed default methods
        migrations.RunPython(seed_payment_methods, migrations.RunPython.noop),

        # 3. Add nullable transition FK columns
        migrations.AddField(
            model_name='payment',
            name='payment_method_new',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT,
                                    related_name='+', to='management.paymentmethod'),
        ),
        migrations.AddField(
            model_name='expense',
            name='payment_method_new',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT,
                                    related_name='+', to='management.paymentmethod'),
        ),
        migrations.AddField(
            model_name='reservation',
            name='advance_payment_method_new',
            field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='+', to='management.paymentmethod'),
        ),

        # Temporarily rename old string fields so RunPython can read them
        migrations.RenameField('payment', 'payment_type', 'payment_type_old'),
        migrations.RenameField('expense', 'payment_type', 'payment_type_old'),
        migrations.RenameField('reservation', 'advance_payment_type', 'advance_payment_type_old'),

        # 4. Data migration
        migrations.RunPython(map_old_to_fk, migrations.RunPython.noop),

        # 5. Remove old string columns
        migrations.RemoveField('payment', 'payment_type_old'),
        migrations.RemoveField('expense', 'payment_type_old'),
        migrations.RemoveField('reservation', 'advance_payment_type_old'),

        # 6. Rename new FK columns to final names
        migrations.RenameField('payment', 'payment_method_new', 'payment_method'),
        migrations.RenameField('expense', 'payment_method_new', 'payment_method'),
        migrations.RenameField('reservation', 'advance_payment_method_new', 'advance_payment_method'),

        # 7. Make Payment/Expense FK non-nullable
        migrations.AlterField(
            model_name='payment',
            name='payment_method',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                                    related_name='payments', to='management.paymentmethod'),
        ),
        migrations.AlterField(
            model_name='expense',
            name='payment_method',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                                    related_name='expenses', to='management.paymentmethod'),
        ),
        migrations.AlterField(
            model_name='reservation',
            name='advance_payment_method',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='reservations', to='management.paymentmethod'),
        ),
    ]
