from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0016_payment_methods'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExpenseAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to='expense_attachments/')),
                ('uploaded_on', models.DateTimeField(auto_now_add=True)),
                ('expense', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='management.expense')),
            ],
        ),
    ]
