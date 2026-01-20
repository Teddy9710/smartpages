---
name: project-architect
description: Analyze codebase architecture and generate comprehensive markdown documentation. Use this skill when users ask to: (1) Document project architecture, (2) Analyze codebase structure, (3) Generate architecture overview, (4) Create technical documentation for a codebase, (5) Summarize project organization and components. Works with any programming language or framework.
---

# Project Architect

## Overview

Analyze the current codebase and generate comprehensive architecture documentation in markdown format. This skill explores the project structure, identifies the technology stack, documents core components and their relationships, and produces a well-formatted markdown file.

## Workflow

### Step 1: Explore Project Structure

Use the Task tool with `subagent_type=Explore` to analyze the codebase:

```
Explore the project structure and identify:
- Key directories and their purposes
- Main entry points
- Configuration files
- Test structure
- Documentation files
Set thoroughness to "medium"
```

**Why Task tool?** Architecture analysis is open-ended exploration requiring multiple rounds of globbing and grepping. The Explore agent is optimized for this type of codebase investigation.

### Step 2: Detect Technology Stack

Identify technologies from configuration files and code patterns:

**Check for:**
- `package.json`, `package-lock.json`, `yarn.lock` → Node.js/npm
- `requirements.txt`, `pyproject.toml`, `setup.py` → Python
- `pom.xml`, `build.gradle` → Java
- `go.mod` → Go
- `Cargo.toml` → Rust
- `composer.json` → PHP
- `Gemfile` → Ruby

**Framework detection:**
- Node.js: Look for React, Vue, Angular, Express, Next.js in dependencies
- Python: Look for Django, Flask, FastAPI in imports
- Java: Look for Spring in pom.xml/build.gradle

**Build tools:**
- Look for webpack, vite, rollup, tsconfig, etc.

### Step 3: Analyze Key Components

From the exploration results, identify:

1. **Core directories** - Main source code organization
2. **Entry points** - Application startup files
3. **Configuration** - Settings, environment files
4. **Tests** - Test structure and framework
5. **Documentation** - Existing docs location

### Step 4: Generate Architecture Document

Use the template in `assets/architecture-template.md` as the foundation.

**Fill in each section:**

1. **Project Overview** - Brief 1-2 sentence summary
2. **Technology Stack** - List all detected technologies with versions
3. **Project Structure** - Create tree diagram and table of directories
4. **Core Components** - Document main modules/classes found
5. **Data Flow** - If applicable, describe major data flows
6. **Dependencies** - List from package.json/requirements.txt/etc.
7. **Key Patterns** - Note any architectural patterns (MVC, microservices, etc.)
8. **Development Workflow** - Build, test, lint commands

**Output file:** Name the output file `{project-name}-architecture.md` or `ARCHITECTURE.md`

### Step 5: Review and Enhance

After generating the initial document:

- Verify all major directories are documented
- Check that the technology stack is complete
- Ensure the structure matches the actual codebase
- Add any missing critical components

**Quality checklist:**
- [ ] All top-level directories explained
- [ ] Main technologies and frameworks identified
- [ ] Entry points documented
- [ ] Build/test commands included
- [ ] Dependencies listed (at least major ones)
- [ ] Architecture patterns noted

## Template Usage

The `assets/architecture-template.md` file provides a structured format. When generating documentation:

1. Copy the template structure
2. Replace `{placeholders}` with actual project information
3. Adapt sections based on project type (e.g., remove "Data Flow" for simple libraries)
4. Keep the markdown formatting clean and consistent

## Adaptation Guidelines

**For different project types:**

- **Web Applications:** Focus on frontend/backend structure, API endpoints, database
- **Libraries/SDKs:** Emphasize public API, module organization, usage patterns
- **CLI Tools:** Document command structure, argument parsing, core commands
- **Mobile Apps:** Note platform-specific code, navigation structure, state management
- **Microservices:** Document service boundaries, communication protocols

**When information is unclear:**

- Make reasonable inferences based on file names and structure
- Note assumptions explicitly (e.g., "Appears to use MVC pattern based on controller/")
- When in doubt, ask the user for clarification

## Example Prompts That Trigger This Skill

- "Generate architecture documentation for this project"
- "Analyze the codebase structure and create a markdown doc"
- "Document the project architecture"
- "What's the structure of this codebase? Create a document."
- "Summarize this project's architecture in a markdown file"
