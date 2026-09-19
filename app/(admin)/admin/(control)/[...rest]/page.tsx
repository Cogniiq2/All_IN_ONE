import { notFound } from 'next/navigation';

/** Any unknown `/admin/…` path: authenticated (the layout ran) and then a 404 inside the shell. */
export default function ControlCatchAll(): never {
  notFound();
}
