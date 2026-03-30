#!/usr/bin/env bash
# linetree - Display files in a tree structure ordered by line count (shortest → longest)
# Usage: linetree.sh <directory> [min_lines]
# Compatible with macOS Bash 3.2+

set -euo pipefail

dir="${1:-.}"
min_lines="${2:-0}"

if [[ ! -d "$dir" ]]; then
  echo "Error: '$dir' is not a directory" >&2
  exit 1
fi

clean_dir="${dir%/}/"

# Collect sorted entries into arrays using a while-read loop (bash 3.2 safe)
counts=()
paths=()
while IFS=$'\t' read -r count filepath; do
  rel="${filepath#"$clean_dir"}"
  rel="${rel#./}"
  counts+=("$count")
  paths+=("$rel")
done < <(
  find "$dir" -type f \
    ! -path '*/.git/*' \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/public/*' \
    ! -path '*/.DS_Store' \
    -print0 \
  | xargs -0 wc -l 2>/dev/null \
  | grep -v ' total$' \
  | awk -v min="$min_lines" '{
      count = $1; $1 = ""; sub(/^ /, "", $0)
      if (count >= min) print count "\t" $0
    }' \
  | sort -n
)

total=${#paths[@]}
if [[ $total -eq 0 ]]; then
  echo "(no files with >= $min_lines lines)"
  exit 0
fi

echo "$clean_dir"

prev_parts=()

for (( i=0; i<total; i++ )); do
  IFS='/' read -ra parts <<< "${paths[$i]}"
  depth=${#parts[@]}

  # Find common prefix length with previous entry
  common=0
  prev_len=${#prev_parts[@]}
  while (( common < prev_len - 1 && common < depth - 1 )); do
    if [[ "${parts[$common]}" == "${prev_parts[$common]}" ]]; then
      (( common++ ))
    else
      break
    fi
  done

  # Print new directory levels
  for (( d=common; d<depth-1; d++ )); do
    indent=""
    for (( p=0; p<d; p++ )); do
      indent+="│   "
    done
    echo "${indent}├── ${parts[$d]}/"
  done

  # Build file indent
  indent=""
  for (( p=0; p<depth-1; p++ )); do
    indent+="│   "
  done

  # Check if next entry shares the same parent → pick ├── or └──
  connector="└──"
  if (( i + 1 < total )); then
    IFS='/' read -ra next_parts <<< "${paths[$((i+1))]}"
    if (( ${#next_parts[@]} == depth )); then
      same=true
      for (( k=0; k<depth-1; k++ )); do
        if [[ "${next_parts[$k]}" != "${parts[$k]}" ]]; then
          same=false; break
        fi
      done
      if $same; then connector="├──"; fi
    fi
  fi

  printf "%s%s %s (%d lines)\n" "$indent" "$connector" "${parts[$((depth-1))]}" "${counts[$i]}"
  prev_parts=("${parts[@]}")
done
