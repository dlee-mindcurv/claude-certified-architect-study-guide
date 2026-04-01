---
paths:
  - "src/components/**/*"
  - "**/*.tsx"
---

# React Component Conventions (Code Generation Scenario)

## Component Structure

- Use functional components with hooks; no class components
- One component per file; file name matches component name (PascalCase)
- Use named exports: `export function Button()` not `export default function Button()`
- Component prop types defined as an interface above the component:
  ```typescript
  interface ButtonProps {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
  }
  ```

## File Organization

- Co-locate component files:
  ```
  components/
    Button/
      Button.tsx          (component)
      Button.test.tsx     (tests)
      index.ts            (re-export)
  ```
- Barrel exports via `index.ts`: `export { Button } from "./Button"`

## Hooks

- Extract reusable logic into custom hooks in a `hooks/` directory
- Custom hooks must start with `use` prefix
- Keep hooks focused: one concern per hook
- Document hook parameters and return values with JSDoc

## Styling

- Use Tailwind CSS utility classes for all styling
- No inline `style` props, no CSS modules, no styled-components
- Extract repeated utility class combinations using Tailwind `@apply`
- Use responsive prefixes for responsive layouts (`sm:`, `md:`, `lg:`)

## Accessibility

- All interactive elements must be keyboard accessible
- Use semantic HTML elements (`button`, `nav`, `main`, `section`)
- Add `aria-label` to elements without visible text labels
- Ensure sufficient color contrast ratios

## State Management

- React Query for server state (API data)
- React Context for app-level UI state (theme, sidebar)
- useState/useReducer for component-local state
- Never prop drill beyond 2 levels; use composition or context

## Performance

- Use `React.memo()` for components that re-render with unchanged props
- Use `useMemo` for expensive computations
- Use `useCallback` for stable function references passed to children
- Lazy load routes and heavy components with `React.lazy()`
