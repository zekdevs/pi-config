---
name: python-testing
description: Python-specific testing practices with pytest, fixtures, mocking, async testing, coverage configuration, and uv execution rules. Activate when working with pytest files, conftest.py, test directories, pyproject.toml testing configuration, or Python test-related tasks.
---

# Python Testing Practices

Python-specific testing patterns and best practices using pytest, complementing general testing-workflow skill.

## Executing Pytest

For projects that don't have a requirements.txt or requirements.dev.txt, perfer to use `uv`:

### Environment

You may find it useful to create a venv for your work. You will need to remove the old one and create a new one based one the projects python version

```bash
uv venv                    # Creates .venv in current directory
uv venv --python 3.12      # Specify Python version
```

#### Dependencies

For existing projects with a `pyproject.toml`, you can ensure dependencies are there like so

```bash
uv sync
```

For projects without a `pyproject.toml`, refer to the `requirements.txt` file(s) in the repo:

```bash
uv pip install -r requirements.txt
uv pip install -r requirements.dev.txt
```

#### To add dependencies

```bash
uv add pytest              # Add pytest to project
uv add --with requests     # Temporary dependency for one invocation
```

#### Running tests

```bash
uv run pytest                     # uv projects
uv run -m pytest -v               # Non-uv projects
```

---

## Pytest Fixtures

### Fixture Scopes

Pytest fixtures support different scopes for setup/teardown control:

```python
@pytest.fixture(scope="session")
def database_connection():
    """Created once per test session - expensive setup."""
    connection = setup_expensive_database()
    yield connection
    connection.cleanup()


@pytest.fixture(scope="module")
def api_client():
    """Created once per test module."""
    return APIClient(config="test")


@pytest.fixture(scope="class")
def service_instance():
    """Created once per test class."""
    return Service()


@pytest.fixture(scope="function")  # Default
def user():
    """Created for each test function - isolated."""
    return User(email="test@example.com")
```

### Fixture Setup and Teardown

Use `yield` pattern for setup/teardown with proper cleanup:

```python
@pytest.fixture
def database():
    """Fixture with setup and teardown."""
    # Setup
    db = Database(":memory:")
    db.initialize()
    db.create_schema()

    # Provide to test
    yield db

    # Teardown
    db.close()


@pytest.fixture
def mock_file(tmp_path):
    """Create temporary file that auto-cleans up."""
    temp_file = tmp_path / "test.txt"
    temp_file.write_text("test data")
    yield temp_file
    # Cleanup automatic with tmp_path
```

### Fixture Dependency Injection

Fixtures can depend on other fixtures:

```python
@pytest.fixture
def database():
    """Base database fixture."""
    db = Database(":memory:")
    db.initialize()
    yield db
    db.close()


@pytest.fixture
def user_service(database):
    """Service depending on database fixture."""
    return UserService(database)


@pytest.fixture
def authenticated_user(user_service):
    """User depending on service fixture."""
    user = user_service.create_user(
        username="testuser",
        email="test@example.com",
        password="secure"
    )
    yield user
    user_service.delete_user(user.id)
```

---

## conftest.py Patterns

### Central Fixture Location

Place shared fixtures in `conftest.py` at appropriate levels:

```
tests/
├── conftest.py              # Session/module level fixtures
├── unit/
│   ├── conftest.py          # Unit-specific fixtures
│   └── test_*.py
└── integration/
    ├── conftest.py          # Integration-specific fixtures
    └── test_*.py
```

### Example conftest.py

```python
# tests/conftest.py
import pytest
from app.services import UserService
from app.database import Database


@pytest.fixture(scope="session")
def database_connection():
    """Database connection for entire session."""
    db = Database(":memory:")
    db.initialize()
    db.run_migrations()
    yield db
    db.close()


@pytest.fixture
def user_service(database_connection):
    """UserService with test database."""
    return UserService(database_connection)


@pytest.fixture
def sample_user_data():
    """Standard user data for tests."""
    return {
        "username": "testuser",
        "email": "test@example.com",
        "password": "secure123",
        "age": 25
    }


@pytest.fixture
def temp_config_file(tmp_path):
    """Create temporary config file."""
    config_file = tmp_path / "config.json"
    config_file.write_text('{"setting": "value"}')
    return config_file
```

---

## Parametrized Testing

### Basic Parametrization

Use `@pytest.mark.parametrize` for multiple test inputs:

```python
import pytest


@pytest.mark.parametrize("input,expected", [
    ("hello", "HELLO"),
    ("world", "WORLD"),
    ("", ""),
    ("MiXeD", "MIXED"),
])
def test_uppercase(input, expected):
    """Test uppercase conversion with multiple inputs."""
    assert input.upper() == expected
```

### Multiple Parameters

```python
@pytest.mark.parametrize("method,expected_status", [
    ("GET", 200),
    ("POST", 201),
    ("PUT", 200),
    ("DELETE", 204),
])
def test_http_methods(client, method, expected_status):
    """Test different HTTP methods."""
    response = client.request(method, "/api/resource")
    assert response.status_code == expected_status
```

### Parametrized Fixtures

```python
@pytest.mark.parametrize("user_role", ["admin", "user", "guest"])
def test_permission_levels(user_role):
    """Test different user permission levels."""
    user = User(role=user_role)
    assert user.can_access_dashboard() == (user_role in ["admin", "user"])
```

---

## Async Testing

### Marking Async Tests

Use `@pytest.mark.asyncio` decorator:

