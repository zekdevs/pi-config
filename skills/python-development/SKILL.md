---
name: python-development
description: Modern Python development and production best practices. Use for Python projects, APIs, data processing, or automation scripts.
---

# Python Development

## Project Setup

### Modern Python Project Structure
```
my-project/
├── src/
│   └── my_project/
│       ├── __init__.py
│       ├── main.py
│       └── utils.py
├── tests/
│   ├── __init__.py
│   └── test_main.py
├── pyproject.toml
├── README.md
├── venv/
└── .gitignore
```

## Environment

Tests and code should be ran from a venv, not from the global python install when working in projects. Most projects should have an existing venv at either `/venv` or `.venv`.

### Creating Virtual Environment

You may find it useful to create a venv for your work. You will need to remove the old one and create a new one based one the projects python version

```bash
uv venv                    # Creates .venv in current directory
uv venv --python 3.12      # Specify Python version
```

### Dependencies

For existing projects with a `pyproject.toml`, you can ensure dependencies are there like so

```bash
uv sync
```

For projects without a `pyproject.toml`, refer to the `requirements.txt` file(s) in the repo:

```bash
uv pip install -r requirements.txt
```

To add dependencies

```bash
uv add pytest              # Add pytest to project
uv add --with requests     # Temporary dependency for one invocation
```

### Running Code and Tools

```bash
uv run python script.py           # Run Python scripts
uv run pytest                     # Run pytest
uv run python -m pytest           # Alternative
uv run example-cli                # Run installed CLI tools
```

More traditional setups may require you to run things from inside the venv:

```bash
uv sync
source .venv/bin/activate
pytest                     # Run directly after activation
python script.py
```

### New Projects

For brand new projects, always initialize using uv, default to python3.12 unless user specified

```bash
uv init --python <version>
uv init --python 3.12
```

## Type Hints

```python
from typing import TypeVar, Generic
from collections.abc import Sequence

T = TypeVar('T')

def process_items(items: Sequence[str]) -> list[str]:
    return [item.upper() for item in items]

class Repository(Generic[T]):
    def get(self, id: int) -> T | None: ...
    def save(self, item: T) -> T: ...
```

## Async Patterns

```python
import asyncio
from collections.abc import AsyncIterator

async def fetch_all(urls: list[str]) -> list[dict]:
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_one(session, url) for url in urls]
        return await asyncio.gather(*tasks)

async def stream_data() -> AsyncIterator[bytes]:
    async with aiofiles.open('large_file.txt', 'rb') as f:
        async for chunk in f:
            yield chunk
```

## Imports

Imports should usually be on separate lines:

```python
# Correct:
import os
import sys

# Correct:
from subprocess import Popen, PIPE

# Wrong:
import sys, os

# Wrong
from subprocess import Popen
from subprocess import PIPE
```

Imports are always put at the top of the file, just after any module comments and docstrings, and before module globals and constants.

Imports should be grouped in the following order, and there should be blank line between each group of imports:
  1. Standard library imports.
  2. Related third party imports.
  3. Local application/library specific imports.

Perfer absolute imports:

```python
import mypkg.sibling
from mypkg import sibling
from mypkg.sibling import example
```

Explicit relative imports are situationally ok, where using absolute imports would be unnecessarily verbose:

```python
from . import sibling
from .sibling import example
```

## Testing

Code should be devloped in a modular way, such that writing unit tests and mocks for the code is quite easy. This means that testing should always be kept in mind when writing code, and avoid patterns that are difficult to test.

## Names

- Package and Modules should be short all lowercase names.  Namespaces are awesome, use them e.g. break modules up into dirs & subdirs.
- Classes should follow the CapitalWords convention
- Function & variable names should be lowercase, with words separated by underscores as necessary to improve readability.


## Best Practices

- Use `ruff` for linting and formatting. Always follow pep8 style guidelines.
- Prefer `pathlib.Path` over `os.path`
- Use dataclasses or Pydantic for data structures
- Use `asyncio` for I/O-bound operations
- Use `contextlib.asynccontextmanager` for async resources
- Any API call or network action should have retries
- Avoid Global Configuration and State
- When doing data validation, make use of `pydantic`

## When in doubt:

- Beautiful is better than ugly.
- Explicit is better than implicit.
- Simple is better than complex.
- Complex is better than complicated.
- Flat is better than nested.
- Sparse is better than dense.
- Readability counts.
- Special cases aren't special enough to break the rules.
- Although practicality beats purity.
- Errors should never pass silently.
- Unless explicitly silenced.
- In the face of ambiguity, refuse the temptation to guess.
- There should be one-- and preferably only one --obvious way to do it.
- Although that way may not be obvious at first unless you're Dutch.
- Now is better than never.
- Although never is often better than *right* now.
- If the implementation is hard to explain, it's a bad idea.
- If the implementation is easy to explain, it may be a good idea.
- Namespaces are one honking great idea -- let's do more of those!
