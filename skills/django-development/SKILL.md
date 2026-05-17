---
name: django-development
description: Django framework workflow guidelines. Activate when working with Django projects, manage.py, django-admin, or Django-specific patterns.
---

# Django Workflow

## Django 5.x Features

### Composite Primary Keys (Django 5.2+)

Django 5.2 introduces native composite primary key support. You SHOULD use `CompositePrimaryKey` for junction tables and legacy database integration:

```python
from django.db import models

class OrderItem(models.Model):
    order = models.ForeignKey("Order", on_delete=models.CASCADE)
    product = models.ForeignKey("Product", on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.CompositePrimaryKey("order", "product"),
        ]
```

### Async Views

You SHOULD prefer async views for I/O-bound operations. Django 5.x has improved async ORM support:

```python
from django.http import JsonResponse

async def fetch_items(request):
    items = [item async for item in Item.objects.filter(active=True)]
    return JsonResponse({"items": [i.name for i in items]})
```

Key async patterns:
- Use `async for` with QuerySets
- Use `await` with `aget()`, `afirst()`, `acount()`, `aexists()`
- Sync ORM calls in async views trigger `SynchronousOnlyOperation` exceptions

### Django Tasks (Background Tasks)

For simple background tasks, you MAY use Django's built-in task system (Django 5.1+):

```python
from django.tasks import task

@task
def send_welcome_email(user_id: int) -> None:
    user = User.objects.get(pk=user_id)
    # Send email logic
```

For complex workflows, Celery remains RECOMMENDED.

---

## Architecture Patterns

### Fat Models to Services Pattern

Business logic MUST NOT reside in views. You MUST use the services pattern:

```python
# services/order_service.py
from dataclasses import dataclass
from decimal import Decimal
from django.db import transaction

@dataclass
class OrderService:
    """Order-related business operations."""

    @staticmethod
    @transaction.atomic
    def create_order(user, cart_items: list) -> "Order":
        """Create order from cart items with inventory validation."""
        order = Order.objects.create(user=user, status=Order.Status.PENDING)

        for item in cart_items:
            if item.product.stock < item.quantity:
                raise InsufficientStockError(item.product)

            OrderItem.objects.create(
                order=order,
                product=item.product,
                quantity=item.quantity,
                price=item.product.price,
            )
            item.product.stock -= item.quantity
            item.product.save(update_fields=["stock"])

        return order

    @staticmethod
    def calculate_total(order: "Order") -> Decimal:
        """Calculate order total with discounts applied."""
        return sum(item.subtotal for item in order.items.all())
```

### Selectors Pattern

Query logic MUST be encapsulated in selectors. Views MUST NOT contain complex querysets:

```python
# selectors/product_selectors.py
from django.db.models import QuerySet, Q, Prefetch

class ProductSelectors:
    """Product query encapsulation."""

    @staticmethod
    def get_active_products() -> QuerySet:
        return Product.objects.filter(
            is_active=True,
            stock__gt=0,
        ).select_related("category")

    @staticmethod
    def search_products(query: str) -> QuerySet:
        return Product.objects.filter(
            Q(name__icontains=query) | Q(description__icontains=query),
            is_active=True,
        )

    @staticmethod
    def get_product_with_reviews(product_id: int) -> Product:
        return Product.objects.prefetch_related(
            Prefetch(
                "reviews",
                queryset=Review.objects.filter(approved=True).order_by("-created_at"),
            )
        ).get(pk=product_id)
```

---

## Views

### Class-Based vs Function-Based Views

You SHOULD use CBVs for standard CRUD operations and FBVs for simple, one-off logic:

**Use CBVs when:**
- Standard CRUD operations
- Pagination, filtering, or sorting needed
- Template rendering with context
- Code reuse via mixins

**Use FBVs when:**
- Simple API endpoints
- Webhooks or callbacks
- Complex conditional logic that doesn't fit CBV flow

### CBV Example

```python
from django.views.generic import ListView, DetailView
from django.contrib.auth.mixins import LoginRequiredMixin

class ProductListView(ListView):
    model = Product
    template_name = "products/list.html"
    context_object_name = "products"
    paginate_by = 20

    def get_queryset(self):
        return ProductSelectors.get_active_products()

class ProductDetailView(DetailView):
    model = Product
    template_name = "products/detail.html"
    slug_url_kwarg = "slug"

    def get_object(self):
        return ProductSelectors.get_product_with_reviews(self.kwargs["slug"])
```

---

---

## Testing

### Test Organization

```python
# tests/test_services/test_order_service.py
import pytest
from decimal import Decimal
from apps.orders.services import OrderService

@pytest.mark.django_db
class TestOrderService:
    def test_create_order_success(self, user, cart_with_items):
        order = OrderService.create_order(user, cart_with_items)

        assert order.user == user
        assert order.items.count() == len(cart_with_items)

    def test_create_order_insufficient_stock(self, user, cart_with_unavailable_item):
        with pytest.raises(InsufficientStockError):
            OrderService.create_order(user, cart_with_unavailable_item)
```

### Fixtures

```python
# conftest.py
import pytest
from django.contrib.auth import get_user_model

@pytest.fixture
def user(db):
    User = get_user_model()
    return User.objects.create_user(
        email="test@example.com",
        password="testpass123",
    )

@pytest.fixture
def product(db, category):
    return Product.objects.create(
        name="Test Product",
        slug="test-product",
        category=category,
        price=Decimal("29.99"),
        stock=10,
    )
```

---