```python
import pytest


@pytest.mark.asyncio
async def test_async_fetch_data():
    """Test async data fetching."""
    result = await fetch_data_async("user123")
    assert result is not None
    assert result["id"] == "user123"


@pytest.mark.asyncio
async def test_concurrent_requests():
    """Test multiple concurrent async operations."""
    results = await asyncio.gather(
        fetch_user(1),
        fetch_user(2),
        fetch_user(3),
    )
    assert len(results) == 3
```

### Async Fixtures

```python
@pytest.fixture
async def async_client():
    """Async HTTP client fixture."""
    client = AsyncHTTPClient()
    await client.connect()
    yield client
    await client.disconnect()


@pytest.mark.asyncio
async def test_api_call(async_client):
    """Test with async fixture."""
    response = await async_client.get("/api/users")
    assert response.status_code == 200
```

---

## Mocking Patterns

- Make use of the `pytest-mock` libary over builtin mocks.
- You can mock a constant
- You can mock any object that has attributes/properties.
- You can mock any function because a function is still just an object, the attribute in this case is it's return value.
- Mock where the object is imported into *not* where the object is imported from.
- Make sure the mocks happen *before* the method call, not after.
- They are the preferred method for testing context managers.


### Mock Objects and Patching

```python
import pytest


def test_send_email_success(mocker):
    """Test email sending with mocked SMTP."""
    mock_smtp = mocker.Mock()
    mocker.patch("smtplib.SMTP", return_value=mock_smtp)

    result = send_email("test@example.com", "Subject", "Body")

    mock_smtp.send_message.assert_called_once()
    assert result is True


def test_api_call_with_mock(mocker):
    """Test API call with mocked response."""
    mock_get = mocker.patch("requests.get")
    mock_get.return_value.json.return_value = {"status": "ok"}

    result = fetch_api_data()

    mock_get.assert_called_once_with("https://api.example.com/data")
    assert result["status"] == "ok"
```

### Fixture-Based Mocking

```python
@pytest.fixture
def mock_database(mocker):
    """Provide mocked database."""
    mock_db = mocker.patch("app.database.Database")
    mock_db.return_value.query.return_value = {"id": 1, "name": "Test"}
    return mock_db


def test_user_service_with_mock(mock_database):
    """Test service with mocked database dependency."""
    service = UserService(mock_database.return_value)
    user = service.get_user(1)
    assert user["name"] == "Test"


@pytest.fixture
def mock_api_client(mocker):
    """Provide mocked API client."""
    mock = mocker.patch("app.client.APIClient")
    mock.return_value.get.return_value = {"status": "ok"}
    mock.return_value.post.return_value = {"id": 123}
    return mock
```

### Spy on Real Objects

```python
def test_spy_on_method(mocker):
    """Spy on actual method calls."""
    obj = RealObject()
    spy = mocker.spy(obj, "method")

    result = obj.method("arg1")

    spy.assert_called_once_with("arg1")
    assert result == expected_value
```

---

## Exception Testing

### Testing with Context Managers

```python
import pytest
from app.exceptions import UserNotFoundError, ValidationError


def test_exception_raised():
    """Test that correct exception is raised."""
    with pytest.raises(UserNotFoundError) as exc_info:
        user_service.get_user("nonexistent_id")

    assert "nonexistent_id" in str(exc_info.value)


def test_validation_error():
    """Test validation error with message check."""
    user_data = {
        "username": "testuser",
        "email": "invalid-email",  # Invalid format
        "age": 25
    }

    with pytest.raises(ValidationError) as exc_info:
        user_service.create_user(user_data)

    assert "email" in str(exc_info.value)


def test_exception_type_matching():
    """Test matching specific exception type."""
    with pytest.raises((ValueError, TypeError)):
        process_data(None)
```

---

## Common Testing Patterns

### Arrange-Act-Assert

```python
def test_create_user_success(user_service):
    """Test successful user creation."""
    # Arrange - Set up test data
    user_data = {
        "username": "testuser",
        "email": "test@example.com",
        "age": 25
    }

    # Act - Execute functionality
    user = user_service.create_user(user_data)

    # Assert - Verify results
    assert user is not None
    assert user.username == "testuser"
    assert user.email == "test@example.com"
    assert user.age == 25
```

### Database Integration

```python
@pytest.fixture(scope="module")
def test_database():
    """Provide test database for integration tests."""
    db = Database("test.db")
    db.migrate()
    yield db
    db.close()


def test_user_repository_integration(test_database):
    """Test user repository with real database."""
    repo = UserRepository(test_database)

    # Create
    user = repo.create(username="testuser", email="test@example.com")
    assert user.id is not None

    # Retrieve
    retrieved = repo.get(user.id)
    assert retrieved.username == "testuser"

    # Update
    retrieved.email = "updated@example.com"
    repo.update(retrieved)

    # Verify
    updated = repo.get(user.id)
    assert updated.email == "updated@example.com"
```

---

## Edge Case Testing

### Common Edge Cases

```python
def test_edge_cases():
    """Test edge cases comprehensively."""
    calculator = Calculator()

    # Empty input
    assert calculator.sum([]) == 0

    # Single item
    assert calculator.sum([5]) == 5

    # Negative numbers
    assert calculator.sum([-1, -2, -3]) == -6

    # Mixed positive/negative
    assert calculator.sum([10, -5, 3]) == 8

    # Large numbers
    assert calculator.sum([10**10, 10**10]) == 2 * 10**10

    # Zero
    assert calculator.sum([0, 0, 0]) == 0
```

### None Value Handling

```python
def test_none_handling(service):
    """Test handling of None values."""
    # None input raises error
    with pytest.raises(ValueError):
        service.process(None)

    # None in list gets filtered
    result = service.process_list([1, None, 3])
    assert result == [1, 3]
```
