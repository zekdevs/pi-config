---
name: php-development
description: Modern PHP programming skill - master PHP 8.x syntax, OOP, type system, and Composer
---

This skill provides comprehensive training in modern PHP development, from basic syntax to advanced PHP 8.4 features.

## Code Examples

### Beginner: Basic Syntax
```php
<?php
declare(strict_types=1);

// Variables and types
$name = 'PHP Developer';
$version = 8.3;

// Match expression (PHP 8.0+)
$status = match($code) {
    200 => 'OK',
    404 => 'Not Found',
    default => 'Unknown',
};
```

### Intermediate: OOP Patterns
```php
<?php
declare(strict_types=1);

// Constructor property promotion (PHP 8.0+)
final readonly class User
{
    public function __construct(
        public int $id,
        public string $email,
        public string $name,
    ) {}
}
```

### Advanced: PHP 8.4 Features
```php
<?php
declare(strict_types=1);

// Property hooks (PHP 8.4+)
class Temperature
{
    public float $celsius {
        get => $this->celsius;
        set => $value >= -273.15 ? $value : throw new \InvalidArgumentException();
    }

    public float $fahrenheit {
        get => $this->celsius * 9/5 + 32;
        set => $this->celsius = ($value - 32) * 5/9;
    }
}
```

## Troubleshooting

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Type errors | Strict types + wrong type | Check function signature, cast values |
| Autoloading failures | PSR-4 mismatch | Verify namespace, run composer dump-autoload |
| Deprecated features | Old PHP patterns | Update to modern syntax |

## Quality Metrics

| Metric | Target |
|--------|--------|
| Code example accuracy | 100% |
| PHP version correctness | 100% |
| PSR-12 compliance | 100% |
