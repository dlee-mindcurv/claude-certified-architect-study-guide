# Task 2.5: Built-in Tool Selection

## Overview

Claude Code provides several built-in tools for interacting with the filesystem and shell.
Each tool is optimized for a specific purpose. Using the right tool for the right task improves
accuracy, speed, and context efficiency. The exam tests your ability to select the appropriate
built-in tool for a given task.

## The Built-in Tools

### Grep -- Content Search

**Purpose:** Search for patterns within file contents.

**Use when:**
- You know WHAT to search for (a string, regex pattern, function name, import)
- You need to find where something is used or defined
- You want to search across many files

**Supports:**
- Regular expressions
- File type filtering (`--type`)
- Glob filtering (`--glob`)
- Context lines (show lines before/after matches)
- Case-insensitive search

**Example tasks:**
- Find all files that import a specific module
- Find all TODO comments in the codebase
- Find all usages of a deprecated function
- Search for a specific error message

### Glob -- File Pattern Matching

**Purpose:** Find files by name pattern.

**Use when:**
- You know the file NAME or PATTERN but not the content
- You need to discover what files exist
- You want to find files by extension or naming convention

**Supports:**
- Standard glob patterns (`**/*.ts`, `src/**/*.test.*`)
- Recursive directory matching
- Results sorted by modification time

**Example tasks:**
- Find all TypeScript files in the project
- Find all test files
- Find all configuration files (package.json, tsconfig.json)
- Discover the file structure of a directory

### Read -- File Reading

**Purpose:** Read the contents of a specific file.

**Use when:**
- You know the exact file path
- You need to understand a file's full content
- You need to read specific line ranges in large files

**Supports:**
- Exact file path access
- Line number offsets and limits for large files
- Image and PDF reading
- Jupyter notebook reading

**Example tasks:**
- Read a configuration file to understand settings
- Examine a specific function implementation
- Read a README for project documentation
- Check the content of a migration file

### Write -- File Creation

**Purpose:** Create a new file or completely overwrite an existing file.

**Use when:**
- Creating a brand new file
- Completely rewriting a file's content

**Important:** Prefer Edit for modifications to existing files.

### Edit -- File Modification

**Purpose:** Make targeted changes to existing files using exact string replacement.

**Use when:**
- Modifying part of an existing file
- Adding, changing, or removing specific sections
- Refactoring code within a file

**Advantages over Write:**
- Only sends the diff, not the entire file
- Less error-prone for large files
- Clearer intent (what changed vs entire new content)

### Bash -- Shell Commands

**Purpose:** Execute arbitrary shell commands.

**Use when:**
- Running build tools, test runners, linters
- Git operations
- Installing packages
- Any operation that requires shell access
- Tasks that no other built-in tool covers

**Avoid for:**
- File searching (use Grep or Glob instead)
- File reading (use Read instead)
- File editing (use Edit instead)

## Decision Criteria

```
What do you need to do?
|
+-- Find files by NAME/PATTERN ---------> Glob
|
+-- Find content WITHIN files ----------> Grep
|
+-- Read a SPECIFIC file ---------------> Read
|
+-- Create a NEW file ------------------> Write
|
+-- Modify an EXISTING file ------------> Edit
|
+-- Run a COMMAND (build, test, git) ---> Bash
```

## Common Mistakes

| Mistake | Why It Is Wrong | Correct Tool |
|---------|----------------|--------------|
| Using Bash to `grep` | Grep tool is optimized for this | Grep |
| Using Bash to `cat` a file | Read tool handles this better | Read |
| Using Bash to `find` files | Glob tool is faster and cleaner | Glob |
| Using Write to modify one line | Edit sends only the diff | Edit |
| Using Grep when you need file names | Grep searches content, not names | Glob |
| Using Glob when you need content | Glob finds files, not content | Grep |

## Exam Tips

- Know each tool's primary purpose and when to use it
- Understand that Grep is for content, Glob is for file names
- Know that Edit is preferred over Write for modifying existing files
- Understand that Bash should be the last resort for file operations
- Be able to select the correct tool for a described task
