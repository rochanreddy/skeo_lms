import { clsx } from 'clsx';

/**
 * Merge conditional classes.
 *
 * This used to run the result through tailwind-merge so a caller's utility
 * could beat a conflicting default baked into a shadcn component. Only four
 * call sites ever relied on that, all of them overriding DialogContent's or
 * PopoverContent's box (`p-0`, `gap-0`, `border-0`, a z-index, a top offset).
 * Those declarations now sit on the components' own classes in styles.css,
 * which is unlayered and therefore outranks Tailwind's @layer utilities
 * unconditionally — a cascade rule, not a class-order coincidence.
 *
 * So the arbitration had nothing left to arbitrate, and 26.5 KB of it went
 * with it. If you add a component that needs a utility to defeat a shadcn
 * default, put the declaration in styles.css rather than bringing this back.
 */
export function cn(...inputs) {
  return clsx(inputs);
}
