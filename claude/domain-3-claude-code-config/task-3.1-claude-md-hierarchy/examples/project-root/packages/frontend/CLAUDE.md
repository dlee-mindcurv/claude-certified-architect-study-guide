# Frontend Package Conventions

## React Components

- Use functional components exclusively; no class components
- Use React hooks for state management and side effects
- Extract custom hooks into `hooks/` directory when logic is reused
- Keep components focused: if a component exceeds 150 lines, split it

## Component Structure

- One component per file; file name matches component name (PascalCase)
- Use named exports, not default exports
- Component file order: imports, types, component function, helper functions
- Co-locate component, test, and styles:
  ```
  Button/
    Button.tsx
    Button.test.tsx
    index.ts
  ```

## Styling

- Use Tailwind CSS utility classes for all styling
- Do not use inline `style` props
- Do not use CSS modules or styled-components
- Extract repeated class combinations into Tailwind `@apply` directives in global CSS
- Use Tailwind responsive prefixes for responsive design (`sm:`, `md:`, `lg:`)

## Data Fetching

- Use React Query (TanStack Query) for all server state
- Define query keys in a centralized `queryKeys.ts` file
- Use custom hooks that wrap `useQuery`/`useMutation` for each API endpoint
- Handle loading, error, and empty states in all data-fetching components

## Testing

- All components must have a corresponding `.test.tsx` file
- Use React Testing Library; test behavior, not implementation
- Use `userEvent` over `fireEvent` for user interaction simulation
- Test accessibility: every interactive element must be reachable via keyboard

## State Management

- Use React Query for server state (API data)
- Use React Context for app-level UI state (theme, sidebar open/closed)
- Use `useState`/`useReducer` for component-local state
- Avoid prop drilling beyond 2 levels; use context or composition instead
