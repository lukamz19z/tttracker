/**
 * Deprecated compatibility component.
 *
 * Project navigation is now rendered once by:
 * app/workspace/projects/[projectId]/layout.tsx
 *
 * Keeping this component as a no-op prevents older project pages from
 * rendering a second navigation strip while those pages are migrated.
 */
export default function ProjectNav() {
  return null;
}
