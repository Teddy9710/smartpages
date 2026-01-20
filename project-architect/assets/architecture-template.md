# {Project Name} Architecture Documentation

**Generated:** {Date}
**Analyzed by:** Claude Code - Project Architect Skill

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [Dependencies](#dependencies)
7. [Key Patterns and Conventions](#key-patterns-and-conventions)
8. [Development Workflow](#development-workflow)

---

## Project Overview

{Brief description of the project's purpose and main functionality}

**Type:** {Web Application | CLI Tool | Library | API Service | Mobile App | Other}

**Primary Language:** {Main programming language(s)}

---

## Technology Stack

### Languages
- {Language 1}: {Usage}
- {Language 2}: {Usage}

### Frameworks & Libraries
- {Framework 1}: {Version} - {Purpose}
- {Framework 2}: {Version} - {Purpose}

### Tools & Build System
- Build Tool: {e.g., webpack, vite, gradle, maven}
- Package Manager: {e.g., npm, yarn, pip, cargo}
- Testing Framework: {e.g., jest, pytest, junit}

### Infrastructure
- Database: {e.g., PostgreSQL, MongoDB, SQLite}
- API/Communication: {e.g., REST, GraphQL, gRPC}
- Deployment: {e.g., Docker, Kubernetes, Serverless}

---

## Project Structure

```
{project-root}/
├── {directory1}/          # {Purpose}
│   ├── {subdir}/         # {Details}
│   └── {file}            # {Purpose}
├── {directory2}/          # {Purpose}
└── {file}                # {Purpose}
```

### Directory Breakdown

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `{dir1}` | {Description} | {files} |
| `{dir2}` | {Description} | {files} |

---

## Core Components

### {Component Name 1}
**Location:** `{path/to/component}`

**Purpose:** {What this component does}

**Key Modules/Classes:**
- `{Module/Class 1}`: {Responsibility}
- `{Module/Class 2}`: {Responsibility}

**Dependencies:** {What it depends on}

### {Component Name 2}
**Location:** `{path/to/component}`

**Purpose:** {What this component does}

**Key Modules/Classes:**
- `{Module/Class 1}`: {Responsibility}
- `{Module/Class 2}`: {Responsibility}

**Dependencies:** {What it depends on}

---

## Data Flow

{Describe the main data flow through the application}

### {Flow Name 1}
```
{Source} → {Processing Step 1} → {Processing Step 2} → {Destination}
```

**Details:** {Explanation of this flow}

### {Flow Name 2}
```
{Source} → {Processing Step 1} → {Processing Step 2} → {Destination}
```

**Details:** {Explanation of this flow}

---

## Dependencies

### Production Dependencies
{List major production dependencies}

| Dependency | Version | Purpose |
|------------|---------|---------|
| `{dep1}` | {version} | {usage} |
| `{dep2}` | {version} | {usage} |

### Development Dependencies
{List major development dependencies}

| Dependency | Version | Purpose |
|------------|---------|---------|
| `{dep1}` | {version} | {usage} |
| `{dep2}` | {version} | {usage} |

---

## Key Patterns and Conventions

### Architectural Patterns
- {Pattern 1}: {Description and usage}
- {Pattern 2}: {Description and usage}

### Code Conventions
- {Convention 1}: {Description}
- {Convention 2}: {Description}

### File Naming
- {Pattern 1}: {Description}
- {Pattern 2}: {Description}

---

## Development Workflow

### Build Process
```bash
{build command}
```

### Testing
```bash
{test command}
```

### Linting/Formatting
```bash
{lint/format command}
```

---

## Additional Notes

{Any additional important information about the project architecture}
