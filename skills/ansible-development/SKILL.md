---
name: ansible-development
description: Ansible automation workflow guidelines. Activate when working with Ansible playbooks, ansible-playbook, inventory files (.yml, .ini), or Ansible-specific patterns.
---

# Ansible Workflow

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint | ansible-lint | `ansible-lint` |
| YAML lint | yamllint | `yamllint .` |
| Syntax check | ansible | `ansible-playbook --syntax-check` |
| Dry run | ansible | `ansible-playbook --check` |

## Code Standards

### FQCN Requirement

All module names MUST use Fully Qualified Collection Names (FQCN):

```yaml
# CORRECT
- name: Copy configuration file
  ansible.builtin.copy:
    src: app.conf
    dest: /etc/app/app.conf

# INCORRECT - DO NOT USE
- name: Copy configuration file
  copy:
    src: app.conf
    dest: /etc/app/app.conf
```

### Linting

All changes should pass linting:

```bash
# Run both linters
ansible-lint && yamllint .
```

## Project Structure


### group_vars Organization

group_vars is organized by common sets of applications:

```
group_vars/
├── all.yml          # Common variables
├── nginx.yml        # Common nginx hosts
├── cxo.yml          # Hosts at the cxo datacenter
└── jenkins.yml      # Common Jenkins variables
```

### host_vars Organization

host_vars contain variables that are specific to hosts, and have the potential to change/need to be easily modified.

### Role Structure

Roles SHOULD be single-purpose:

```
roles/
├── nginx/                # Web server only
├── base/                 # Basic linux system setups only
├── docker/               # Docker setup only
└── grafana/              # Grafana deployment only
```

## Handler Patterns

### Proper Handler Usage

```yaml
# tasks/main.yml
- name: Update nginx configuration
  ansible.builtin.template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  notify: Restart nginx

- name: Update SSL certificate
  ansible.builtin.copy:
    src: "{{ ssl_cert_file }}"
    dest: /etc/nginx/ssl/cert.pem
  notify:
    - Validate nginx config
    - Reload nginx

# handlers/main.yml
- name: Validate nginx config
  ansible.builtin.command: nginx -t
  changed_when: false

- name: Reload nginx
  ansible.builtin.systemd:
    name: nginx
    state: reloaded

- name: Restart nginx
  ansible.builtin.systemd:
    name: nginx
    state: restarted
```

### Handler Execution Order

Handlers execute in definition order, not notification order. Define handlers in logical sequence (validate -> reload -> restart).

## Variable Precedence

Ansible variable precedence (highest to lowest):

1. Extra vars (`-e "var=value"`)
2. Task vars (in task definition)
3. Block vars
4. Role and include vars
5. Set facts / registered vars
6. Play vars_files
7. Play vars
8. Host facts
9. Playbook host_vars
10. Inventory host_vars
11. Playbook group_vars
12. Inventory group_vars
13. Role defaults

### Best Practices

```yaml
# Use role defaults for safe defaults
# roles/nginx/defaults/main.yml
nginx_worker_processes: auto
nginx_worker_connections: 1024

# Use group_vars for environment-specific overrides
# group_vars/prod/nginx.yml
nginx_worker_connections: 4096

# Use extra vars for one-time overrides only
ansible-playbook playbook.yml -e "nginx_worker_connections=8192"
```

Avoid regex `~` and multi-line blocks unless they are absolutely needed. These are difficult for a human to understand.

DO NOT do this:
```yaml
    volumes:
      - >
      {{ phab_host_fpm_socket_dir ~
         ':' ~
         (phab_container_fpm_socket_dir | string) ~
         ':' ~
         phab_volume_rw_suffix }}
```

Instead do this:
```yaml
"{{ phab_host_fpm_socket_dir }}:{{ phab_container_fpm_socket_dir }}{{ phab_volume_rw_suffix }}"
```


## Checklist

Any Ansible code tasks should have the following:

1. [ ] `ansible-lint` passes with no warnings
2. [ ] `yamllint .` passes
3. [ ] `ansible-playbook --syntax-check` passes
4. [ ] All modules use FQCN
