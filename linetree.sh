#!/usr/bin/env bash
# linetree - Display files in a nested tree, ordered largest → smallest
# Folders first (by total size), then files (by size). Skips test files.
# Usage: linetree.sh [directory] [min_lines]
# Compatible with macOS Bash 3.2+

set -euo pipefail

dir="${1:-.}"
min_lines="${2:-0}"

if [[ ! -d "$dir" ]]; then
  echo "Error: '$dir' is not a directory" >&2
  exit 1
fi

clean_dir="${dir%/}"

# Use Python for the heavy lifting (sorting nested tree by size).
# macOS ships with python3 since Catalina.
python3 - "$clean_dir" "$min_lines" << 'PYEOF'
import sys, os, subprocess

root = sys.argv[1]
min_lines = int(sys.argv[2])

SKIP_DIRS = {'.git', 'node_modules', 'dist', 'public', '.DS_Store', '.kiro', '.vscode', '.github', '__pycache__'}

def is_test_file(name):
    lower = name.lower()
    return ('.test.' in lower or '.spec.' in lower
            or lower.startswith('test_') or lower.startswith('spec_')
            or lower.endswith('.test.ts') or lower.endswith('.spec.ts'))

def count_lines(filepath):
    try:
        with open(filepath, 'r', errors='replace') as f:
            return sum(1 for _ in f)
    except:
        return 0

def scan(dirpath):
    """Returns (subdirs, files) where each is a list of (name, lines, children_or_None)."""
    try:
        entries = sorted(os.listdir(dirpath))
    except PermissionError:
        return [], []

    subdirs = []  # (name, total_lines, sub_subdirs, sub_files)
    files = []    # (name, lines)

    for entry in entries:
        fullpath = os.path.join(dirpath, entry)
        if entry in SKIP_DIRS:
            continue
        if os.path.isdir(fullpath):
            # Skip __tests__ directories entirely
            if entry == '__tests__':
                continue
            child_dirs, child_files = scan(fullpath)
            total = sum(x[1] for x in child_dirs) + sum(x[1] for x in child_files)
            if child_dirs or child_files:
                subdirs.append((entry, total, child_dirs, child_files))
        elif os.path.isfile(fullpath):
            if is_test_file(entry):
                continue
            if entry == '.DS_Store':
                continue
            lines = count_lines(fullpath)
            if lines >= min_lines:
                files.append((entry, lines))

    # Sort: largest first
    subdirs.sort(key=lambda x: x[1], reverse=True)
    files.sort(key=lambda x: x[1], reverse=True)
    return subdirs, files

def render(subdirs, files, prefix="", is_root=False):
    items = []
    # Folders first, then files
    for d in subdirs:
        items.append(('dir', d))
    for f in files:
        items.append(('file', f))

    for idx, (kind, data) in enumerate(items):
        is_last = (idx == len(items) - 1)
        connector = "\u2514\u2500\u2500" if is_last else "\u251c\u2500\u2500"
        extension = "    " if is_last else "\u2502   "

        if kind == 'dir':
            name, total, child_dirs, child_files = data
            print(f"{prefix}{connector} {name}/ ({total})")
            render(child_dirs, child_files, prefix + extension)
        else:
            name, lines = data
            print(f"{prefix}{connector} {name} ({lines})")

subdirs, files = scan(root)
total_lines = sum(x[1] for x in subdirs) + sum(x[1] for x in files)
print(f"{os.path.basename(root) or root}/ ({total_lines})")
render(subdirs, files)
PYEOF