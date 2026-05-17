---
name: rust-development
description: Rust language expertise for writing safe, performant, production-quality Rust code. Primary language for the Loom project. Use for Rust development, ownership patterns, error handling, async/await, cargo management, CLI tools, and serialization.
---


## Cargo and Project Structure

```toml
# Cargo.toml
[package]
name = "myproject"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"

[dependencies]
tokio = { version = "1.35", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
thiserror = "1.0"
anyhow = "1.0"

[dev-dependencies]
criterion = "0.5"
mockall = "0.12"

[features]
default = []
full = ["feature-a", "feature-b"]
feature-a = []
feature-b = ["dep:optional-dep"]

[[bench]]
name = "my_benchmark"
harness = false
```

## Workspace Structure

```text
myworkspace/
├── Cargo.toml          # Workspace root
├── crates/
│   ├── core/
│   │   ├── Cargo.toml
│   │   └── src/
│   ├── api/
│   │   ├── Cargo.toml
│   │   └── src/
│   └── cli/
│       ├── Cargo.toml
│       └── src/
```


## Key Concepts

### Ownership, Borrowing, and Lifetimes

```rust
// Ownership rules:
// 1. Each value has exactly one owner
// 2. When the owner goes out of scope, the value is dropped
// 3. Ownership can be transferred (moved) or borrowed

// Move semantics
fn take_ownership(s: String) {
    println!("{}", s);
} // s is dropped here

fn main() {
    let s = String::from("hello");
    take_ownership(s);
    // s is no longer valid here
}

// Borrowing (references)
fn borrow(s: &String) {
    println!("{}", s);
}

fn borrow_mut(s: &mut String) {
    s.push_str(" world");
}

// Lifetimes ensure references are valid
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// Struct with lifetime annotations
struct Parser<'a> {
    input: &'a str,
    position: usize,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Self {
        Parser { input, position: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.input[self.position..].chars().next()
    }
}

// Common lifetime elision patterns
impl Config {
    // fn get(&self, key: &str) -> Option<&str>
    // is short for:
    // fn get<'a, 'b>(&'a self, key: &'b str) -> Option<&'a str>
    fn get(&self, key: &str) -> Option<&str> {
        self.map.get(key).map(|s| s.as_str())
    }
}
```

### Error Handling

```rust
use std::error::Error;
use std::fmt;
use std::io;

// Using thiserror for custom errors
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),

    #[error("Parse error at line {line}: {message}")]
    Parse { line: usize, message: String },

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation failed: {0}")]
    Validation(String),
}

// Using anyhow for application code
use anyhow::{Context, Result, bail, ensure};

fn read_config(path: &str) -> Result<Config> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read config from {}", path))?;

    let config: Config = serde_json::from_str(&content)
        .context("Failed to parse config JSON")?;

    ensure!(!config.name.is_empty(), "Config name cannot be empty");

    if config.port == 0 {
        bail!("Invalid port number");
    }

    Ok(config)
}

// The ? operator for propagating errors
fn process_file(path: &str) -> Result<Vec<Record>, AppError> {
    let content = std::fs::read_to_string(path)?; // io::Error -> AppError via From
    let records = parse_records(&content)?;
    Ok(records)
}

// Option handling
fn find_user(users: &[User], name: &str) -> Option<&User> {
    users.iter().find(|u| u.name == name)
}

fn get_user_email(users: &[User], name: &str) -> Option<String> {
    users
        .iter()
        .find(|u| u.name == name)
        .and_then(|u| u.email.clone())
}

// Converting between Option and Result
fn require_user(users: &[User], name: &str) -> Result<&User, AppError> {
    users
        .iter()
        .find(|u| u.name == name)
        .ok_or_else(|| AppError::NotFound(format!("User: {}", name)))
}
```

### Traits and Generics

```rust
// Defining traits
trait Repository<T> {
    fn get(&self, id: &str) -> Option<&T>;
    fn save(&mut self, item: T) -> Result<(), Box<dyn Error>>;

    // Default implementation
    fn exists(&self, id: &str) -> bool {
        self.get(id).is_some()
    }
}

// Trait bounds
fn process<T: Clone + Debug>(item: &T) {
    let cloned = item.clone();
    println!("{:?}", cloned);
}

// where clauses for complex bounds
fn merge<T, U, V>(a: T, b: U) -> V
where
    T: IntoIterator<Item = V>,
    U: IntoIterator<Item = V>,
    V: Ord + Clone,
{
    let mut result: Vec<V> = a.into_iter().chain(b.into_iter()).collect();
    result.sort();
    result.dedup();
    result.into_iter().next().unwrap()
}

// Associated types
trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
}

// Implementing traits
struct InMemoryRepo<T> {
    items: HashMap<String, T>,
}

impl<T: Clone> Repository<T> for InMemoryRepo<T> {
    fn get(&self, id: &str) -> Option<&T> {
        self.items.get(id)
    }

    fn save(&mut self, item: T) -> Result<(), Box<dyn Error>> {
        // Implementation
        Ok(())
    }
}

// Blanket implementations
impl<T: Display> ToString for T {
    fn to_string(&self) -> String {
        format!("{}", self)
    }
}
```

