---
paths:
  - "terraform/**/*"
---

# Terraform / Infrastructure as Code Conventions

## Variables

- Use variables for all configurable values; never hardcode
- Every variable must have a `description` field
- Provide sensible `default` values where appropriate
- Use `type` constraints on all variables
- Group related variables in a dedicated `variables.tf` file

## Naming Convention

- Resources: `<project>-<environment>-<resource>` (e.g., `myapp-prod-vpc`)
- Variables: snake_case (e.g., `instance_type`, `vpc_cidr_block`)
- Outputs: snake_case, descriptive (e.g., `database_endpoint`, `load_balancer_dns`)
- Modules: kebab-case directory names (e.g., `modules/rds-cluster/`)

## Tagging

- All taggable resources must include these tags:
  - `Environment`: The deployment environment (dev, staging, prod)
  - `Team`: The owning team name
  - `ManagedBy`: "terraform"
  - `Project`: The project name
- Use a `locals` block for common tags to avoid repetition

## Locals

- Use `locals` for computed or derived values
- Use `locals` for common tags, naming prefixes, and repeated expressions
- Keep `locals` blocks in `locals.tf` or at the top of the main configuration

## Outputs

- Every module must output values that downstream modules or the root might need
- Add `description` to all outputs
- Use `sensitive = true` for outputs containing secrets

## State and Backend

- Always use remote state (S3 + DynamoDB for locking)
- Never commit `.tfstate` files
- Use separate state files per environment
- Enable state file encryption

## Modules

- Prefer small, focused modules (single responsibility)
- Pin module source versions
- Document module inputs and outputs in the module's README
- Use `terraform validate` and `terraform fmt` before committing

## Security

- Never hardcode credentials; use IAM roles or environment variables
- Encrypt all data at rest and in transit where supported
- Use least-privilege IAM policies
- Enable logging and monitoring on all resources
