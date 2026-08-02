from django.db import migrations


def backfill_uncategorized(apps, schema_editor):
    ExpenseCategory = apps.get_model("management", "ExpenseCategory")
    Expense = apps.get_model("management", "Expense")

    uncategorized, _ = ExpenseCategory.objects.get_or_create(name="Uncategorized")
    Expense.objects.filter(category__isnull=True).update(category=uncategorized)


class Migration(migrations.Migration):

    dependencies = [
        ("management", "0037_expensecategory"),
    ]

    operations = [
        migrations.RunPython(backfill_uncategorized, migrations.RunPython.noop),
    ]
