# 0033: Directory-scoped Git ignore filtering

The Files panel previously ran a repository-wide ignored-file listing for each directory request, then searched that list separately for every displayed entry. With E entries and I ignored paths this added E × I comparisons per request and repeated repository traversal when opening more folders.

Send only the requested directory's entries to `git check-ignore --stdin -z` and use a set for membership checks. Preserve tracked files that match ignore rules, literal filenames, nested-directory behavior, and the permissive fallback outside Git repositories. Listing and ignore filtering do not read file contents; previews remain bounded to the selected file.