### Iterators

```rust
// Iterator combinators
fn process_users(users: Vec<User>) -> Vec<String> {
    users
        .into_iter()
        .filter(|u| u.active)
        .map(|u| u.email)
        .filter_map(|email| email)  // Remove None values
        .collect()
}

// Custom iterator
struct Counter {
    current: usize,
    max: usize,
}

impl Iterator for Counter {
    type Item = usize;

    fn next(&mut self) -> Option<Self::Item> {
        if self.current < self.max {
            let val = self.current;
            self.current += 1;
            Some(val)
        } else {
            None
        }
    }
}

// Useful iterator methods
fn examples(numbers: Vec<i32>) {
    // Fold/reduce
    let sum: i32 = numbers.iter().fold(0, |acc, x| acc + x);

    // Any/all
    let has_positive = numbers.iter().any(|&x| x > 0);
    let all_positive = numbers.iter().all(|&x| x > 0);

    // Find
    let first_even = numbers.iter().find(|&&x| x % 2 == 0);

    // Partition
    let (evens, odds): (Vec<_>, Vec<_>) = numbers.iter().partition(|&&x| x % 2 == 0);

    // Enumerate
    for (index, value) in numbers.iter().enumerate() {
        println!("{}: {}", index, value);
    }

    // Zip
    let other = vec![1, 2, 3];
    let pairs: Vec<_> = numbers.iter().zip(other.iter()).collect();
}
```

## Anti-Patterns

### Avoid These Practices

```rust
// BAD: Unnecessary clone
fn process(items: &Vec<String>) {
    for item in items.clone() {  // Unnecessary allocation
        println!("{}", item);
    }
}

// GOOD: Iterate by reference
fn process(items: &[String]) {
    for item in items {
        println!("{}", item);
    }
}

// BAD: Using unwrap/expect in library code
fn parse_config(s: &str) -> Config {
    serde_json::from_str(s).unwrap()  // Panics on invalid input
}

// GOOD: Return Result and let caller handle errors
fn parse_config(s: &str) -> Result<Config, serde_json::Error> {
    serde_json::from_str(s)
}

// BAD: Excessive use of Rc<RefCell<T>>
struct Node {
    value: i32,
    children: Vec<Rc<RefCell<Node>>>,
}

// GOOD: Consider arena allocation or indices
struct Arena {
    nodes: Vec<Node>,
}
struct Node {
    value: i32,
    children: Vec<usize>,  // Indices into arena
}

// BAD: String concatenation in loops
fn build_message(parts: &[&str]) -> String {
    let mut result = String::new();
    for part in parts {
        result = result + part + ", ";  // Creates new String each iteration
    }
    result
}

// GOOD: Use push_str or collect
fn build_message(parts: &[&str]) -> String {
    parts.join(", ")
}

// BAD: Boxing errors unnecessarily
fn parse(s: &str) -> Result<Data, Box<dyn Error>> {
    // For libraries, use concrete error types
}

// GOOD: Use concrete error types in libraries
fn parse(s: &str) -> Result<Data, ParseError> {
    // thiserror for library errors, anyhow for applications
}

// BAD: Unsafe without justification
unsafe fn get_unchecked(slice: &[i32], index: usize) -> i32 {
    *slice.get_unchecked(index)
}

// GOOD: Safe by default, unsafe with clear invariants
fn get_unchecked(slice: &[i32], index: usize) -> i32 {
    // SAFETY: Caller must ensure index < slice.len()
    // Only use when bounds checking is a proven bottleneck
    debug_assert!(index < slice.len());
    unsafe { *slice.get_unchecked(index) }
}

// BAD: Ignoring must_use
let _ = fs::remove_file("temp.txt");  // Error silently ignored

// GOOD: Handle the result
fs::remove_file("temp.txt").ok();  // Explicitly ignore
// or
fs::remove_file("temp.txt")?;  // Propagate error
```
