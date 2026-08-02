import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("management", "0036_roomstaylogs_actual_check_in"),
    ]

    operations = [
        migrations.CreateModel(
            name="ExpenseCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=50, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_on", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddField(
            model_name="expense",
            name="category",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="expenses",
                to="management.expensecategory",
            ),
        ),
        migrations.AlterField(
            model_name="expense",
            name="description",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
    ]
