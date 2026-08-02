import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("management", "0038_backfill_expense_category"),
    ]

    operations = [
        migrations.AlterField(
            model_name="expense",
            name="category",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="expenses",
                to="management.expensecategory",
            ),
        ),
    ]
